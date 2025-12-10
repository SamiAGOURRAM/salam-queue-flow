/**
 * Patient Get Appointments Tool
 * 
 * Gets a patient's appointments (past, current, and upcoming).
 * 
 * **Requires authentication** - patients can only view their own appointments,
 * staff can view appointments of patients in their clinic.
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getPatientService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { 
  ValidationError, 
  AuthorizationError,
} from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const PatientGetAppointmentsInputSchema = z.object({
  patientId: z
    .string()
    .uuid("Invalid patient ID format")
    .optional()
    .describe("Patient UUID (optional - defaults to authenticated user)"),
  
  status: z
    .enum(["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"])
    .optional()
    .describe("Filter by appointment status"),
  
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional()
    .describe("Filter appointments from this date (YYYY-MM-DD)"),
  
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional()
    .describe("Filter appointments up to this date (YYYY-MM-DD)"),
  
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of appointments to return"),
  
  upcomingOnly: z
    .boolean()
    .default(false)
    .describe("If true, only return upcoming appointments"),
});

type PatientGetAppointmentsInput = z.infer<typeof PatientGetAppointmentsInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const patientGetAppointmentsTool: Tool = {
  name: "patient_getAppointments",
  description: `Get a patient's appointments (past, current, and upcoming).

**Requires authentication** - users must be logged in.

Use this tool when users want to:
- View their appointment history
- Check upcoming appointments
- See past consultations

Parameters:
- patientId: Patient UUID (optional - defaults to logged-in user)
- status: Filter by status (optional)
- fromDate: Start date filter YYYY-MM-DD (optional)
- toDate: End date filter YYYY-MM-DD (optional)
- limit: Max results (default: 20, max: 100)
- upcomingOnly: If true, only return future appointments

Returns:
- List of appointments with clinic info, dates, status

Access control:
- Patients can only view their own appointments
- Staff can view appointments at their clinic`,
  inputSchema: {
    type: "object",
    properties: {
      patientId: {
        type: "string",
        description: "Patient UUID (optional)",
      },
      status: {
        type: "string",
        enum: ["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"],
        description: "Filter by status",
      },
      fromDate: {
        type: "string",
        description: "Start date (YYYY-MM-DD)",
      },
      toDate: {
        type: "string",
        description: "End date (YYYY-MM-DD)",
      },
      limit: {
        type: "number",
        description: "Max results (default: 20)",
        default: 20,
      },
      upcomingOnly: {
        type: "boolean",
        description: "Only return upcoming appointments",
        default: false,
      },
    },
    required: [],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface AppointmentInfo {
  id: string;
  clinicId: string;
  appointmentDate: string;
  scheduledTime?: string;
  status: string;
  appointmentType: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
}

interface PatientAppointmentsResult {
  success: boolean;
  patientId: string;
  appointments: AppointmentInfo[];
  total: number;
  filters: {
    status?: string;
    fromDate?: string;
    toDate?: string;
    upcomingOnly: boolean;
  };
}

// ============================================
// EXECUTOR
// Uses @queuemed/core PatientService
// ============================================

export async function executePatientGetAppointments(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<PatientAppointmentsResult> {
  // Require authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to view appointments. Please log in."
    );
  }

  // Validate input
  let params: PatientGetAppointmentsInput;
  try {
    params = PatientGetAppointmentsInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  // Determine patient ID
  let patientId = params.patientId;
  
  if (!patientId) {
    if (context.patientId) {
      patientId = context.patientId;
    } else if (context.userId) {
      patientId = context.userId;
    } else {
      throw new ValidationError(
        "Patient ID is required. Either provide patientId or authenticate as a patient."
      );
    }
  }

  // Authorization check
  if (context.role === "patient") {
    if (patientId !== context.patientId && patientId !== context.userId) {
      throw new AuthorizationError(
        "You can only view your own appointments."
      );
    }
  }

  logger.info("Getting patient appointments via @queuemed/core", {
    patientId,
    status: params.status,
    fromDate: params.fromDate,
    toDate: params.toDate,
    limit: params.limit,
    upcomingOnly: params.upcomingOnly,
    userId: context.userId,
    role: context.role,
  });

  // Get patient service from @queuemed/core
  const patientService = getPatientService();

  // Fetch appointments
  let appointments;
  
  if (params.upcomingOnly) {
    appointments = await patientService.getUpcomingAppointments(patientId, params.limit);
  } else {
    appointments = await patientService.getPatientAppointments(patientId, {
      status: params.status,
      fromDate: params.fromDate,
      toDate: params.toDate,
      limit: params.limit,
    });
  }

  logger.info("Patient appointments retrieved via @queuemed/core", {
    patientId,
    count: appointments.length,
  });

  return {
    success: true,
    patientId,
    appointments: appointments.map((apt: { id: string; clinicId: string; appointmentDate: string; scheduledTime?: string; status: string; appointmentType: string; queuePosition?: number; estimatedWaitTime?: number }) => ({
      id: apt.id,
      clinicId: apt.clinicId,
      appointmentDate: apt.appointmentDate,
      scheduledTime: apt.scheduledTime,
      status: apt.status,
      appointmentType: apt.appointmentType,
      queuePosition: apt.queuePosition,
      estimatedWaitTime: apt.estimatedWaitTime,
    })),
    total: appointments.length,
    filters: {
      status: params.status,
      fromDate: params.fromDate,
      toDate: params.toDate,
      upcomingOnly: params.upcomingOnly,
    },
  };
}


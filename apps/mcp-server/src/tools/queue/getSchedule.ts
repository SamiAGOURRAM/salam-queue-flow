/**
 * Queue Get Schedule Tool
 * 
 * Gets the daily schedule/queue for a staff member.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - One source of truth for business logic
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getQueueService, getBookingService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { 
  ValidationError, 
  AuthorizationError,
} from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const QueueGetScheduleInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional()
    .describe("Date to get schedule for (defaults to today)"),
  
  clinicId: z
    .string()
    .uuid("Invalid clinic ID format")
    .optional()
    .describe("Clinic UUID (defaults to staff's clinic)"),
});

type QueueGetScheduleInput = z.infer<typeof QueueGetScheduleInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const queueGetScheduleTool: Tool = {
  name: "queue_getSchedule",
  description: `Get the daily queue/schedule for a clinic.

**Requires staff authentication** - only clinic staff can view schedules.

Use this tool when staff want to:
- View today's appointments
- See the queue of waiting patients
- Plan their day

Parameters:
- date: Date in YYYY-MM-DD format (optional, defaults to today)
- clinicId: Clinic UUID (optional, defaults to authenticated user's clinic)

Returns:
- queueMode: "slotted" or "fluid"
- schedule: List of appointments with patient info and status
- summary: Counts of waiting, in-progress, completed appointments`,
  inputSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date (YYYY-MM-DD), defaults to today",
      },
      clinicId: {
        type: "string",
        description: "Clinic UUID (optional)",
      },
    },
    required: [],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface ScheduleEntry {
  appointmentId: string;
  queuePosition: number | null;
  status: string;
  scheduledTime?: string;
  appointmentType: string;
  patientName?: string;
  patientPhone?: string;
  estimatedWaitTime?: number;
}

interface QueueScheduleResult {
  success: boolean;
  date: string;
  clinicId: string;
  queueMode: "slotted" | "fluid";
  schedule: ScheduleEntry[];
  summary: {
    total: number;
    scheduled: number;
    checkedIn: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
}

// ============================================
// EXECUTOR
// Uses @queuemed/core services
// ============================================

export async function executeQueueGetSchedule(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<QueueScheduleResult> {
  // Require staff authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to view schedule. Please log in."
    );
  }

  if (context.role !== "staff" && context.role !== "clinic_owner" && context.role !== "admin") {
    throw new AuthorizationError(
      "Only clinic staff can view schedules."
    );
  }

  // Validate input
  let params: QueueGetScheduleInput;
  try {
    params = QueueGetScheduleInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  // Default to today if no date provided
  const targetDate = params.date || new Date().toISOString().split("T")[0];
  
  // Use provided clinic ID or context
  const clinicId = params.clinicId || context.clinicId;
  
  if (!clinicId) {
    throw new ValidationError(
      "Clinic ID is required. Either provide clinicId or authenticate as clinic staff."
    );
  }

  // Verify staff has access to this clinic
  if (context.clinicId && context.clinicId !== clinicId && context.role !== "admin") {
    throw new AuthorizationError(
      "You can only view schedules for your own clinic."
    );
  }

  logger.info("Getting queue schedule via @queuemed/core", {
    date: targetDate,
    clinicId,
    userId: context.userId,
    role: context.role,
  });

  // Get services from @queuemed/core
  const queueService = getQueueService();
  const bookingService = getBookingService();

  // Get queue mode for the date
  const queueMode = await bookingService.getQueueMode(clinicId, targetDate) || "slotted";

  // Fetch queue entries using the service
  const entries = await queueService.getQueueEntries(clinicId, targetDate);

  // Map to schedule format
  const schedule: ScheduleEntry[] = entries.map((entry: { id: string; queuePosition?: number; status: string; scheduledTime?: string; appointmentType: string; patientName?: string; patientPhone?: string; estimatedWaitTime?: number }) => ({
    appointmentId: entry.id,
    queuePosition: entry.queuePosition || null,
    status: entry.status,
    scheduledTime: entry.scheduledTime,
    appointmentType: entry.appointmentType,
    patientName: entry.patientName,
    patientPhone: entry.patientPhone,
    estimatedWaitTime: entry.estimatedWaitTime,
  }));

  // Calculate summary
  const summary = {
    total: schedule.length,
    scheduled: schedule.filter(s => s.status === "scheduled").length,
    checkedIn: schedule.filter(s => s.status === "checked_in").length,
    inProgress: schedule.filter(s => s.status === "in_progress").length,
    completed: schedule.filter(s => s.status === "completed").length,
    cancelled: schedule.filter(s => s.status === "cancelled").length,
    noShow: schedule.filter(s => s.status === "no_show").length,
  };

  logger.info("Schedule retrieved via @queuemed/core", {
    date: targetDate,
    clinicId,
    totalAppointments: schedule.length,
    queueMode,
  });

  return {
    success: true,
    date: targetDate,
    clinicId,
    queueMode,
    schedule,
    summary,
  };
}

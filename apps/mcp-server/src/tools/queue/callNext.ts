/**
 * Queue Call Next Tool
 * 
 * Calls the next patient in the queue.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - One source of truth for business logic
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getQueueService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { 
  ValidationError, 
  AuthorizationError,
} from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const QueueCallNextInputSchema = z.object({
  clinicId: z
    .string()
    .uuid("Invalid clinic ID format")
    .optional()
    .describe("Clinic UUID (defaults to staff's clinic)"),
  
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional()
    .describe("Date to call next patient for (defaults to today)"),
});

type QueueCallNextInput = z.infer<typeof QueueCallNextInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const queueCallNextTool: Tool = {
  name: "queue_callNext",
  description: `Call the next patient in the queue to start their consultation.

**Requires staff authentication** - only clinic staff can call patients.

Use this tool when staff want to:
- Call the next waiting patient
- Start a consultation
- Move queue forward

Parameters:
- clinicId: Clinic UUID (optional, defaults to staff's clinic)
- date: Date in YYYY-MM-DD format (optional, defaults to today)

Returns:
- calledPatient: Information about the patient being called
- remainingInQueue: Number of patients still waiting

Note: This will update the appointment status to "in_progress".`,
  inputSchema: {
    type: "object",
    properties: {
      clinicId: {
        type: "string",
        description: "Clinic UUID (optional)",
      },
      date: {
        type: "string",
        description: "Date (YYYY-MM-DD), defaults to today",
      },
    },
    required: [],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface CalledPatient {
  appointmentId: string;
  patientName?: string;
  patientPhone?: string;
  appointmentType: string;
  queuePosition: number | null;
  scheduledTime?: string;
}

interface QueueCallNextResult {
  success: boolean;
  calledPatient: CalledPatient | null;
  remainingInQueue: number;
  message: string;
}

// ============================================
// EXECUTOR
// Uses @queuemed/core QueueService
// ============================================

export async function executeQueueCallNext(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<QueueCallNextResult> {
  // Require staff authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to call patients. Please log in."
    );
  }

  if (context.role !== "staff" && context.role !== "clinic_owner" && context.role !== "admin") {
    throw new AuthorizationError(
      "Only clinic staff can call patients."
    );
  }

  // Validate input
  let params: QueueCallNextInput;
  try {
    params = QueueCallNextInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  // Use context clinic if not provided
  const clinicId = params.clinicId || context.clinicId;
  
  if (!clinicId) {
    throw new ValidationError(
      "Clinic ID is required. Either provide clinicId or authenticate as clinic staff."
    );
  }

  // Verify staff has access to this clinic
  if (context.clinicId && context.clinicId !== clinicId && context.role !== "admin") {
    throw new AuthorizationError(
      "You can only call patients in your own clinic."
    );
  }

  const targetDate = params.date || new Date().toISOString().split("T")[0];

  logger.info("Calling next patient via @queuemed/core", {
    clinicId,
    date: targetDate,
    userId: context.userId,
    role: context.role,
  });

  // Get queue service from @queuemed/core
  const queueService = getQueueService();

  // Get the staff ID from context
  const staffId = context.staffId || context.userId;
  
  if (!staffId) {
    throw new ValidationError("Staff ID is required to call patients.");
  }

  try {
    // Call next patient using the service
    const calledEntry = await queueService.callNextPatient({
      clinicId,
      staffId,
      appointmentDate: targetDate,
    });

    // Get remaining count
    const entries = await queueService.getQueueEntries(clinicId, targetDate);
    const remainingInQueue = entries.filter(
      (e: { status: string }) => e.status === "scheduled" || e.status === "checked_in"
    ).length;

    logger.info("Patient called successfully via @queuemed/core", {
      appointmentId: calledEntry.id,
      patientName: calledEntry.patientName,
      remainingInQueue,
    });

    return {
      success: true,
      calledPatient: {
        appointmentId: calledEntry.id,
        patientName: calledEntry.patientName,
        patientPhone: calledEntry.patientPhone,
        appointmentType: calledEntry.appointmentType,
        queuePosition: calledEntry.queuePosition || null,
        scheduledTime: calledEntry.scheduledTime,
      },
      remainingInQueue,
      message: `Now serving: ${calledEntry.patientName || "Patient"}. ${remainingInQueue} patient(s) remaining in queue.`,
    };
  } catch (error) {
    // If no patients in queue, return appropriate message
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("not found") || errorMessage.includes("No patients")) {
      return {
        success: false,
        calledPatient: null,
        remainingInQueue: 0,
        message: "No patients waiting in queue.",
      };
    }
    
    throw error;
  }
}

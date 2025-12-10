/**
 * Queue Get Position Tool
 * 
 * Gets a patient's current position in the queue.
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
  NotFoundError, 
  AuthorizationError,
} from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const QueueGetPositionInputSchema = z.object({
  appointmentId: z
    .string()
    .uuid("Invalid appointment ID format")
    .describe("UUID of the appointment to check queue position for"),
});

type QueueGetPositionInput = z.infer<typeof QueueGetPositionInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const queueGetPositionTool: Tool = {
  name: "queue_getPosition",
  description: `Get current queue position for an appointment.

**Requires authentication** - must be the patient or clinic staff.

Use this tool when users want to:
- Check their position in the waiting queue
- See estimated wait time
- Know how many people are ahead

Parameters:
- appointmentId: UUID of the appointment (required)

Returns:
- queuePosition: Current position (1 = next, 0 = being served)
- estimatedWaitMinutes: Predicted wait time
- status: Appointment status (waiting, in_progress, etc.)`,
  inputSchema: {
    type: "object",
    properties: {
      appointmentId: {
        type: "string",
        description: "Appointment UUID",
      },
    },
    required: ["appointmentId"],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface QueuePositionResult {
  success: boolean;
  appointmentId: string;
  queuePosition: number | null;
  estimatedWaitMinutes: number | null;
  status: string;
  appointmentDate: string;
  scheduledTime?: string;
  message: string;
}

// ============================================
// EXECUTOR
// Uses @queuemed/core QueueService
// ============================================

export async function executeQueueGetPosition(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<QueuePositionResult> {
  // Require authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to check queue position. Please log in."
    );
  }

  // Validate input
  let params: QueueGetPositionInput;
  try {
    params = QueueGetPositionInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  logger.info("Getting queue position via @queuemed/core", {
    appointmentId: params.appointmentId,
    userId: context.userId,
    role: context.role,
  });

  // Get queue service from @queuemed/core
  const queueService = getQueueService();

  // Fetch appointment using the service
  let appointment;
  try {
    appointment = await queueService.getQueueEntry(params.appointmentId);
  } catch (error) {
    throw new NotFoundError("Appointment", params.appointmentId);
  }

  // Check authorization
  const patientId = appointment.patientId;
  
  // Patients can only check their own appointments
  if (context.role === "patient") {
    if (patientId !== context.patientId && patientId !== context.userId) {
      throw new AuthorizationError(
        "You can only check queue position for your own appointments."
      );
    }
  }
  
  // Staff can only check appointments in their clinic
  if (context.role === "staff" || context.role === "clinic_owner") {
    if (appointment.clinicId !== context.clinicId) {
      throw new AuthorizationError(
        "You can only check appointments in your clinic."
      );
    }
  }

  // Build message based on status
  let message: string;
  const position = appointment.queuePosition;
  
  switch (appointment.status) {
    case "checked_in":
    case "scheduled":
      if (position === 1) {
        message = "You're next! Please be ready.";
      } else if (position) {
        message = `You are #${position} in the queue.`;
      } else {
        message = "Your appointment is scheduled. Check in when you arrive.";
      }
      break;
    case "in_progress":
      message = "Your consultation is in progress.";
      break;
    case "completed":
      message = "Your appointment has been completed.";
      break;
    case "cancelled":
      message = "This appointment has been cancelled.";
      break;
    case "no_show":
      message = "You were marked as no-show for this appointment.";
      break;
    default:
      message = `Current status: ${appointment.status}`;
  }

  logger.info("Queue position retrieved via @queuemed/core", {
    appointmentId: params.appointmentId,
    position: appointment.queuePosition,
    status: appointment.status,
  });

  return {
    success: true,
    appointmentId: params.appointmentId,
    queuePosition: appointment.queuePosition || null,
    estimatedWaitMinutes: appointment.estimatedWaitTime || null,
    status: appointment.status,
    appointmentDate: appointment.appointmentDate,
    scheduledTime: appointment.scheduledTime,
    message,
  };
}

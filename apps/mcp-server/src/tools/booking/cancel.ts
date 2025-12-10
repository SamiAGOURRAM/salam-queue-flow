/**
 * Booking Cancel Tool
 * 
 * Cancels an existing appointment.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - One source of truth for business logic
 * - QueueService handles cancellation
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

const BookingCancelInputSchema = z.object({
  appointmentId: z
    .string()
    .uuid("Invalid appointment ID format")
    .describe("UUID of the appointment to cancel"),
  
  reason: z
    .string()
    .max(500)
    .optional()
    .describe("Reason for cancellation (optional)"),
});

type BookingCancelInput = z.infer<typeof BookingCancelInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const bookingCancelTool: Tool = {
  name: "booking_cancel",
  description: `Cancel an existing appointment.

**Requires authentication** - users must be logged in.

Use this tool when users want to:
- Cancel a scheduled appointment
- Remove themselves from a queue

Access control:
- Patients can only cancel their own appointments
- Staff can cancel any appointment in their clinic

Parameters:
- appointmentId: UUID of the appointment (required)
- reason: Reason for cancellation (optional)

Returns confirmation of cancellation.`,
  inputSchema: {
    type: "object",
    properties: {
      appointmentId: {
        type: "string",
        description: "Appointment UUID to cancel",
      },
      reason: {
        type: "string",
        description: "Reason for cancellation",
      },
    },
    required: ["appointmentId"],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface BookingCancelResult {
  success: boolean;
  appointmentId: string;
  previousStatus: string;
  message: string;
}

// ============================================
// EXECUTOR
// Uses @queuemed/core QueueService
// ============================================

export async function executeBookingCancel(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<BookingCancelResult> {
  // Require authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to cancel appointments. Please log in first."
    );
  }

  // Validate input
  let params: BookingCancelInput;
  try {
    params = BookingCancelInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  logger.info("Cancelling appointment via @queuemed/core", {
    appointmentId: params.appointmentId,
    userId: context.userId,
    role: context.role,
    reason: params.reason,
  });

  // Get queue service from @queuemed/core
  const queueService = getQueueService();

  // Fetch the appointment to check authorization
  let appointment;
  try {
    appointment = await queueService.getQueueEntry(params.appointmentId);
  } catch (error) {
    throw new NotFoundError("Appointment", params.appointmentId);
  }

  // Check authorization
  const patientId = appointment.patientId;
  
  // Patients can only cancel their own appointments
  if (context.role === "patient") {
    if (patientId !== context.patientId && patientId !== context.userId) {
      throw new AuthorizationError(
        "You can only cancel your own appointments."
      );
    }
  }
  
  // Staff can only cancel appointments in their clinic
  if (context.role === "staff" || context.role === "clinic_owner") {
    if (appointment.clinicId !== context.clinicId) {
      throw new AuthorizationError(
        "You can only cancel appointments in your clinic."
      );
    }
  }

  // Check if appointment can be cancelled
  const nonCancellableStatuses = ["completed", "cancelled", "no_show"];
  if (nonCancellableStatuses.includes(appointment.status)) {
    throw new ValidationError(
      `Cannot cancel appointment with status '${appointment.status}'. ` +
      `Only scheduled, checked_in, or in_progress appointments can be cancelled.`
    );
  }

  const previousStatus = appointment.status;

  // Cancel the appointment using @queuemed/core
  await queueService.cancelAppointment(params.appointmentId, params.reason);

  logger.info("Appointment cancelled successfully via @queuemed/core", {
    appointmentId: params.appointmentId,
    previousStatus,
    cancelledBy: context.userId,
  });

  return {
    success: true,
    appointmentId: params.appointmentId,
    previousStatus,
    message: `Appointment successfully cancelled. Previous status was '${previousStatus}'.`,
  };
}

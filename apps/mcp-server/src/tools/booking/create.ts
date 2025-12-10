/**
 * Booking Create Tool
 * 
 * Creates a new appointment booking.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - No hardcoded values
 * - One source of truth for business logic
 * - Appointment types fetched from database
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBookingService, getClinicService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { 
  ValidationError, 
  AuthorizationError,
} from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// Note: appointmentType is now a free string since 
// types are clinic-specific and fetched from DB
// ============================================

const BookingCreateInputSchema = z.object({
  clinicId: z
    .string()
    .uuid("Invalid clinic ID format")
    .describe("UUID of the clinic to book at"),
  
  patientId: z
    .string()
    .uuid("Invalid patient ID format")
    .optional()
    .describe("Patient UUID (optional - defaults to authenticated user)"),
  
  appointmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .describe("Appointment date (YYYY-MM-DD)"),
  
  scheduledTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format")
    .optional()
    .describe("Time slot (HH:MM) - optional for fluid queue mode"),
  
  // NO HARDCODED ENUM - appointment types are clinic-specific
  appointmentType: z
    .string()
    .min(1, "Appointment type is required")
    .describe("Type of appointment (clinic-specific, use booking_getAvailability to see available types)"),
  
  reasonForVisit: z
    .string()
    .max(500)
    .optional()
    .describe("Brief description of reason for visit"),
});

type BookingCreateInput = z.infer<typeof BookingCreateInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const bookingCreateTool: Tool = {
  name: "booking_create",
  description: `Create a new appointment booking at a clinic.

**Requires authentication** - users must be logged in.

Use this tool when users want to:
- Book a new appointment
- Schedule a visit to a clinic
- Join a clinic's queue

**IMPORTANT**: Appointment types are clinic-specific. 
Use clinic_getInfo or booking_getAvailability first to see available types.

Parameters:
- clinicId: UUID of the clinic (required) - use clinic_search to find
- patientId: Patient UUID (optional - defaults to logged-in user)
- appointmentDate: Date in YYYY-MM-DD format (required)
- scheduledTime: Time in HH:MM format (required for slotted mode, optional for fluid)
- appointmentType: Type of visit (clinic-specific, not hardcoded)
- reasonForVisit: Brief description (optional)

Returns:
- appointmentId: UUID of created appointment
- queuePosition: Position in queue
- mode: "slotted" or "fluid"

Note: Use booking_getAvailability first to check available slots and appointment types.`,
  inputSchema: {
    type: "object",
    properties: {
      clinicId: {
        type: "string",
        description: "Clinic UUID",
      },
      patientId: {
        type: "string",
        description: "Patient UUID (optional)",
      },
      appointmentDate: {
        type: "string",
        description: "Date (YYYY-MM-DD)",
      },
      scheduledTime: {
        type: "string",
        description: "Time (HH:MM) - optional for fluid mode",
      },
      appointmentType: {
        type: "string",
        description: "Appointment type (clinic-specific - fetch from clinic_getInfo)",
      },
      reasonForVisit: {
        type: "string",
        description: "Reason for visit",
      },
    },
    required: ["clinicId", "appointmentDate", "appointmentType"],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface BookingCreateResult {
  success: boolean;
  appointmentId?: string;
  queuePosition?: number;
  mode: "slotted" | "fluid";
  appointmentDate: string;
  scheduledTime?: string;
  appointmentType: string;
  message: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Validate that the date is not in the past
 */
function validateFutureDate(dateStr: string): void {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (date < today) {
    throw new ValidationError("Cannot book appointments for past dates");
  }
}

// ============================================
// EXECUTOR
// Uses @queuemed/core BookingService
// ============================================

export async function executeBookingCreate(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<BookingCreateResult> {
  // Require authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to book appointments. Please log in first."
    );
  }

  // Validate input
  let params: BookingCreateInput;
  try {
    params = BookingCreateInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  // Validate date is not in the past
  validateFutureDate(params.appointmentDate);

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
  if (context.role === "patient" && patientId !== context.patientId && patientId !== context.userId) {
    throw new AuthorizationError(
      "Patients can only book appointments for themselves."
    );
  }

  logger.info("Creating booking via @queuemed/core", {
    clinicId: params.clinicId,
    patientId,
    date: params.appointmentDate,
    time: params.scheduledTime,
    type: params.appointmentType,
    userId: context.userId,
    role: context.role,
  });

  // Get services from @queuemed/core
  const bookingService = getBookingService();
  const clinicService = getClinicService();

  // Verify clinic exists using clinic service
  try {
    await clinicService.getClinic(params.clinicId);
  } catch (error) {
    throw new ValidationError(`Clinic not found: ${params.clinicId}`);
  }

  // Validate appointment type against clinic's available types
  const { appointmentTypes } = await bookingService.getClinicInfo(params.clinicId);
  const validTypes = appointmentTypes.map((t: { name: string }) => t.name.toLowerCase());
  
  if (!validTypes.includes(params.appointmentType.toLowerCase())) {
    throw new ValidationError(
      `Invalid appointment type '${params.appointmentType}'. ` +
      `Available types for this clinic: ${appointmentTypes.map((t: { name: string }) => t.name).join(", ")}`
    );
  }

  // Get queue mode using the service
  const mode = await bookingService.getQueueMode(params.clinicId, params.appointmentDate);

  // For slotted mode, time is required
  if (mode === "slotted" && !params.scheduledTime) {
    throw new ValidationError(
      "This clinic requires a specific time slot. Please provide scheduledTime parameter."
    );
  }

  // Book appointment using @queuemed/core BookingService
  // This is the SINGLE SOURCE OF TRUTH for booking logic
  const result = await bookingService.bookAppointmentForMode({
    clinicId: params.clinicId,
    patientId,
    appointmentDate: params.appointmentDate,
    scheduledTime: params.scheduledTime || null,
    appointmentType: params.appointmentType,
    reasonForVisit: params.reasonForVisit,
  });

  if (!result.success) {
    throw new ValidationError(result.error || "Failed to create appointment");
  }

  logger.info("Booking created successfully via @queuemed/core", {
    appointmentId: result.appointmentId,
    queuePosition: result.queuePosition,
    mode: mode || "slotted",
  });

  return {
    success: true,
    appointmentId: result.appointmentId,
    queuePosition: result.queuePosition,
    mode: mode || "slotted",
    appointmentDate: params.appointmentDate,
    scheduledTime: params.scheduledTime,
    appointmentType: params.appointmentType,
    message: mode === "fluid"
      ? `Appointment booked! You are #${result.queuePosition} in the queue for ${params.appointmentDate}.`
      : `Appointment booked for ${params.appointmentDate} at ${params.scheduledTime}. Queue position: #${result.queuePosition}`,
  };
}

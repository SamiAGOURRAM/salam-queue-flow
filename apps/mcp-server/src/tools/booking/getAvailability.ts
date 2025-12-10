/**
 * Booking Get Availability Tool
 * 
 * Gets available appointment slots for a clinic on a specific date.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - No hardcoded appointment types
 * - Appointment types fetched from clinic configuration
 * - One source of truth for business logic
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBookingService, getClinicService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// No hardcoded appointment type enum - fetched from clinic
// ============================================

const BookingGetAvailabilityInputSchema = z.object({
  clinicId: z
    .string()
    .uuid("Invalid clinic ID format - must be a valid UUID")
    .describe("The unique identifier (UUID) of the clinic"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .describe("The date to check availability for (YYYY-MM-DD)"),
  appointmentType: z
    .string()
    .optional()
    .describe("Type of appointment (clinic-specific, optional)"),
});

type BookingGetAvailabilityInput = z.infer<typeof BookingGetAvailabilityInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const bookingGetAvailabilityTool: Tool = {
  name: "booking_getAvailability",
  description: `Get available appointment slots for a clinic on a specific date.

Use this tool when users want to:
- Check available times for booking
- See if a clinic has openings on a specific day
- Plan when to book an appointment
- See what appointment types are available

Parameters:
- clinicId: UUID of the clinic (required) - use clinic_search to find this
- date: Date to check in YYYY-MM-DD format (required)
- appointmentType: Type of appointment (optional, clinic-specific)

Returns:
- In 'slotted' mode: List of time slots with availability status
- In 'fluid' mode: Confirmation that walk-in queue is open
- appointmentTypes: List of available appointment types for this clinic

Note: Use clinic_search first if you don't have the clinic ID.`,
  inputSchema: {
    type: "object",
    properties: {
      clinicId: {
        type: "string",
        description: "Clinic UUID",
      },
      date: {
        type: "string",
        description: "Date to check (YYYY-MM-DD)",
      },
      appointmentType: {
        type: "string",
        description: "Appointment type (clinic-specific, optional)",
      },
    },
    required: ["clinicId", "date"],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface AppointmentTypeInfo {
  name: string;
  label: string;
  duration: number;
}

interface AvailabilityResult {
  success: boolean;
  clinicId: string;
  clinicName?: string;
  date: string;
  mode: "fluid" | "slotted";
  available: boolean;
  message?: string;
  appointmentTypes: AppointmentTypeInfo[];
  slots?: Array<{
    time: string;
    available: boolean;
    remainingCapacity?: number;
  }>;
  summary?: {
    totalSlots: number;
    availableSlots: number;
    bookedSlots: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Validate that the date is not in the past
 */
function validateDate(dateStr: string): void {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (date < today) {
    throw new ValidationError("Cannot check availability for past dates");
  }
}

// ============================================
// EXECUTOR
// Uses @queuemed/core BookingService
// ============================================

export async function executeBookingGetAvailability(
  args: Record<string, unknown>,
  _context: AuthContext
): Promise<AvailabilityResult> {
  // Validate input
  let params: BookingGetAvailabilityInput;
  try {
    params = BookingGetAvailabilityInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  // Validate date is not in the past
  validateDate(params.date);

  logger.debug("Getting availability via @queuemed/core", {
    clinicId: params.clinicId,
    date: params.date,
    appointmentType: params.appointmentType,
  });

  // Get services from @queuemed/core
  const bookingService = getBookingService();
  const clinicService = getClinicService();

  // Step 1: Verify clinic exists using clinic service
  let clinic;
  try {
    clinic = await clinicService.getClinic(params.clinicId);
  } catch (error) {
    throw new NotFoundError("Clinic", params.clinicId);
  }

  // Step 2: Get clinic info including appointment types (NOT HARDCODED)
  const { appointmentTypes } = await bookingService.getClinicInfo(params.clinicId);

  // Step 3: Get available slots using the service (handles mode automatically)
  const slotsResponse = await bookingService.getAvailableSlotsForMode(
    params.clinicId,
    params.date,
    params.appointmentType
  );

  const mode = slotsResponse.mode || "slotted";

  logger.info("Availability check completed via @queuemed/core", {
    clinicId: params.clinicId,
    date: params.date,
    mode,
    totalSlots: slotsResponse.slots?.length || 0,
    availableSlots: slotsResponse.slots?.filter((s: { available: boolean }) => s.available).length || 0,
    appointmentTypesCount: appointmentTypes.length,
  });

  // Step 4: Return results based on mode
  if (mode === "fluid") {
    return {
      success: true,
      clinicId: params.clinicId,
      clinicName: clinic.name,
      date: params.date,
      mode: "fluid",
      available: true,
      appointmentTypes: appointmentTypes.map((t: { name: string; label: string; duration: number }) => ({
        name: t.name,
        label: t.label,
        duration: t.duration,
      })),
      message:
        `${clinic.name} uses a walk-in queue system. No time slot selection is required. ` +
        `Available appointment types: ${appointmentTypes.map((t: { label: string }) => t.label).join(", ")}.`,
    };
  }

  // Slotted mode - return time slots
  const slots = slotsResponse.slots || [];
  const availableSlots = slots.filter((s: { available: boolean }) => s.available);

  return {
    success: true,
    clinicId: params.clinicId,
    clinicName: clinic.name,
    date: params.date,
    mode: "slotted",
    available: availableSlots.length > 0,
    appointmentTypes: appointmentTypes.map((t: { name: string; label: string; duration: number }) => ({
      name: t.name,
      label: t.label,
      duration: t.duration,
    })),
    slots: slots.map((slot: { time: string; available: boolean }) => ({
      time: slot.time,
      available: slot.available,
    })),
    summary: {
      totalSlots: slots.length,
      availableSlots: availableSlots.length,
      bookedSlots: slots.length - availableSlots.length,
    },
  };
}

/**
 * Clinic Get Info Tool
 * 
 * Gets detailed information about a specific clinic.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - NO hardcoded appointment types
 * - Appointment types fetched from database
 * - One source of truth for business logic
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClinicService, getBookingService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const ClinicGetInfoInputSchema = z.object({
  clinicId: z
    .string()
    .uuid("Invalid clinic ID format - must be a valid UUID")
    .describe("The unique identifier (UUID) of the clinic"),
});

type ClinicGetInfoInput = z.infer<typeof ClinicGetInfoInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const clinicGetInfoTool: Tool = {
  name: "clinic_getInfo",
  description: `Get detailed information about a specific clinic.

Use this tool when users want to:
- View clinic details (address, phone, hours)
- Check clinic operating hours
- See available appointment types (DYNAMIC - fetched from clinic)
- Get clinic specialty information

Parameters:
- clinicId: UUID of the clinic (required)

Returns comprehensive clinic information including:
- Basic info (name, address, phone)
- Specialty and practice type
- Working hours
- Appointment types and durations (CLINIC-SPECIFIC, NOT HARDCODED)
- Operating mode (walk-in friendly, appointment only, etc.)`,
  inputSchema: {
    type: "object",
    properties: {
      clinicId: {
        type: "string",
        description: "Clinic UUID (e.g., '123e4567-e89b-12d3-a456-426614174000')",
      },
    },
    required: ["clinicId"],
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

interface ClinicInfoResult {
  success: boolean;
  clinic: {
    id: string;
    name: string;
    specialty?: string;
    address?: string;
    city?: string;
    phoneNumber?: string;
    email?: string;
    settings?: {
      defaultSlotDuration?: number;
      maxDailyAppointments?: number;
      workingHours?: {
        start: string;
        end: string;
      };
      queueMode?: string;
    };
    appointmentTypes: AppointmentTypeInfo[];
  };
}

// ============================================
// EXECUTOR
// Uses @queuemed/core services
// ============================================

export async function executeClinicGetInfo(
  args: Record<string, unknown>,
  _context: AuthContext
): Promise<ClinicInfoResult> {
  // Validate input
  let params: ClinicGetInfoInput;
  try {
    params = ClinicGetInfoInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  logger.debug("Getting clinic info via @queuemed/core", { clinicId: params.clinicId });

  // Get services from @queuemed/core
  const clinicService = getClinicService();
  const bookingService = getBookingService();

  // Fetch clinic details
  let clinic;
  try {
    clinic = await clinicService.getClinic(params.clinicId);
  } catch (error) {
    throw new NotFoundError("Clinic", params.clinicId);
  }

  // Fetch appointment types from database (NOT HARDCODED)
  const { appointmentTypes } = await bookingService.getClinicInfo(params.clinicId);

  logger.info("Clinic info retrieved via @queuemed/core", {
    clinicId: params.clinicId,
    appointmentTypesCount: appointmentTypes.length,
  });

  return {
    success: true,
    clinic: {
      id: clinic.id,
      name: clinic.name,
      specialty: clinic.specialty,
      address: clinic.address,
      city: clinic.city,
      phoneNumber: clinic.phoneNumber,
      email: clinic.email,
      settings: clinic.settings ? {
        defaultSlotDuration: clinic.settings.defaultSlotDuration,
        maxDailyAppointments: clinic.settings.maxDailyAppointments,
        workingHours: clinic.settings.workingHours,
        queueMode: clinic.settings.queueMode || undefined,
      } : undefined,
      // APPOINTMENT TYPES FROM DATABASE - NOT HARDCODED
      appointmentTypes: appointmentTypes.map((t: { name: string; label: string; duration: number }) => ({
        name: t.name,
        label: t.label,
        duration: t.duration,
      })),
    },
  };
}

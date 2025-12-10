/**
 * Clinic Search Tool
 * 
 * Searches for healthcare clinics in Morocco.
 * 
 * **REFACTORED**: Now uses @queuemed/core services
 * - One source of truth for business logic
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClinicService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { ValidationError } from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const ClinicSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe("Search term (clinic name, doctor name)"),
  city: z
    .string()
    .max(50)
    .optional()
    .describe("Filter by city (e.g., 'Casablanca', 'Rabat', 'Marrakech')"),
  specialty: z
    .string()
    .max(50)
    .optional()
    .describe("Filter by medical specialty (e.g., 'Dermatologie', 'Cardiologie')"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of results (default: 10)"),
});

type ClinicSearchInput = z.infer<typeof ClinicSearchInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const clinicSearchTool: Tool = {
  name: "clinic_search",
  description: `Search for healthcare clinics in Morocco.

Use this tool when users want to:
- Find clinics by name
- Find clinics in a specific city
- Find clinics by medical specialty
- Discover healthcare providers

Parameters:
- query: Search term for clinic/doctor name (optional)
- city: City name to filter by (optional)
- specialty: Medical specialty to filter by (optional)  
- limit: Max results to return (1-50, default 10)

Returns a list of active clinics with their details.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search term (clinic name, doctor name)",
      },
      city: {
        type: "string", 
        description: "City name (e.g., 'Casablanca', 'Rabat')",
      },
      specialty: {
        type: "string",
        description: "Medical specialty (e.g., 'Dermatologie', 'Cardiologie')",
      },
      limit: {
        type: "number",
        description: "Maximum results (default: 10)",
        default: 10,
      },
    },
    required: [],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface ClinicSearchResult {
  success: boolean;
  count: number;
  clinics: Array<{
    id: string;
    name: string;
    specialty?: string;
    city?: string;
    address?: string;
    phoneNumber?: string;
  }>;
  filters: {
    query?: string;
    city?: string;
    specialty?: string;
  };
}

// ============================================
// EXECUTOR
// Uses @queuemed/core ClinicService
// ============================================

export async function executeClinicSearch(
  args: Record<string, unknown>,
  _context: AuthContext
): Promise<ClinicSearchResult> {
  // Validate input
  let params: ClinicSearchInput;
  try {
    params = ClinicSearchInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  logger.debug("Searching clinics via @queuemed/core", { params });

  // Get clinic service from @queuemed/core
  const clinicService = getClinicService();

  // Search using the core service
  const clinics = await clinicService.searchClinics({
    city: params.city,
    specialty: params.specialty,
    name: params.query,
    limit: params.limit,
  });

  logger.info("Clinic search completed via @queuemed/core", {
    resultCount: clinics.length,
    filters: params,
  });

  return {
    success: true,
    count: clinics.length,
    clinics: clinics.map((clinic: { id: string; name: string; specialty?: string; city?: string; address?: string; phoneNumber?: string }) => ({
      id: clinic.id,
      name: clinic.name,
      specialty: clinic.specialty,
      city: clinic.city,
      address: clinic.address,
      phoneNumber: clinic.phoneNumber,
    })),
    filters: {
      query: params.query,
      city: params.city,
      specialty: params.specialty,
    },
  };
}

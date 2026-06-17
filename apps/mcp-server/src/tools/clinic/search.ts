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
import type { AuthContext } from "@queuemed/core";
import { buildBookingHref, type DiscoveryCards, type ClinicCardItem, type Clinic } from "@queuemed/core";

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

Returns a list of active clinics with their details.`,
  // NOTE: `limit` is intentionally NOT advertised to LLM callers — the model
  // tends to emit it as a string ("10"), which strict tool-call validators
  // (e.g. Groq) reject. The Zod schema still applies its default(10).
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
  /**
   * Structured, renderable card payload (Phase 2). Present only when there is
   * at least one result — a zero-result search omits it (NonEmptyArray contract).
   * Additive: the `clinics` array above stays the text/JSON fallback until the
   * chat transport renders cards (Phase 4).
   */
  cards?: DiscoveryCards;
}

// ============================================
// CARD MAPPING (pure — unit-tested without a DB)
// ============================================

/**
 * The public clinic fields the card payload needs — derived from the canonical
 * `Clinic` (single source of truth). Using `Pick` means a rename/removal in
 * `Clinic` breaks here loudly instead of silently drifting, while still asking
 * for only the fields a card uses (so tests need not build a full `Clinic`).
 */
type ClinicRow = Pick<Clinic, "id" | "name" | "specialty" | "city" | "address" | "phoneNumber">;

function toClinicCard(clinic: ClinicRow): ClinicCardItem {
  return {
    clinicId: clinic.id,
    name: clinic.name,
    specialty: clinic.specialty,
    city: clinic.city,
    address: clinic.address,
    phoneNumber: clinic.phoneNumber,
    // SECURITY: the deep link is minted in code, never by the model (branded type).
    bookingHref: buildBookingHref({ clinicId: clinic.id }),
  };
}

/**
 * Build the discovery card payload from search results.
 * Returns `undefined` for an empty result set — a zero-card payload is not valid
 * (the `DiscoveryCards.items` contract is a `NonEmptyArray`). Non-emptiness is
 * proven by control flow (the `first` guard), so no type assertion is needed.
 */
export function buildClinicCards(clinics: ClinicRow[]): DiscoveryCards | undefined {
  const [first, ...rest] = clinics.map(toClinicCard);
  if (!first) return undefined;
  return { kind: "clinic_cards", items: [first, ...rest] };
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
    clinics: clinics.map((clinic) => ({
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
    cards: buildClinicCards(clinics),
  };
}

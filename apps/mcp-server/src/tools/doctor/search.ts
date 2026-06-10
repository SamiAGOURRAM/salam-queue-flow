/**
 * Doctor Search Tool
 *
 * Patient-facing discovery of individual providers (doctors) across active
 * clinics, returning a structured `doctor_cards` payload with a code-minted
 * booking deep-link and the clinic's next available slot.
 *
 * Backend logic lives in @queuemed/core (ClinicService.searchDoctors +
 * BookingService.getNextAvailableSlot); this tool composes them and maps to cards.
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClinicService, getBookingService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { ValidationError } from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";
import {
  buildBookingHref,
  type DiscoveryCards,
  type DoctorCardItem,
  type DoctorListing,
  type NextAvailableSlot,
} from "@queuemed/core";

// ============================================
// INPUT SCHEMA
// ============================================

const DoctorSearchInputSchema = z.object({
  query: z.string().min(1).max(100).optional().describe("Provider name to search for"),
  city: z.string().max(50).optional().describe("Filter by city (e.g., 'Casablanca')"),
  specialty: z.string().max(50).optional().describe("Filter by medical specialty (e.g., 'Dermatologie')"),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results (default: 10)"),
});

type DoctorSearchInput = z.infer<typeof DoctorSearchInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const doctorSearchTool: Tool = {
  name: "doctor_search",
  description: `Search for individual doctors/providers in Morocco.

Use this tool when users want to:
- Find doctors by name
- Find doctors in a specific city
- Find doctors by medical specialty
- See a provider's clinic and next available slot

Parameters:
- query: Provider name to search for (optional)
- city: City name to filter by (optional)
- specialty: Medical specialty to filter by (optional)
- limit: Max results to return (1-50, default 10)

Returns active providers with their clinic and next available appointment slot.`,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Provider name to search for" },
      city: { type: "string", description: "City name (e.g., 'Casablanca')" },
      specialty: { type: "string", description: "Medical specialty (e.g., 'Dermatologie')" },
      limit: { type: "number", description: "Maximum results (default: 10)", default: 10 },
    },
    required: [],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface DoctorSearchResult {
  success: boolean;
  count: number;
  doctors: DoctorListing[];
  /**
   * Structured card payload. Present only when there is at least one result
   * (NonEmptyArray contract). Additive: `doctors` above is the text fallback
   * until the chat transport renders cards (Phase 4).
   */
  cards?: DiscoveryCards;
}

// ============================================
// CARD MAPPING (pure — unit-tested without a DB)
// ============================================

function toDoctorCard(d: DoctorListing, slotByClinic: Map<string, NextAvailableSlot | null>): DoctorCardItem {
  return {
    doctorId: d.staffId,
    fullName: d.fullName,
    specialization: d.specialization,
    clinicId: d.clinicId,
    clinicName: d.clinicName,
    city: d.city,
    nextAvailableSlot: slotByClinic.get(d.clinicId) ?? undefined,
    // SECURITY: the deep link is minted in code, never by the model (branded type).
    bookingHref: buildBookingHref({ clinicId: d.clinicId, staffId: d.staffId }),
  };
}

/**
 * Build the doctor-card payload. Returns `undefined` for an empty result set
 * (the `DiscoveryCards.items` contract is a `NonEmptyArray`). Non-emptiness is
 * proven by control flow, so no type assertion is needed.
 */
export function buildDoctorCards(
  doctors: DoctorListing[],
  slotByClinic: Map<string, NextAvailableSlot | null>,
): DiscoveryCards | undefined {
  const [first, ...rest] = doctors.map((d) => toDoctorCard(d, slotByClinic));
  if (!first) return undefined;
  return { kind: "doctor_cards", items: [first, ...rest] };
}

// ============================================
// EXECUTOR
// ============================================

export async function executeDoctorSearch(
  args: Record<string, unknown>,
  _context: AuthContext,
): Promise<DoctorSearchResult> {
  let params: DoctorSearchInput;
  try {
    params = DoctorSearchInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`);
    }
    throw error;
  }

  logger.debug("Searching doctors via @queuemed/core", { params });

  const clinicService = getClinicService();
  const bookingService = getBookingService();

  const doctors = await clinicService.searchDoctors({
    city: params.city,
    specialty: params.specialty,
    name: params.query,
    limit: params.limit,
  });

  // Next available slot is clinic+date level, so compute ONCE per unique clinic
  // (deduped) and share across that clinic's doctors — avoids an N+1 scan.
  // Civil "today" in the clinic market's timezone (not UTC) so the next-slot scan
  // anchors on the right day around midnight. `en-CA` formats as YYYY-MM-DD;
  // `Africa/Casablanca` tracks Morocco's civil offset (incl. Ramadan shifts).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
  const slotByClinic = new Map<string, NextAvailableSlot | null>();
  for (const clinicId of new Set(doctors.map((d) => d.clinicId))) {
    slotByClinic.set(clinicId, await bookingService.getNextAvailableSlot(clinicId, today));
  }

  logger.info("Doctor search completed via @queuemed/core", {
    resultCount: doctors.length,
    uniqueClinics: slotByClinic.size,
    filters: params,
  });

  return {
    success: true,
    count: doctors.length,
    doctors,
    cards: buildDoctorCards(doctors, slotByClinic),
  };
}

/**
 * Discovery Card Contract
 *
 * The typed payload that patient-facing discovery tools return and the chat UI
 * renders as clickable doctor/clinic cards. One source of truth shared by the
 * MCP server (produces it), chat-api (streams it), and the web (renders it).
 *
 * Phase 1 of the MCP patient-discovery-cards feature: contract only — no tool
 * logic, no UI, no transport. See .claude/PRPs/plans/completed/mcp-discovery-card-contract.plan.md
 */

/**
 * Non-empty array — a discovery result with zero cards is not a valid card
 * payload; tools must handle "no results" explicitly rather than emit `[]`.
 */
export type NonEmptyArray<T> = readonly [T, ...T[]];

declare const __bookingHref: unique symbol;
/**
 * A booking deep link. Branded so it can ONLY be produced by `buildBookingHref`
 * — a model-authored or hand-written `string` will not satisfy this type. This
 * turns the "never let the model author booking links" rule into a compile-time
 * guarantee instead of a comment.
 */
export type BookingHref = string & { readonly [__bookingHref]: true };

export interface ClinicCardItem {
  readonly clinicId: string;
  readonly name: string;
  readonly specialty?: string;
  readonly city?: string;
  readonly address?: string;
  readonly phoneNumber?: string;
  /** Code-generated deep link into the booking flow. */
  readonly bookingHref: BookingHref;
}

/**
 * The next bookable opportunity at a clinic. Discriminated so a consumer (the
 * Phase-4 card renderer) can never confuse a concrete slotted time with a
 * fluid/queue walk-in day — a plain string conflated the two and a renderer
 * doing `new Date(s)` or `s.split("T")[1]` would silently misbehave on one form.
 */
export type NextAvailableSlot =
  | { readonly kind: "datetime"; readonly value: string } // ISO `YYYY-MM-DDTHH:mm` — a specific slotted time
  | { readonly kind: "day"; readonly value: string };      // `YYYY-MM-DD` — fluid/queue day, no fixed time

export interface DoctorCardItem {
  /** The staff/provider id — passed as ?staffId to preselect the doctor. */
  readonly doctorId: string;
  readonly fullName: string;
  readonly specialization?: string;
  readonly clinicId: string;
  readonly clinicName: string;
  readonly city?: string;
  /** Next bookable opportunity; absent when none was found within the scan window. */
  readonly nextAvailableSlot?: NextAvailableSlot;
  /** Code-generated deep link into the booking flow. */
  readonly bookingHref: BookingHref;
}

/**
 * Discriminated union of card payloads a discovery tool can return.
 * `kind` narrows `items` to the matching card type; `items` is non-empty.
 */
export type DiscoveryCards =
  | { readonly kind: "doctor_cards"; readonly items: NonEmptyArray<DoctorCardItem> }
  | { readonly kind: "clinic_cards"; readonly items: NonEmptyArray<ClinicCardItem> };

export interface BookingHrefParams {
  readonly clinicId: string;
  /** Staff/provider id to preselect a doctor in the booking flow. */
  readonly staffId?: string;
}

/**
 * Build the deep link into the booking flow: `/booking/:clinicId?staffId=...`.
 *
 * SECURITY: this is the ONLY place a `BookingHref` is produced. Booking links
 * must be generated here, in code — never returned by the model. The branded
 * return type enforces this: a raw string cannot be assigned to a
 * `bookingHref` field.
 *
 * NOTE: `clinicId` and `staffId` are passed positionally by key; callers must
 * not swap them (branded IDs would enforce this — deferred to Phase 2).
 */
export function buildBookingHref({ clinicId, staffId }: BookingHrefParams): BookingHref {
  const base = `/booking/${encodeURIComponent(clinicId)}`;
  const href = staffId ? `${base}?staffId=${encodeURIComponent(staffId)}` : base;
  return href as BookingHref;
}

/**
 * Auth Eval Suite — Deterministic RBAC Matrix (PRP Phase 5)
 *
 * Cross-role tool access is a SECURITY property: a patient (or anonymous)
 * caller must NEVER reach a staff/owner/admin tool. "Never" cannot be proven
 * by LLM sampling — it is a deterministic function of `canAccessTool` /
 * `assertToolAccess`. This suite exercises those functions over every
 * registered tool × every role against a hand-written expected matrix.
 *
 * The EXPECTED_ACCESS matrix below is authored independently of
 * `TOOL_PERMISSIONS` (it is NOT derived from it). That is the point: if
 * someone edits the permission map and silently widens patient access, the
 * matrix disagrees and this suite fails. It is the drift lock on the wall.
 *
 * In-process only: synthetic AuthContexts, no network/Supabase. Denial in
 * `executeToolCall` happens BEFORE the executor runs, so the live denial
 * checks never touch the data layer.
 */

import { describe, it, expect } from "vitest";
import { canAccessTool, assertToolAccess } from "./roleGuard.js";
import { ANONYMOUS_CONTEXT } from "./types.js";
import type { AuthContext, UserRole } from "./types.js";
import { AuthorizationError } from "../../utils/errors.js";
import { registerTools, executeToolCall } from "../../tools/index.js";

// ============================================
// SYNTHETIC CALLERS (no network)
// ============================================

type Caller = "anonymous" | UserRole;

const CALLERS: Caller[] = ["anonymous", "patient", "staff", "clinic_owner", "admin"];

function ctx(caller: Caller): AuthContext {
  if (caller === "anonymous") return ANONYMOUS_CONTEXT;
  return {
    userId: `user-${caller}`,
    role: caller,
    clinicId: "clinic-1",
    permissions: ["public"],
    isAuthenticated: true,
  };
}

// ============================================
// EXPECTED ACCESS MATRIX (hand-authored drift lock)
//
// true  = this caller MUST be allowed to invoke this tool
// false = this caller MUST be denied
//
// Order of columns: anonymous, patient, staff, clinic_owner, admin
// ============================================

type Row = Record<Caller, boolean>;

const PUBLIC: Row = { anonymous: true, patient: true, staff: true, clinic_owner: true, admin: true };
const AUTHED: Row = { anonymous: false, patient: true, staff: true, clinic_owner: true, admin: true };
const PATIENT: Row = { anonymous: false, patient: true, staff: true, clinic_owner: true, admin: true };
const STAFF: Row = { anonymous: false, patient: false, staff: true, clinic_owner: true, admin: true };

const EXPECTED_ACCESS: Record<string, Row> = {
  // Public discovery (Phases 2–3) — anyone, incl. anonymous
  clinic_search: PUBLIC,
  clinic_getInfo: PUBLIC,
  doctor_search: PUBLIC,
  booking_getAvailability: PUBLIC,

  // Authenticated — any logged-in user
  booking_create: AUTHED,
  booking_cancel: AUTHED,

  // Patient-level — patient or higher
  queue_getPosition: PATIENT,
  patient_getProfile: PATIENT,
  patient_getAppointments: PATIENT,
  ml_estimateWaitTime: PATIENT,

  // Staff-level — patient/anonymous MUST be walled out
  queue_getSchedule: STAFF,
  queue_callNext: STAFF,
};

// Tools that a patient (the chat's primary user) must never reach — the hard rule.
const STAFF_ONLY_TOOLS = ["queue_getSchedule", "queue_callNext"] as const;

// ============================================
// COVERAGE GUARD — no registered tool escapes the matrix
// ============================================

describe("RBAC eval — coverage", () => {
  it("every registered tool has an expected-access row (no untested tool)", () => {
    const registered = registerTools().map((t) => t.name).sort();
    const covered = Object.keys(EXPECTED_ACCESS).sort();
    expect(covered).toEqual(registered);
  });
});

// ============================================
// canAccessTool — full matrix
// ============================================

describe("RBAC eval — canAccessTool matrix", () => {
  for (const [tool, row] of Object.entries(EXPECTED_ACCESS)) {
    for (const caller of CALLERS) {
      const verb = row[caller] ? "ALLOWS" : "DENIES";
      it(`${verb} ${caller} → ${tool}`, () => {
        expect(canAccessTool(ctx(caller), tool)).toBe(row[caller]);
      });
    }
  }
});

// ============================================
// assertToolAccess — throws iff denied
// ============================================

describe("RBAC eval — assertToolAccess throws on denial", () => {
  for (const [tool, row] of Object.entries(EXPECTED_ACCESS)) {
    for (const caller of CALLERS) {
      if (row[caller]) {
        it(`does NOT throw for allowed ${caller} → ${tool}`, () => {
          expect(() => assertToolAccess(ctx(caller), tool)).not.toThrow();
        });
      } else {
        it(`throws AuthorizationError for denied ${caller} → ${tool}`, () => {
          expect(() => assertToolAccess(ctx(caller), tool)).toThrow(AuthorizationError);
        });
      }
    }
  }
});

// ============================================
// SECURITY INVARIANT — the hard rule, stated explicitly
// ============================================

describe("RBAC eval — patient/anonymous cannot reach staff tools", () => {
  for (const tool of STAFF_ONLY_TOOLS) {
    it(`anonymous denied → ${tool}`, () => {
      expect(canAccessTool(ANONYMOUS_CONTEXT, tool)).toBe(false);
    });
    it(`patient denied → ${tool}`, () => {
      expect(canAccessTool(ctx("patient"), tool)).toBe(false);
    });
  }

  it("unknown tool is denied by default (deny-by-default)", () => {
    expect(canAccessTool(ctx("admin"), "totally_made_up_tool")).toBe(false);
  });
});

// ============================================
// LIVE DENIAL — executeToolCall blocks before the executor (no network)
//
// Only DENIED combos are exercised live: denial precedes the executor, so
// no Supabase call is made. Allowed combos would hit the data layer and are
// covered above via canAccessTool/assertToolAccess instead.
// ============================================

describe("RBAC eval — executeToolCall enforces denial", () => {
  for (const [tool, row] of Object.entries(EXPECTED_ACCESS)) {
    for (const caller of CALLERS) {
      if (row[caller]) continue;
      it(`returns AUTHORIZATION_ERROR for ${caller} → ${tool}`, async () => {
        const res = await executeToolCall(tool, {}, ctx(caller));
        expect(res.isError).toBe(true);
        const payload = JSON.parse(res.content[0].text);
        expect(payload.success).toBe(false);
        expect(payload.error.code).toBe("AUTHORIZATION_ERROR");
      });
    }
  }
});

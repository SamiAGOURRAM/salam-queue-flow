/**
 * Authentication Service
 *
 * Validates JWT tokens from Supabase Auth and builds auth context.
 * Delegates to SupabaseAuthAdapter which implements the IAuthService port
 * from @queuemed/core.
 *
 * Module-level functions are preserved for backward compatibility.
 * To swap auth providers, replace the adapter instantiation below.
 */

import { getSupabaseClient } from "../../adapters/supabase/client.js";
import { SupabaseAuthAdapter } from "../../adapters/auth/SupabaseAuthAdapter.js";
import type { AuthContext } from "@queuemed/core";

// ============================================
// ADAPTER INSTANTIATION (lazy — avoids module-init failures in test env)
// ============================================
// To switch auth providers (e.g., Hanko, Auth0):
//   1. Create a new adapter implementing IAuthService
//   2. Replace this line with the new adapter
//   3. No other code changes needed.
function getAdapter(): SupabaseAuthAdapter {
  return new SupabaseAuthAdapter(getSupabaseClient());
}

// ============================================
// PUBLIC API (backward-compatible function exports)
// ============================================

/**
 * Validate a JWT token and build auth context
 */
export async function validateToken(token: string): Promise<AuthContext> {
  return getAdapter().validateToken(token);
}

/**
 * Create auth context from request metadata
 */
export async function createAuthContextFromMeta(
  meta: Record<string, unknown> | undefined
): Promise<AuthContext> {
  return getAdapter().createAuthContextFromMeta(meta);
}

/**
 * Verify that the user has access to a specific clinic
 */
export function verifyClinicAccess(
  context: AuthContext,
  clinicId: string
): boolean {
  // Admins have access to all clinics
  if (context.role === "admin") {
    return true;
  }

  // Staff/owners must belong to the clinic
  if (context.clinicId && context.clinicId === clinicId) {
    return true;
  }

  return false;
}

/**
 * Verify that the user has access to a specific patient's data
 */
export function verifyPatientAccess(
  context: AuthContext,
  patientId: string
): boolean {
  // Admins have access to all patients
  if (context.role === "admin") {
    return true;
  }

  // Staff/owners can access patients in their clinic
  // (This would need additional check against appointment data)
  if (context.role === "staff" || context.role === "clinic_owner") {
    return true; // Simplified - in production, verify clinic association
  }

  // Patients can only access their own data
  if (context.patientId === patientId) {
    return true;
  }

  return false;
}

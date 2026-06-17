/**
 * Authentication Types
 *
 * Re-exports domain types from @queuemed/core and keeps MCP-specific
 * types (SupabaseJWTPayload, PermissionLevel) local.
 */

// ============================================================================
// RE-EXPORTED FROM CORE — domain types shared across all adapters/consumers
// ============================================================================
export type { AuthContext, UserRole } from "@queuemed/core";
export type { UserRoleAssignment, StaffRecord } from "@queuemed/core";
export { ANONYMOUS_CONTEXT } from "@queuemed/core";

// ============================================================================
// SUPABASE-SPECIFIC — JWT payload shape for Supabase Auth only
// ============================================================================

/**
 * JWT payload from Supabase Auth
 */
export interface SupabaseJWTPayload {
  /** Subject - user ID */
  sub: string;

  /** Audience */
  aud: string;

  /** Issued at */
  iat: number;

  /** Expiry */
  exp: number;

  /** Email */
  email?: string;

  /** Phone */
  phone?: string;

  /** App metadata (roles, etc.) */
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };

  /** User metadata */
  user_metadata?: {
    full_name?: string;
    phone_number?: string;
  };

  /** Role */
  role?: string;
}

// ============================================================================
// MCP-SPECIFIC — RBAC is owned by the MCP server's roleGuard
// ============================================================================

/**
 * Tool permission levels
 */
export type PermissionLevel =
  | "public"           // Anyone can access
  | "authenticated"    // Any logged-in user
  | "patient"          // Patients only (or higher)
  | "staff"            // Staff members only (or higher)
  | "clinic_owner"     // Clinic owners only (or higher)
  | "admin";           // System admins only

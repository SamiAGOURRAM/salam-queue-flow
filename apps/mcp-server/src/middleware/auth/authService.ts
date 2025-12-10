/**
 * Authentication Service
 * 
 * Validates JWT tokens from Supabase Auth and builds auth context.
 * This service handles:
 * - JWT validation
 * - User role lookup
 * - Staff/clinic association lookup
 * - Permission building
 */

import { getSupabaseClient } from "../../adapters/supabase/client.js";
import { logger } from "../../utils/logger.js";
import { AuthenticationError } from "../../utils/errors.js";
import {
  AuthContext,
  UserRole,
  UserRoleAssignment,
  StaffRecord,
  ANONYMOUS_CONTEXT,
} from "./types.js";
import { getPermissionsForRole } from "./roleGuard.js";

/**
 * Validate a JWT token and build auth context
 */
export async function validateToken(token: string): Promise<AuthContext> {
  if (!token) {
    logger.debug("No token provided, returning anonymous context");
    return ANONYMOUS_CONTEXT;
  }

  // Remove "Bearer " prefix if present
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

  try {
    const supabase = getSupabaseClient();

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(cleanToken);

    if (error || !user) {
      logger.warn("Token validation failed", { 
        error: error?.message,
        hasUser: !!user,
      });
      throw new AuthenticationError("Invalid or expired token");
    }

    logger.debug("Token validated", { userId: user.id });

    // Build the auth context
    const context = await buildAuthContext(user.id, user.email, user.phone);

    return context;

  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    logger.error("Token validation error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AuthenticationError("Token validation failed");
  }
}

/**
 * Build complete auth context for a user
 */
async function buildAuthContext(
  userId: string,
  email?: string | null,
  phone?: string | null
): Promise<AuthContext> {
  const supabase = getSupabaseClient();

  // Fetch user roles
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("id, user_id, role, clinic_id")
    .eq("user_id", userId);

  if (rolesError) {
    logger.warn("Failed to fetch user roles", { error: rolesError.message });
  }

  const userRoles = (roles as UserRoleAssignment[]) || [];

  // Determine primary role (highest privilege)
  const primaryRole = determinePrimaryRole(userRoles);

  // Fetch staff info if applicable
  let staffId: string | undefined;
  let clinicId: string | undefined;

  if (primaryRole === "staff" || primaryRole === "clinic_owner") {
    const staffInfo = await fetchStaffInfo(userId);
    if (staffInfo) {
      staffId = staffInfo.id;
      clinicId = staffInfo.clinic_id;
    }
  }

  // If no clinic from staff, try from roles
  if (!clinicId && userRoles.length > 0) {
    const roleWithClinic = userRoles.find(r => r.clinic_id);
    if (roleWithClinic) {
      clinicId = roleWithClinic.clinic_id || undefined;
    }
  }

  // Fetch patient profile info
  let patientId: string | undefined;
  let fullName: string | undefined;
  let phoneNumber: string | undefined;

  const profileInfo = await fetchProfileInfo(userId);
  if (profileInfo) {
    patientId = profileInfo.id;
    fullName = profileInfo.full_name;
    phoneNumber = profileInfo.phone_number;
  }

  // Build permissions list
  const permissions = getPermissionsForRole(primaryRole);

  const context: AuthContext = {
    userId,
    role: primaryRole,
    clinicId,
    staffId,
    patientId,
    phoneNumber: phoneNumber || phone || undefined,
    fullName,
    email: email || undefined,
    permissions,
    isAuthenticated: true,
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour default
  };

  logger.debug("Auth context built", {
    userId,
    role: primaryRole,
    clinicId,
    staffId,
    permissionCount: permissions.length,
  });

  return context;
}

/**
 * Determine primary role from role assignments
 * Priority: admin > clinic_owner > staff > patient
 */
function determinePrimaryRole(roles: UserRoleAssignment[]): UserRole {
  if (roles.length === 0) {
    return "patient"; // Default role
  }

  const rolePriority: Record<UserRole, number> = {
    admin: 4,
    clinic_owner: 3,
    staff: 2,
    patient: 1,
  };

  let highestRole: UserRole = "patient";
  let highestPriority = 0;

  for (const role of roles) {
    const priority = rolePriority[role.role as UserRole] || 0;
    if (priority > highestPriority) {
      highestPriority = priority;
      highestRole = role.role as UserRole;
    }
  }

  return highestRole;
}

/**
 * Fetch staff information for a user
 */
async function fetchStaffInfo(userId: string): Promise<StaffRecord | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("clinic_staff")
      .select("id, clinic_id, user_id, role, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return null;
    }

    return data as StaffRecord;
  } catch (error) {
    logger.debug("Failed to fetch staff info", { userId });
    return null;
  }
}

/**
 * Fetch profile information for a user
 */
async function fetchProfileInfo(userId: string): Promise<{
  id: string;
  full_name: string;
  phone_number: string;
} | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as { id: string; full_name: string; phone_number: string };
  } catch (error) {
    logger.debug("Failed to fetch profile info", { userId });
    return null;
  }
}

/**
 * Create auth context from request metadata
 * This is used when auth token is passed via MCP protocol
 */
export async function createAuthContextFromMeta(
  meta: Record<string, unknown> | undefined
): Promise<AuthContext> {
  if (!meta) {
    return ANONYMOUS_CONTEXT;
  }

  // Check for token in various locations
  const token = 
    meta.authorization as string ||
    meta.token as string ||
    meta.auth_token as string;

  if (!token) {
    return ANONYMOUS_CONTEXT;
  }

  return validateToken(token);
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


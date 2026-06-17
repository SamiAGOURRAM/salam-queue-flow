/**
 * SupabaseAuthAdapter — implements IAuthService for Supabase Auth
 *
 * Validates JWT tokens via supabase.auth.getUser() (service-role client),
 * then resolves the user's role/staff/patient associations via a JWT-scoped
 * client so Postgres RLS enforces the caller's permissions.
 *
 * Swap this adapter for a different auth provider (Hanko, Auth0, etc.)
 * by writing a new class that implements IAuthService.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IAuthService, AuthContext, UserRole, UserRoleAssignment, StaffRecord } from "@queuemed/core";
import { AuthenticationError } from "../../utils/errors.js";
import { getJwtScopedClient } from "../supabase/client.js";
import { logger } from "../../utils/logger.js";
import { getPermissionsForRole } from "../../middleware/auth/roleGuard.js";

export class SupabaseAuthAdapter implements IAuthService {
  constructor(private readonly supabase: SupabaseClient) {}

  async validateToken(token: string): Promise<AuthContext> {
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

    try {
      // Verify the token with Supabase using the service-role client
      const { data: { user }, error } = await this.supabase.auth.getUser(cleanToken);

      if (error || !user) {
        logger.warn("Token validation failed", {
          error: error?.message,
          hasUser: !!user,
        });
        throw new AuthenticationError("Invalid or expired token");
      }

      logger.debug("Token validated", { userId: user.id });

      // Build the auth context — data queries use a JWT-scoped client
      // so Postgres RLS enforces the caller's permissions.
      const context = await this.buildAuthContext(user.id, user.email, user.phone, cleanToken);

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

  async createAuthContextFromMeta(meta: Record<string, unknown> | undefined): Promise<AuthContext> {
    if (!meta) {
      throw new AuthenticationError("No authentication metadata provided");
    }

    // Check for token in various locations
    const token =
      meta.authorization as string ||
      meta.token as string ||
      meta.auth_token as string;

    if (!token) {
      throw new AuthenticationError("No token found in authentication metadata");
    }

    return this.validateToken(token);
  }

  /**
   * Build complete auth context for a user
   */
  private async buildAuthContext(
    userId: string,
    email?: string | null,
    phone?: string | null,
    jwtToken?: string,
  ): Promise<AuthContext> {
    // Use JWT-scoped client for data queries so RLS enforces
    // the caller's permissions.
    const dataClient = jwtToken
      ? getJwtScopedClient(jwtToken)
      : this.supabase;

    // Fetch user roles
    const { data: roles, error: rolesError } = await dataClient
      .from("user_roles")
      .select("id, user_id, role, clinic_id")
      .eq("user_id", userId);

    if (rolesError) {
      logger.warn("Failed to fetch user roles", { error: rolesError.message });
    }

    const userRoles = (roles as UserRoleAssignment[]) || [];

    // Determine primary role (highest privilege)
    const primaryRole = this.determinePrimaryRole(userRoles);

    // Fetch staff info if applicable
    let staffId: string | undefined;
    let clinicId: string | undefined;

    if (primaryRole === "staff" || primaryRole === "clinic_owner") {
      const staffInfo = await this.fetchStaffInfo(userId, dataClient);
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

    const profileInfo = await this.fetchProfileInfo(userId, dataClient);
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
  private determinePrimaryRole(roles: UserRoleAssignment[]): UserRole {
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
  private async fetchStaffInfo(
    userId: string,
    supabase: SupabaseClient,
  ): Promise<StaffRecord | null> {
    try {
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
    } catch {
      logger.debug("Failed to fetch staff info", { userId });
      return null;
    }
  }

  /**
   * Fetch profile information for a user
   */
  private async fetchProfileInfo(
    userId: string,
    supabase: SupabaseClient,
  ): Promise<{ id: string; full_name: string; phone_number: string } | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number")
        .eq("id", userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data as { id: string; full_name: string; phone_number: string };
    } catch {
      logger.debug("Failed to fetch profile info", { userId });
      return null;
    }
  }
}

/**
 * IAuthService — Port interface for authentication providers
 *
 * Defines the contract that any auth provider adapter must implement.
 * This allows swapping Supabase Auth for Hanko, Auth0, or a custom JWT
 * provider without changing business logic.
 *
 * Pure checks (verifyClinicAccess, verifyPatientAccess) are intentionally
 * NOT on this interface — they operate solely on the AuthContext object
 * and involve no IO. They remain standalone utility functions.
 */

import type { AuthContext } from '../../types/auth.js';

export interface IAuthService {
  /**
   * Validate a JWT / bearer token and return the resolved AuthContext.
   *
   * Implementations MUST:
   * - Verify token validity with the auth provider (e.g. supabase.auth.getUser())
   * - Look up the user's role, staff/patient associations
   * - Build and return a complete AuthContext
   * - Throw AuthenticationError on invalid/expired/malformed tokens
   */
  validateToken(token: string): Promise<AuthContext>;

  /**
   * Extract a token from request metadata (protocol-level auth) and validate it.
   *
   * The metadata shape is provider-dependent; implementations check for
   * fields like "authorization", "token", "auth_token", etc.
   */
  createAuthContextFromMeta(meta: Record<string, unknown> | undefined): Promise<AuthContext>;
}

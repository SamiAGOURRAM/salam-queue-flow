/**
 * Auth Domain Types
 *
 * Core types for authentication and authorization.
 * These are transport-agnostic — any auth provider (Supabase, Hanko, Auth0, etc.)
 * can produce an AuthContext by implementing IAuthService.
 */

/**
 * User roles in the QueueMed system
 */
export type UserRole = "patient" | "staff" | "clinic_owner" | "admin";

/**
 * Authentication context passed to service and tool handlers.
 *
 * Every authenticated request resolves to this shape regardless of
 * the underlying auth provider.
 */
export interface AuthContext {
  /** User's unique ID (from the auth provider) */
  userId: string;

  /** User's primary role */
  role: UserRole;

  /** Clinic ID the user belongs to (for staff/owners) */
  clinicId?: string;

  /** Staff ID if user is a staff member */
  staffId?: string;

  /** Patient ID if user is a patient */
  patientId?: string;

  /** User's phone number */
  phoneNumber?: string;

  /** User's full name */
  fullName?: string;

  /** User's email */
  email?: string;

  /** List of permissions for this user */
  permissions: string[];

  /** Whether the session is authenticated */
  isAuthenticated: boolean;

  /** Session expiry time */
  expiresAt?: Date;
}

/**
 * User role assignment from database
 */
export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role: UserRole;
  clinic_id: string | null;
  created_at: string;
}

/**
 * Staff record from database
 */
export interface StaffRecord {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
}

/**
 * Anonymous context for unauthenticated requests
 */
export const ANONYMOUS_CONTEXT: AuthContext = {
  userId: "anonymous",
  role: "patient",
  permissions: ["public"],
  isAuthenticated: false,
};

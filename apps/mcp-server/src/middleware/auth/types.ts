/**
 * Authentication Types
 * 
 * Type definitions for authentication and authorization.
 */

/**
 * User roles in the QueueMed system
 */
export type UserRole = "patient" | "staff" | "clinic_owner" | "admin";

/**
 * Authentication context passed to tools
 */
export interface AuthContext {
  /** User's unique ID from Supabase Auth */
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
  
  /** User's email (optional) */
  email?: string;
  
  /** List of permissions for this user */
  permissions: string[];
  
  /** Whether the session is authenticated */
  isAuthenticated: boolean;
  
  /** Session expiry time */
  expiresAt?: Date;
}

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


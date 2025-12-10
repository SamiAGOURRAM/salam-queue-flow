/**
 * Role Guard - Role-Based Access Control (RBAC)
 * 
 * Handles permission checking for tools based on user roles.
 * Implements a hierarchical permission system where higher roles
 * inherit permissions from lower roles.
 */

import { logger } from "../../utils/logger.js";
import { AuthorizationError } from "../../utils/errors.js";
import { AuthContext, UserRole, PermissionLevel } from "./types.js";

// ============================================
// PERMISSION DEFINITIONS
// ============================================

/**
 * Define which permission levels each role has access to
 * Roles inherit from lower levels (patient < staff < clinic_owner < admin)
 */
const ROLE_HIERARCHY: Record<UserRole, PermissionLevel[]> = {
  patient: ["public", "authenticated", "patient"],
  staff: ["public", "authenticated", "patient", "staff"],
  clinic_owner: ["public", "authenticated", "patient", "staff", "clinic_owner"],
  admin: ["public", "authenticated", "patient", "staff", "clinic_owner", "admin"],
};

/**
 * Tool permission requirements
 * Maps tool names to their minimum required permission level
 */
export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // Public tools - anyone can use
  "clinic_search": "public",
  "clinic_getInfo": "public",
  
  // Authenticated tools - any logged-in user
  "booking_getAvailability": "public", // Public but returns more info if authenticated
  "booking_create": "authenticated",
  "booking_cancel": "authenticated",
  
  // Patient tools - patients or higher
  "queue_getPosition": "patient",
  "patient_getProfile": "patient",
  "patient_getAppointments": "patient",
  "ml_estimateWaitTime": "patient",
  
  // Staff tools - staff members or higher
  "queue_getSchedule": "staff",
  "queue_callNext": "staff",
  "queue_markAbsent": "staff",
  "queue_markPresent": "staff",
  "queue_skipPatient": "staff",
  "patient_search": "staff",
  
  // Clinic owner tools
  "clinic_updateSettings": "clinic_owner",
  "staff_add": "clinic_owner",
  "staff_remove": "clinic_owner",
  "analytics_getDashboard": "clinic_owner",
  
  // Admin tools
  "admin_listClinics": "admin",
  "admin_systemStats": "admin",
};

/**
 * Detailed permissions for each role
 * These are specific capabilities, not just tool access
 */
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  patient: [
    "public",
    "booking:read",
    "booking:create",
    "booking:cancel:own",
    "queue:read:own",
    "patient:read:own",
    "patient:update:own",
  ],
  staff: [
    "public",
    "booking:read",
    "booking:create",
    "booking:cancel:own",
    "booking:cancel:clinic",
    "queue:read:own",
    "queue:read:clinic",
    "queue:manage:clinic",
    "patient:read:own",
    "patient:read:clinic",
    "patient:search:clinic",
  ],
  clinic_owner: [
    "public",
    "booking:read",
    "booking:create",
    "booking:cancel:own",
    "booking:cancel:clinic",
    "queue:read:own",
    "queue:read:clinic",
    "queue:manage:clinic",
    "patient:read:own",
    "patient:read:clinic",
    "patient:search:clinic",
    "clinic:update",
    "staff:manage",
    "analytics:read",
    "settings:manage",
  ],
  admin: [
    "public",
    "booking:read",
    "booking:create",
    "booking:cancel:any",
    "queue:read:any",
    "queue:manage:any",
    "patient:read:any",
    "patient:search:any",
    "clinic:read:any",
    "clinic:update:any",
    "staff:manage:any",
    "analytics:read:any",
    "settings:manage:any",
    "admin:access",
  ],
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): string[] {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.patient;
}

/**
 * Check if a role has access to a permission level
 */
export function roleHasAccess(role: UserRole, level: PermissionLevel): boolean {
  const allowedLevels = ROLE_HIERARCHY[role] || [];
  return allowedLevels.includes(level);
}

/**
 * Check if a user can access a specific tool
 */
export function canAccessTool(context: AuthContext, toolName: string): boolean {
  const requiredLevel = TOOL_PERMISSIONS[toolName];
  
  // If tool not in list, deny by default (secure by default)
  if (!requiredLevel) {
    logger.warn("Tool not in permission list, denying access", { toolName });
    return false;
  }
  
  // Public tools are always accessible
  if (requiredLevel === "public") {
    return true;
  }
  
  // ALL non-public tools require authentication
  if (!context.isAuthenticated) {
    return false;
  }
  
  // For "authenticated" level, any logged-in user can access
  if (requiredLevel === "authenticated") {
    return true;
  }
  
  // Check role hierarchy for role-specific levels
  return roleHasAccess(context.role, requiredLevel);
}

/**
 * Assert that a user can access a tool, throw if not
 */
export function assertToolAccess(context: AuthContext, toolName: string): void {
  if (!canAccessTool(context, toolName)) {
    logger.warn("Tool access denied", {
      userId: context.userId,
      role: context.role,
      toolName,
      isAuthenticated: context.isAuthenticated,
    });
    
    if (!context.isAuthenticated) {
      throw new AuthorizationError(
        `Authentication required to access '${toolName}'. Please provide a valid token.`
      );
    }
    
    throw new AuthorizationError(
      `Access denied: '${context.role}' role cannot access '${toolName}'. ` +
      `Required: ${TOOL_PERMISSIONS[toolName] || "unknown"}`
    );
  }
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(context: AuthContext, permission: string): boolean {
  return context.permissions.includes(permission);
}

/**
 * Assert that a user has a specific permission
 */
export function assertPermission(context: AuthContext, permission: string): void {
  if (!hasPermission(context, permission)) {
    logger.warn("Permission denied", {
      userId: context.userId,
      role: context.role,
      permission,
    });
    
    throw new AuthorizationError(
      `Permission denied: '${permission}' is required for this action.`
    );
  }
}

/**
 * Check if user can access data for a specific clinic
 */
export function canAccessClinic(context: AuthContext, clinicId: string): boolean {
  // Admins can access any clinic
  if (context.role === "admin") {
    return true;
  }
  
  // Users can only access their own clinic
  if (context.clinicId === clinicId) {
    return true;
  }
  
  return false;
}

/**
 * Assert clinic access, throw if not allowed
 */
export function assertClinicAccess(context: AuthContext, clinicId: string): void {
  if (!canAccessClinic(context, clinicId)) {
    logger.warn("Clinic access denied", {
      userId: context.userId,
      userClinicId: context.clinicId,
      requestedClinicId: clinicId,
    });
    
    throw new AuthorizationError(
      "Access denied: You can only access data from your own clinic."
    );
  }
}

/**
 * Check if user can access their own or other's patient data
 */
export function canAccessPatientData(
  context: AuthContext,
  patientId: string,
  clinicId?: string
): boolean {
  // Admins can access any patient
  if (context.role === "admin") {
    return true;
  }
  
  // Patients can only access their own data
  if (context.role === "patient") {
    return context.patientId === patientId;
  }
  
  // Staff/owners can access patients in their clinic
  if (context.role === "staff" || context.role === "clinic_owner") {
    // If clinic ID is provided, verify it matches
    if (clinicId && context.clinicId !== clinicId) {
      return false;
    }
    return true; // Staff can access any patient in their clinic
  }
  
  return false;
}

/**
 * Assert patient data access
 */
export function assertPatientDataAccess(
  context: AuthContext,
  patientId: string,
  clinicId?: string
): void {
  if (!canAccessPatientData(context, patientId, clinicId)) {
    logger.warn("Patient data access denied", {
      userId: context.userId,
      role: context.role,
      requestedPatientId: patientId,
    });
    
    throw new AuthorizationError(
      "Access denied: You cannot access this patient's data."
    );
  }
}

/**
 * Get the required permission level for a tool
 */
export function getToolPermissionLevel(toolName: string): PermissionLevel | undefined {
  return TOOL_PERMISSIONS[toolName];
}

/**
 * Register a new tool's permission level (for dynamic tools)
 */
export function registerToolPermission(
  toolName: string,
  level: PermissionLevel
): void {
  TOOL_PERMISSIONS[toolName] = level;
  logger.debug("Tool permission registered", { toolName, level });
}


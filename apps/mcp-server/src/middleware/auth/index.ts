/**
 * Authentication Module - Public Exports
 * 
 * This module provides authentication and authorization for the MCP server.
 */

// Types - use 'export type' for type-only exports
export type { AuthContext, UserRole, PermissionLevel } from "./types.js";
export { ANONYMOUS_CONTEXT } from "./types.js";

// Auth Service
export {
  validateToken,
  createAuthContextFromMeta,
  verifyClinicAccess,
  verifyPatientAccess,
} from "./authService.js";

// Role Guard
export {
  canAccessTool,
  assertToolAccess,
  hasPermission,
  assertPermission,
  canAccessClinic,
  assertClinicAccess,
  canAccessPatientData,
  assertPatientDataAccess,
  getPermissionsForRole,
  roleHasAccess,
  getToolPermissionLevel,
  registerToolPermission,
  TOOL_PERMISSIONS,
} from "./roleGuard.js";


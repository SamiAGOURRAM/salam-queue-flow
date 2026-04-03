export type BaseClinicRole = 'staff' | 'doctor';

export type ClinicPermissionKey =
  | 'view_dashboard'
  | 'manage_dashboard'
  | 'view_queue'
  | 'manage_queue'
  | 'view_calendar'
  | 'manage_calendar'
  | 'manage_appointments'
  | 'view_patients'
  | 'manage_team'
  | 'view_team'
  | 'view_clinic_settings'
  | 'manage_clinic_settings'
  | 'manage_roles';

export type ClinicRolePermissions = Record<ClinicPermissionKey, boolean>;

export interface ClinicRoleDefinition {
  key: string;
  label: string;
  baseRole: BaseClinicRole;
  permissions: ClinicRolePermissions;
  isSystem: boolean;
}

const PERMISSION_KEYS: ClinicPermissionKey[] = [
  'view_dashboard',
  'manage_dashboard',
  'view_queue',
  'manage_queue',
  'view_calendar',
  'manage_calendar',
  'manage_appointments',
  'view_patients',
  'view_team',
  'manage_team',
  'view_clinic_settings',
  'manage_clinic_settings',
  'manage_roles',
];

export const CLINIC_PERMISSION_LABELS: Record<ClinicPermissionKey, string> = {
  view_dashboard: 'View dashboard',
  manage_dashboard: 'Manage dashboard actions',
  view_queue: 'View live queue',
  manage_queue: 'Manage queue actions',
  view_calendar: 'View clinic calendar',
  manage_calendar: 'Manage calendar actions',
  manage_appointments: 'Create and edit appointments',
  view_patients: 'View patient details',
  view_team: 'View team members',
  manage_team: 'Invite or remove team members',
  view_clinic_settings: 'View clinic settings',
  manage_clinic_settings: 'Edit clinic settings',
  manage_roles: 'Manage roles and permissions',
};

const DEFAULT_STAFF_PERMISSIONS: ClinicRolePermissions = {
  view_dashboard: true,
  manage_dashboard: false,
  view_queue: true,
  manage_queue: true,
  view_calendar: true,
  manage_calendar: true,
  manage_appointments: true,
  view_patients: true,
  view_team: true,
  manage_team: false,
  view_clinic_settings: false,
  manage_clinic_settings: false,
  manage_roles: false,
};

const DEFAULT_DOCTOR_PERMISSIONS: ClinicRolePermissions = {
  view_dashboard: true,
  manage_dashboard: false,
  view_queue: true,
  manage_queue: true,
  view_calendar: true,
  manage_calendar: true,
  manage_appointments: true,
  view_patients: true,
  view_team: true,
  manage_team: false,
  view_clinic_settings: true,
  manage_clinic_settings: false,
  manage_roles: false,
};

const OWNER_PERMISSIONS: ClinicRolePermissions = PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {} as ClinicRolePermissions);

const SYSTEM_ROLE_KEYS = new Set<string>(['staff', 'doctor']);

const DEFAULT_ROLES: ClinicRoleDefinition[] = [
  {
    key: 'staff',
    label: 'Staff',
    baseRole: 'staff',
    permissions: { ...DEFAULT_STAFF_PERMISSIONS },
    isSystem: true,
  },
  {
    key: 'doctor',
    label: 'Doctor',
    baseRole: 'doctor',
    permissions: { ...DEFAULT_DOCTOR_PERMISSIONS },
    isSystem: true,
  },
];

export function normalizeRoleKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function makePermissions(
  input: unknown,
  fallback: ClinicRolePermissions
): ClinicRolePermissions {
  const output: Partial<ClinicRolePermissions> = {};
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

  for (const key of PERMISSION_KEYS) {
    const candidate = source[key];
    output[key] = typeof candidate === 'boolean' ? candidate : fallback[key];
  }

  return output as ClinicRolePermissions;
}

export function getDefaultClinicRoleDefinitions(): ClinicRoleDefinition[] {
  return DEFAULT_ROLES.map((role) => ({
    ...role,
    permissions: { ...role.permissions },
  }));
}

export function parseClinicRoleDefinitions(settings: unknown): ClinicRoleDefinition[] {
  const defaults = getDefaultClinicRoleDefinitions();

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return defaults;
  }

  const roleDefinitions = (settings as Record<string, unknown>).role_definitions;
  if (!Array.isArray(roleDefinitions)) {
    return defaults;
  }

  const roleMap = new Map<string, ClinicRoleDefinition>();
  defaults.forEach((role) => roleMap.set(role.key, role));

  for (const rawRole of roleDefinitions) {
    if (!rawRole || typeof rawRole !== 'object' || Array.isArray(rawRole)) {
      continue;
    }

    const roleObject = rawRole as Record<string, unknown>;
    const rawKey =
      (typeof roleObject.key === 'string' && roleObject.key) ||
      (typeof roleObject.role_key === 'string' && roleObject.role_key) ||
      (typeof roleObject.label === 'string' && roleObject.label) ||
      '';

    const roleKey = normalizeRoleKey(rawKey);
    if (!roleKey) {
      continue;
    }

    const existing = roleMap.get(roleKey);
    const baseRole =
      roleObject.base_role === 'doctor' || roleObject.baseRole === 'doctor'
        ? 'doctor'
        : existing?.baseRole || 'staff';

    const fallback = existing?.permissions || (baseRole === 'doctor'
      ? DEFAULT_DOCTOR_PERMISSIONS
      : DEFAULT_STAFF_PERMISSIONS);

    const label =
      typeof roleObject.label === 'string' && roleObject.label.trim()
        ? roleObject.label.trim()
        : existing?.label || roleKey;

    roleMap.set(roleKey, {
      key: roleKey,
      label,
      baseRole,
      permissions: makePermissions(roleObject.permissions, fallback),
      isSystem: SYSTEM_ROLE_KEYS.has(roleKey),
    });
  }

  const system = ['staff', 'doctor']
    .map((key) => roleMap.get(key))
    .filter((role): role is ClinicRoleDefinition => Boolean(role));

  const custom = Array.from(roleMap.values())
    .filter((role) => !SYSTEM_ROLE_KEYS.has(role.key))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...system, ...custom];
}

export function serializeClinicRoleDefinitions(roleDefinitions: ClinicRoleDefinition[]): Array<Record<string, unknown>> {
  return roleDefinitions.map((role) => ({
    key: role.key,
    label: role.label,
    base_role: role.baseRole,
    permissions: { ...role.permissions },
  }));
}

export function getRolePermissions(
  roleKey: string,
  roleDefinitions: ClinicRoleDefinition[],
  isClinicOwner: boolean
): ClinicRolePermissions {
  if (isClinicOwner || roleKey === 'clinic_owner') {
    return { ...OWNER_PERMISSIONS };
  }

  const normalizedRole = normalizeRoleKey(roleKey);
  const role = roleDefinitions.find((candidate) => candidate.key === normalizedRole);

  if (role) {
    return { ...role.permissions };
  }

  return { ...DEFAULT_STAFF_PERMISSIONS };
}

export function getRoleLabel(roleKey: string, roleDefinitions: ClinicRoleDefinition[]): string {
  if (roleKey === 'clinic_owner') return 'Clinic Owner';
  const normalizedRole = normalizeRoleKey(roleKey);
  const role = roleDefinitions.find((candidate) => candidate.key === normalizedRole);
  if (role) return role.label;

  return roleKey
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

export function getPermissionEntries(permissions: ClinicRolePermissions): Array<{ key: ClinicPermissionKey; label: string; allowed: boolean }> {
  return PERMISSION_KEYS.map((key) => ({
    key,
    label: CLINIC_PERMISSION_LABELS[key],
    allowed: permissions[key],
  }));
}

export function countAllowedPermissions(permissions: ClinicRolePermissions): number {
  return PERMISSION_KEYS.reduce((total, key) => total + (permissions[key] ? 1 : 0), 0);
}

export function permissionsFromBaseRole(baseRole: BaseClinicRole): ClinicRolePermissions {
  return {
    ...(baseRole === 'doctor' ? DEFAULT_DOCTOR_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS),
  };
}

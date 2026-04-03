import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logger } from "@/services/shared/logging/Logger";
import {
  CLINIC_PERMISSION_LABELS,
  getRoleLabel,
  getRolePermissions,
  normalizeRoleKey,
  parseClinicRoleDefinitions,
  type ClinicPermissionKey,
  type ClinicRoleDefinition,
  type ClinicRolePermissions,
} from "@/lib/clinicRolePermissions";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type ClinicStaffRow = Database["public"]["Tables"]["clinic_staff"]["Row"];

type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];

const EMPTY_PERMISSIONS: ClinicRolePermissions = Object.keys(CLINIC_PERMISSION_LABELS).reduce(
  (acc, permissionKey) => {
    acc[permissionKey as ClinicPermissionKey] = false;
    return acc;
  },
  {} as ClinicRolePermissions
);

function readClinicSettings(settings: ClinicRow["settings"]): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  return settings as Record<string, unknown>;
}

export interface ClinicPermissionContext {
  loading: boolean;
  clinic: ClinicRow | null;
  clinicId: string | null;
  roleKey: string | null;
  roleLabel: string;
  joinedAt: string | null;
  isClinicOwnerAtClinic: boolean;
  staffProfile: ClinicStaffRow | null;
  roleDefinitions: ClinicRoleDefinition[];
  permissions: ClinicRolePermissions;
  error: string | null;
  can: (permission: ClinicPermissionKey) => boolean;
  canAll: (permissions: ClinicPermissionKey[]) => boolean;
  refresh: () => void;
}

export function useClinicPermissions(): ClinicPermissionContext {
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [staffProfile, setStaffProfile] = useState<ClinicStaffRow | null>(null);
  const [roleDefinitions, setRoleDefinitions] = useState<ClinicRoleDefinition[]>([]);
  const [permissions, setPermissions] = useState<ClinicRolePermissions>(EMPTY_PERMISSIONS);
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [roleLabel, setRoleLabel] = useState("Staff");
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => {
    setRefreshVersion((value) => value + 1);
  }, []);

  const resolveAccess = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      setClinic(null);
      setStaffProfile(null);
      setRoleDefinitions([]);
      setPermissions(EMPTY_PERMISSIONS);
      setRoleKey(null);
      setRoleLabel("Staff");
      setJoinedAt(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [ownerClinicResult, staffResult] = await Promise.all([
        supabase.from("clinics").select("*").eq("owner_id", user.id).maybeSingle(),
        supabase.from("clinic_staff").select("*").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      ]);

      const ownerClinic = (ownerClinicResult.data || null) as ClinicRow | null;
      const activeStaff = (staffResult.data || null) as ClinicStaffRow | null;

      let activeClinic: ClinicRow | null = ownerClinic;
      if (!activeClinic && activeStaff?.clinic_id) {
        const { data: clinicByStaff } = await supabase
          .from("clinics")
          .select("*")
          .eq("id", activeStaff.clinic_id)
          .maybeSingle();
        activeClinic = (clinicByStaff || null) as ClinicRow | null;
      }

      if (!activeClinic) {
        setClinic(null);
        setStaffProfile(activeStaff);
        setRoleDefinitions([]);
        setPermissions(EMPTY_PERMISSIONS);
        setRoleKey(null);
        setRoleLabel("Staff");
        setJoinedAt(null);
        setLoading(false);
        return;
      }

      const clinicSettings = readClinicSettings(activeClinic.settings);
      const parsedRoleDefinitions = parseClinicRoleDefinitions(clinicSettings);
      const isClinicOwnerAtClinic = activeClinic.owner_id === user.id;
      const resolvedRoleKey = isClinicOwnerAtClinic
        ? "clinic_owner"
        : normalizeRoleKey(activeStaff?.role || "staff");
      const resolvedPermissions = getRolePermissions(
        resolvedRoleKey,
        parsedRoleDefinitions,
        isClinicOwnerAtClinic
      );

      let resolvedJoinedAt = activeStaff?.created_at || null;
      if (!resolvedJoinedAt) {
        const { data: roleMembership } = await supabase
          .from("user_roles")
          .select("created_at")
          .eq("user_id", user.id)
          .eq("clinic_id", activeClinic.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        resolvedJoinedAt = (roleMembership as UserRoleRow | null)?.created_at || activeClinic.created_at;
      }

      setClinic(activeClinic);
      setStaffProfile(activeStaff);
      setRoleDefinitions(parsedRoleDefinitions);
      setPermissions(resolvedPermissions);
      setRoleKey(resolvedRoleKey);
      setRoleLabel(getRoleLabel(resolvedRoleKey, parsedRoleDefinitions));
      setJoinedAt(resolvedJoinedAt);
    } catch (resolveError) {
      logger.error(
        "Failed to resolve clinic permissions",
        resolveError instanceof Error ? resolveError : new Error(String(resolveError)),
        { userId: user.id }
      );

      setClinic(null);
      setStaffProfile(null);
      setRoleDefinitions([]);
      setPermissions(EMPTY_PERMISSIONS);
      setRoleKey(null);
      setRoleLabel("Staff");
      setJoinedAt(null);
      setError(resolveError instanceof Error ? resolveError.message : "Failed to load clinic permissions");
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    resolveAccess();
  }, [refreshVersion, resolveAccess]);

  const can = useCallback(
    (permission: ClinicPermissionKey) => {
      if (roleKey === "clinic_owner") {
        return true;
      }
      return permissions[permission] === true;
    },
    [permissions, roleKey]
  );

  const canAll = useCallback(
    (requiredPermissions: ClinicPermissionKey[]) => {
      if (roleKey === "clinic_owner") {
        return true;
      }
      return requiredPermissions.every((permission) => permissions[permission] === true);
    },
    [permissions, roleKey]
  );

  const isClinicOwnerAtClinic = useMemo(() => roleKey === "clinic_owner", [roleKey]);

  return {
    loading,
    clinic,
    clinicId: clinic?.id || null,
    roleKey,
    roleLabel,
    joinedAt,
    isClinicOwnerAtClinic,
    staffProfile,
    roleDefinitions,
    permissions,
    error,
    can,
    canAll,
    refresh,
  };
}

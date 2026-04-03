import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClinicPermissions } from "@/hooks/useClinicPermissions";
import { supabase } from "@/integrations/supabase/client";
import { staffService } from "@/services/staff";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, Mail, Trash2, Users, Activity, Pencil, SlidersHorizontal, Plus, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  CLINIC_PERMISSION_LABELS,
  countAllowedPermissions,
  getDefaultClinicRoleDefinitions,
  getRoleLabel,
  normalizeRoleKey,
  parseClinicRoleDefinitions,
  permissionsFromBaseRole,
  serializeClinicRoleDefinitions,
  type BaseClinicRole,
  type ClinicRoleDefinition,
  type ClinicRolePermissions,
} from "@/lib/clinicRolePermissions";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type ClinicStaffRow = Database["public"]["Tables"]["clinic_staff"]["Row"];

interface StaffMember extends ClinicStaffRow {
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone_number: string | null;
  } | null;
}

function readClinicSettings(settings: ClinicRow["settings"]): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  return settings as Record<string, unknown>;
}

function getRoleChoicesForMember(
  memberRoleKey: string,
  roleDefinitions: ClinicRoleDefinition[]
): ClinicRoleDefinition[] {
  const hasRole = roleDefinitions.some((role) => role.key === memberRoleKey);
  if (hasRole) {
    return roleDefinitions;
  }

  return [
    ...roleDefinitions,
    {
      key: memberRoleKey,
      label: getRoleLabel(memberRoleKey, roleDefinitions),
      baseRole: "staff",
      permissions: permissionsFromBaseRole("staff"),
      isSystem: false,
    },
  ];
}

export default function TeamManagement() {
  const { user } = useAuth();
  const {
    clinic: scopedClinic,
    loading: accessLoading,
    can,
  } = useClinicPermissions();

  const canManageTeam = can("manage_team");
  const canManageRoles = can("manage_roles");
  const canViewTeam = can("view_team") || canManageTeam;
  const canAssignTeamRoles = canManageTeam && canManageRoles;

  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [sending, setSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingStaffId, setUpdatingStaffId] = useState<string | null>(null);

  const [roleDefinitions, setRoleDefinitions] = useState<ClinicRoleDefinition[]>(
    getDefaultClinicRoleDefinitions()
  );
  const [roleSaving, setRoleSaving] = useState(false);
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<ClinicRoleDefinition | null>(null);
  const [roleLabelDraft, setRoleLabelDraft] = useState("");
  const [roleBaseDraft, setRoleBaseDraft] = useState<BaseClinicRole>("staff");
  const [rolePermissionsDraft, setRolePermissionsDraft] = useState<ClinicRolePermissions>(
    permissionsFromBaseRole("staff")
  );

  const persistRoleDefinitions = useCallback(
    async (nextDefinitions: ClinicRoleDefinition[]) => {
      if (!clinic) return false;

      setRoleSaving(true);
      try {
        const currentSettings = readClinicSettings(clinic.settings);
        const nextSettings = {
          ...currentSettings,
          role_definitions: serializeClinicRoleDefinitions(nextDefinitions),
        };

        const { data, error } = await supabase
          .from("clinics")
          .update({ settings: nextSettings as Json })
          .eq("id", clinic.id)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const updatedClinic = data as ClinicRow;
        const parsedDefinitions = parseClinicRoleDefinitions(updatedClinic.settings);

        setClinic(updatedClinic);
        setRoleDefinitions(parsedDefinitions);

        setInviteRole((currentRole) =>
          parsedDefinitions.some((role) => role.key === currentRole) ? currentRole : "staff"
        );

        return true;
      } catch (error) {
        logger.error("Failed to persist role definitions", error instanceof Error ? error : new Error(String(error)), { clinicId: clinic.id });
        toast({
          title: "Error",
          description: "Failed to save role definitions",
          variant: "destructive",
        });
        return false;
      } finally {
        setRoleSaving(false);
      }
    },
    [clinic]
  );

  const fetchData = useCallback(async () => {
    if (!user?.id || !scopedClinic?.id) return;

    try {
      setIsLoading(true);

      setClinic(scopedClinic);

      const parsedDefinitions = parseClinicRoleDefinitions(scopedClinic.settings);
      setRoleDefinitions(parsedDefinitions);

      setInviteRole((currentRole) =>
        parsedDefinitions.some((role) => role.key === currentRole) ? currentRole : "staff"
      );

      const { data: staffData, error: staffError } = await supabase
        .from("clinic_staff")
        .select("*")
        .eq("clinic_id", scopedClinic.id);

      if (staffError) {
        logger.error("Staff fetch error", staffError, { clinicId: scopedClinic.id });
      } else if (staffData) {
        const typedStaffRows = Array.isArray(staffData) ? (staffData as unknown as ClinicStaffRow[]) : [];

        const userIds = [...new Set(
          typedStaffRows
            .map((member) => member.user_id)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )];

        let profileMap = new Map<string, StaffMember["profile"]>();

        if (userIds.length > 0) {
          const { data: profileRows, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name, email, phone_number")
            .in("id", userIds);

          if (profileError) {
            logger.warn("Staff profile fetch warning", {
              clinicId: scopedClinic.id,
              reason: profileError.message,
            });
          } else if (profileRows) {
            profileMap = new Map(
              profileRows.map((profile) => [
                profile.id,
                {
                  id: profile.id,
                  full_name: profile.full_name,
                  email: profile.email,
                  phone_number: profile.phone_number,
                },
              ])
            );
          }
        }

        const normalizedStaff = typedStaffRows.map((member) => ({
          ...member,
          profile: profileMap.get(member.user_id) ?? null,
        })) as StaffMember[];

        setStaff(normalizedStaff);
      }
    } catch (error) {
      logger.error("Error fetching data", error instanceof Error ? error : new Error(String(error)), { userId: user.id });
    } finally {
      setIsLoading(false);
    }
  }, [scopedClinic, user]);

  useEffect(() => {
    if (user && scopedClinic?.id) fetchData();
  }, [fetchData, scopedClinic?.id, user]);

  useEffect(() => {
    if (showRoleEditor && !editingRole) {
      setRolePermissionsDraft(permissionsFromBaseRole(roleBaseDraft));
    }
  }, [editingRole, roleBaseDraft, showRoleEditor]);

  const handleInviteStaff = async () => {
    if (!canManageTeam) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to manage team members.",
        variant: "destructive",
      });
      return;
    }

    if (!inviteEmail || !inviteName) {
      toast({
        title: "Error",
        description: "Please enter email and name",
        variant: "destructive",
      });
      return;
    }

    const finalRole = normalizeRoleKey(inviteRole);
    if (!finalRole || !roleDefinitions.some((role) => role.key === finalRole)) {
      toast({
        title: "Error",
        description: "Please select a valid role",
        variant: "destructive",
      });
      return;
    }

    if (!clinic) {
      toast({
        title: "Clinic not loaded",
        description: "Please wait for clinic data to load and try again.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const invitationBody = {
        clinicId: clinic.id,
        email: inviteEmail,
        fullName: inviteName,
        role: finalRole,
      };
      
      logger.debug("Sending invitation", { clinicId: clinic.id, email: inviteEmail, role: finalRole });
      
      const { data, error } = await supabase.functions.invoke("send-staff-invitation", {
        body: invitationBody,
      });
      
      if (error) {
        logger.error("Invitation response error", error, { clinicId: clinic.id, email: inviteEmail });
        throw error;
      } else {
        logger.info("Invitation sent successfully", { clinicId: clinic.id, email: inviteEmail, role: finalRole });
      }

      toast({
        title: "Success",
        description: `Invitation sent to ${inviteName} as ${finalRole.replace(/_/g, ' ')}`,
      });

      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("staff");
    } catch (error) {
      logger.error("Error sending invitation", error instanceof Error ? error : new Error(String(error)), { clinicId: clinic?.id, email: inviteEmail });
      toast({
        title: "Error",
        description: "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const openCreateRoleEditor = () => {
    if (!canManageRoles) return;
    setEditingRole(null);
    setRoleLabelDraft("");
    setRoleBaseDraft("staff");
    setRolePermissionsDraft(permissionsFromBaseRole("staff"));
    setShowRoleEditor(true);
  };

  const openEditRoleEditor = (role: ClinicRoleDefinition) => {
    if (!canManageRoles) return;
    setEditingRole(role);
    setRoleLabelDraft(role.label);
    setRoleBaseDraft(role.baseRole);
    setRolePermissionsDraft({ ...role.permissions });
    setShowRoleEditor(true);
  };

  const closeRoleEditor = () => {
    setShowRoleEditor(false);
    setEditingRole(null);
  };

  const toggleRolePermission = (permissionKey: keyof ClinicRolePermissions, value: boolean) => {
    setRolePermissionsDraft((prev) => ({
      ...prev,
      [permissionKey]: value,
    }));
  };

  const handleSaveRole = async () => {
    if (!canManageRoles) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to manage role definitions.",
        variant: "destructive",
      });
      return;
    }

    const label = roleLabelDraft.trim();
    if (!label) {
      toast({
        title: "Missing role name",
        description: "Please provide a role name",
        variant: "destructive",
      });
      return;
    }

    const roleKey = editingRole?.key || normalizeRoleKey(label);
    if (!roleKey) {
      toast({
        title: "Invalid role name",
        description: "Role name should include letters or numbers",
        variant: "destructive",
      });
      return;
    }

    if (!editingRole && roleDefinitions.some((role) => role.key === roleKey)) {
      toast({
        title: "Role already exists",
        description: "Choose a different role name",
        variant: "destructive",
      });
      return;
    }

    const nextRole: ClinicRoleDefinition = {
      key: roleKey,
      label,
      baseRole: editingRole?.isSystem ? editingRole.baseRole : roleBaseDraft,
      permissions: { ...rolePermissionsDraft },
      isSystem: editingRole?.isSystem || false,
    };

    const nextDefinitions = editingRole
      ? roleDefinitions.map((role) => (role.key === editingRole.key ? nextRole : role))
      : [...roleDefinitions, nextRole];

    const saved = await persistRoleDefinitions(nextDefinitions);
    if (saved) {
      closeRoleEditor();
      toast({
        title: "Saved",
        description: `Role \"${label}\" updated`,
      });
    }
  };

  const handleDeleteRole = async (role: ClinicRoleDefinition) => {
    if (!canManageRoles) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to manage role definitions.",
        variant: "destructive",
      });
      return;
    }

    if (role.isSystem) {
      toast({
        title: "System role",
        description: "Staff and Doctor roles cannot be deleted",
        variant: "destructive",
      });
      return;
    }

    const assigned = staff.some((member) => normalizeRoleKey(member.role || "") === role.key);
    if (assigned) {
      toast({
        title: "Role in use",
        description: "Reassign staff members before deleting this role",
        variant: "destructive",
      });
      return;
    }

    const nextDefinitions = roleDefinitions.filter((entry) => entry.key !== role.key);
    const saved = await persistRoleDefinitions(nextDefinitions);
    if (saved) {
      toast({
        title: "Deleted",
        description: `Role \"${role.label}\" removed`,
      });
    }
  };

  const handleChangeStaffRole = async (staffId: string, nextRoleKey: string) => {
    if (!canAssignTeamRoles) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to change role assignments.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingStaffId(staffId);
    try {
      await staffService.updateStaff(staffId, { role: nextRoleKey });
      setStaff((prev) =>
        prev.map((member) =>
          member.id === staffId
            ? {
                ...member,
                role: nextRoleKey,
              }
            : member
        )
      );

      toast({
        title: "Role updated",
        description: "Staff permissions were updated for this clinic",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update staff role",
        variant: "destructive",
      });
    } finally {
      setUpdatingStaffId(null);
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!canManageTeam) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to remove staff members.",
        variant: "destructive",
      });
      return;
    }

    try {
      await staffService.removeStaff(staffId);
      setStaff(staff.filter((s) => s.id !== staffId));
      toast({
        title: "Success",
        description: "Staff member removed",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove staff member",
        variant: "destructive",
      });
    }
  };

  if (accessLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground mb-1">Loading team data...</p>
            <p className="text-sm text-muted-foreground">Please wait a moment</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!scopedClinic || !clinic) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="border border-border bg-card">
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground mb-1">No Clinic Found</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              You don't have a clinic associated with your account.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canViewTeam) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="border border-border bg-card max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground mb-1">Permission Required</p>
            <p className="text-sm text-muted-foreground">
              Your role does not include access to team management.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Team</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage staff members and send invitations
          </p>
        </div>

        {canManageTeam && (
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90 h-8 px-3 text-xs font-medium w-fit">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Invite
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite New Staff Member</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new team member to your clinic
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="staff-name">Full Name</Label>
                <Input
                  id="staff-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Dr. Sarah Johnson"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-email">Email Address</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="sarah@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={setInviteRole}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleDefinitions.map((role) => (
                      <SelectItem key={role.key} value={role.key}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Need a different role? Create one in the Roles & Permissions section below.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowInvite(false);
                setInviteRole("staff");
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleInviteStaff} 
                disabled={sending}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">Total Members</span>
            <div className="p-1.5 rounded-md bg-muted">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-foreground">{staff.length}</div>
        </div>

        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">Active Staff</span>
            <div className="p-1.5 rounded-md bg-muted">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-foreground">{staff.filter(s => s.is_active).length}</div>
        </div>

        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">Role Profiles</span>
            <div className="p-1.5 rounded-md bg-muted">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-foreground">{roleDefinitions.length}</div>
        </div>
      </div>

      {/* Role Definitions */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Roles & Permissions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Keep core roles small, customize permissions per clinic, and create custom roles when needed.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={openCreateRoleEditor}
            disabled={roleSaving || !canManageRoles}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Custom Role
          </Button>
        </div>

        <div className="divide-y divide-border">
          {roleDefinitions.map((role) => {
            const allowedCount = countAllowedPermissions(role.permissions);
            const totalPermissions = Object.keys(CLINIC_PERMISSION_LABELS).length;
            return (
              <div key={role.key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{role.label}</p>
                    {role.isSystem && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        System
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                      {role.baseRole}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {allowedCount}/{totalPermissions} permissions enabled
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canManageRoles && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => openEditRoleEditor(role)}
                      disabled={roleSaving}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                  {!role.isSystem && canManageRoles && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteRole(role)}
                      disabled={roleSaving}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff Table */}
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        {staff.length === 0 ? (
          <div className="text-center py-12 px-4 bg-card">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
              <UserPlus className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">No staff members yet</p>
            <p className="text-xs text-muted-foreground mb-4">Invite your first team member to get started</p>
            {canManageTeam && (
              <Button 
                onClick={() => setShowInvite(true)}
                size="sm"
                className="bg-foreground text-background hover:bg-foreground/90 h-8 px-3 text-xs font-medium"
              >
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                Invite
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="font-medium">Name</TableHead>
                <TableHead className="font-medium">Email</TableHead>
                <TableHead className="font-medium">Status</TableHead>
                <TableHead className="font-medium">Role</TableHead>
                <TableHead className="font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="h-9 w-9 rounded-lg bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                          {(member.profile?.full_name || "U").charAt(0).toUpperCase()}
                        </div>
                        {member.is_active && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-background rounded-full"></div>
                        )}
                      </div>
                      <span className="font-medium text-foreground">
                        {member.profile?.full_name || "Unknown"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.profile?.email || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? "default" : "secondary"} className="text-xs">
                      {member.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const memberRoleKey = normalizeRoleKey(member.role || "staff");
                      const roleChoices = getRoleChoicesForMember(memberRoleKey, roleDefinitions);
                      if (!canAssignTeamRoles) {
                        return (
                          <Badge variant="outline" className="text-xs">
                            {getRoleLabel(memberRoleKey, roleDefinitions)}
                          </Badge>
                        );
                      }

                      return (
                        <Select
                          value={memberRoleKey}
                          onValueChange={(value) => handleChangeStaffRole(member.id, value)}
                          disabled={updatingStaffId === member.id || roleSaving}
                        >
                          <SelectTrigger className="h-8 text-xs min-w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleChoices.map((role) => (
                              <SelectItem key={role.key} value={role.key} className="text-xs">
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageTeam && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveStaff(member.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Role Editor */}
      <Dialog open={showRoleEditor && canManageRoles} onOpenChange={(open) => (open ? setShowRoleEditor(true) : closeRoleEditor())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? `Edit ${editingRole.label}` : "Create Custom Role"}
            </DialogTitle>
            <DialogDescription>
              Configure what this role can do in your clinic.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="role-label">Role Name</Label>
              <Input
                id="role-label"
                value={roleLabelDraft}
                onChange={(event) => setRoleLabelDraft(event.target.value)}
                placeholder="e.g. Triage Coordinator"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-base">Base Role</Label>
              <Select
                value={roleBaseDraft}
                onValueChange={(value) => setRoleBaseDraft(value as BaseClinicRole)}
                disabled={editingRole?.isSystem}
              >
                <SelectTrigger id="role-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {Object.entries(CLINIC_PERMISSION_LABELS).map(([permissionKey, label]) => {
                  const key = permissionKey as keyof ClinicRolePermissions;
                  return (
                    <div key={permissionKey} className="flex items-center justify-between px-3 py-2.5">
                      <p className="text-sm text-foreground">{label}</p>
                      <Switch
                        checked={rolePermissionsDraft[key]}
                        onCheckedChange={(checked) => toggleRolePermission(key, checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeRoleEditor}>
              Cancel
            </Button>
            <Button onClick={handleSaveRole} disabled={roleSaving}>
              {roleSaving ? "Saving..." : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

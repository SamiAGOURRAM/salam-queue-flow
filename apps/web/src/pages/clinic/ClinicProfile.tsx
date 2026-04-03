import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { patientService } from "@/services/patient";
import { staffService } from "@/services/staff";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Save, User, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import {
  getPermissionEntries,
  getRoleLabel,
  getRolePermissions,
  normalizeRoleKey,
  parseClinicRoleDefinitions,
} from "@/lib/clinicRolePermissions";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type ClinicStaffRow = Database["public"]["Tables"]["clinic_staff"]["Row"];

function formatJoinedDate(raw: string | null): string {
  if (!raw) return "Not available";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readClinicSettings(settings: ClinicRow["settings"]): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  return settings as Record<string, unknown>;
}

export default function ClinicProfile() {
  const { user, loading, isClinicOwner } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [clinicName, setClinicName] = useState("Your Clinic");
  const [roleLabel, setRoleLabel] = useState("Staff");
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Array<{ key: string; label: string; allowed: boolean }>>([]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;

    const [{ data: profileData, error: profileError }, { data: staffData }, { data: ownerClinicData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("clinic_staff").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("clinics").select("*").eq("owner_id", user.id).maybeSingle(),
    ]);

    if (profileError || !profileData) {
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
      return;
    }

    let clinicData = ownerClinicData as ClinicRow | null;
    const activeStaff = (staffData || null) as ClinicStaffRow | null;

    if (!clinicData && activeStaff?.clinic_id) {
      const { data } = await supabase
        .from("clinics")
        .select("*")
        .eq("id", activeStaff.clinic_id)
        .maybeSingle();
      clinicData = (data || null) as ClinicRow | null;
    }

    const clinicSettings = readClinicSettings(clinicData?.settings || null);
    const roleDefinitions = parseClinicRoleDefinitions(clinicSettings);
    const roleKey = isClinicOwner
      ? "clinic_owner"
      : normalizeRoleKey(activeStaff?.role || "staff");

    const resolvedPermissions = getRolePermissions(roleKey, roleDefinitions, isClinicOwner);
    const permissionEntries = getPermissionEntries(resolvedPermissions);

    let membershipCreatedAt: string | null = activeStaff?.created_at || null;

    if (!membershipCreatedAt && clinicData?.id) {
      const { data: membership } = await supabase
        .from("user_roles")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("clinic_id", clinicData.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      membershipCreatedAt = membership?.created_at || null;
    }

    setClinicName(clinicData?.name || "Your Clinic");
    setRoleLabel(getRoleLabel(roleKey, roleDefinitions));
    setJoinedAt(membershipCreatedAt || profileData.created_at);
    setPermissions(permissionEntries);

    setFullName(profileData.full_name || "");
    setEmail(profileData.email || "");
    setPhone(profileData.phone_number || "");
    setSpecialization(activeStaff?.specialization || "");
    setLicenseNumber(activeStaff?.license_number || "");
  }, [isClinicOwner, user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
      return;
    }
    if (user) {
      fetchProfile();
    }
  }, [user, loading, navigate, fetchProfile]);

  const handleSave = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      // Use PatientService to update profile
      await patientService.updatePatientProfile(user.id, {
        fullName,
        email,
        phoneNumber: phone,
      });

      // Use StaffService to update staff info
      const staff = await staffService.getStaffByUser(user.id);
      if (staff) {
        await staffService.updateStaff(staff.id, {
          specialization,
          licenseNumber,
        });
      }

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const allowedPermissions = permissions.filter((entry) => entry.allowed);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View your clinic role, permissions, and contact details.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Role & Membership
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="outline">{roleLabel}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Clinic</span>
              <span className="text-sm font-medium">{clinicName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Joined</span>
              <span className="text-sm font-medium">{formatJoinedDate(joinedAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              What You Can Do
            </CardTitle>
            <CardDescription>
              {allowedPermissions.length} permissions enabled for your role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {permissions.map((permission) => (
              <div key={permission.key} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                <span className="text-sm">{permission.label}</span>
                <Badge variant={permission.allowed ? "default" : "secondary"}>
                  {permission.allowed ? "Allowed" : "Not allowed"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            Contact & Professional Info
          </CardTitle>
          <CardDescription>
            Keep your personal details and professional information up to date.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. John Doe"
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 XXX XXX XXX"
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="specialization" className="text-sm font-medium">Specialization</Label>
              <Input
                id="specialization"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g., General Practice, Cardiology"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license" className="text-sm font-medium">License Number</Label>
              <Input
                id="license"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Medical License Number"
                className="h-10"
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate("/clinic/team")}>Manage Team</Button>
        <Button variant="outline" onClick={() => navigate("/clinic/settings?tab=basic")}>Clinic Settings</Button>
      </div>
    </div>
  );
}

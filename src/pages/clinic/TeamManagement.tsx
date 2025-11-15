import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, Trash2, Users, Sparkles, Shield, Activity } from "lucide-react";
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
import type { Database } from "@/integrations/supabase/types";

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

export default function TeamManagement() {
  const { user } = useAuth();
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("receptionist");
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [customRole, setCustomRole] = useState("");
  const [sending, setSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Predefined staff roles
  const PREDEFINED_ROLES = [
    { value: "doctor", label: "Doctor" },
    { value: "surgeon", label: "Surgeon" },
    { value: "nurse", label: "Nurse" },
    { value: "receptionist", label: "Receptionist" },
    { value: "lab_technician", label: "Lab Technician" },
    { value: "pharmacist", label: "Pharmacist" },
    { value: "radiologist", label: "Radiologist" },
    { value: "dentist", label: "Dentist" },
    { value: "anesthesiologist", label: "Anesthesiologist" },
    { value: "physiotherapist", label: "Physiotherapist" },
    { value: "other", label: "Other (specify)" },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        // Fetch clinic
        const { data: clinicData, error: clinicError } = await supabase
          .from("clinics")
          .select("*")
          .eq("owner_id", user?.id)
          .single();

        if (clinicError) {
          console.error("Clinic fetch error:", clinicError);
          setIsLoading(false);
          return;
        }

        if (clinicData) {
          setClinic(clinicData);

          // Fetch staff members
          const { data: staffData, error: staffError } = await supabase
            .from("clinic_staff")
            .select(`
              *,
              profile:profiles!user_id(id, full_name, email, phone_number)
            `)
            .eq("clinic_id", clinicData.id);

          if (staffError) {
            console.error("Staff fetch error:", staffError);
          } else if (staffData) {
            console.log("Fetched staff data:", staffData);
            const typedStaff = Array.isArray(staffData) ? (staffData as StaffMember[]) : [];
            setStaff(typedStaff);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) fetchData();
  }, [user]);

  const handleInviteStaff = async () => {
    if (!inviteEmail || !inviteName) {
      toast({
        title: "Error",
        description: "Please enter email and name",
        variant: "destructive",
      });
      return;
    }

    // Validate role
    const finalRole = showCustomRole ? customRole.trim() : inviteRole;
    if (!finalRole) {
      toast({
        title: "Error",
        description: "Please select or specify a role",
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
      // Call edge function to send invitation
      const invitationBody = {
        clinicId: clinic.id,
        email: inviteEmail,
        fullName: inviteName,
        role: finalRole,
      };
      
      console.log("Sending invitation with body:", invitationBody);
      
      const { data, error } = await supabase.functions.invoke("send-staff-invitation", {
        body: invitationBody,
      });
      
      console.log("Invitation response:", { data, error });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Invitation sent to ${inviteName} as ${finalRole.replace(/_/g, ' ')}`,
      });

      // Reset all fields
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("receptionist");
      setShowCustomRole(false);
      setCustomRole("");
    } catch (error) {
      console.error("Error sending invitation:", error);
      toast({
        title: "Error",
        description: "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    try {
      await supabase.from("clinic_staff").delete().eq("id", staffId);

      setStaff(staff.filter((s) => s.id !== staffId));

      toast({
        title: "Success",
        description: "Staff member removed",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove staff member",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto animate-pulse">
            <Users className="w-10 h-10 text-blue-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Loading team data...</h3>
            <p className="text-gray-500">Please wait a moment</p>
          </div>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-red-600" />
            </div>
            <CardTitle className="text-2xl">No Clinic Found</CardTitle>
            <CardDescription className="text-base mt-2">
              You don't have a clinic associated with your account.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Clean Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Your Team</h1>
          <p className="text-base text-gray-600">Manage staff members and send invitations</p>
        </div>
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogTrigger asChild>
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all rounded-xl"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Invite Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">Invite New Staff Member</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new team member to your clinic
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="staff-name" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="staff-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Dr. Sarah Johnson"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="sarah@example.com"
                  className="h-11"
                />
              </div>
              
              {/* Role Selection */}
              <div className="space-y-2">
                <Label htmlFor="staff-role" className="text-sm font-medium">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => {
                    setInviteRole(value);
                    setShowCustomRole(value === "other");
                    if (value !== "other") setCustomRole("");
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREDEFINED_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Role Input (conditional) */}
              {showCustomRole && (
                <div className="space-y-2">
                  <Label htmlFor="custom-role" className="text-sm font-medium">
                    Specify Role
                  </Label>
                  <Input
                    id="custom-role"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="e.g., Medical Assistant, Consultant"
                    className="h-11"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowInvite(false);
                setInviteRole("receptionist");
                setShowCustomRole(false);
                setCustomRole("");
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleInviteStaff} 
                disabled={sending}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-blue-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Total Members</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 group-hover:scale-110 transition-transform">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {staff.length}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-green-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Active Staff</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-100 to-emerald-200 group-hover:scale-110 transition-transform">
                <Activity className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {staff.filter(s => s.is_active).length}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-purple-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Clinic</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-purple-200 group-hover:scale-110 transition-transform">
                <Sparkles className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 truncate">
              {clinic?.name || "Your Clinic"}
            </div>
          </div>
        </div>
      </div>

      {/* Staff List Card */}
      <Card className="relative overflow-hidden shadow-xl border-0 bg-white rounded-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-transparent rounded-full blur-3xl"></div>
        <CardHeader className="border-b bg-gradient-to-r from-blue-50/50 via-sky-50/30 to-cyan-50/50 relative z-10 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">Staff Members</CardTitle>
              <CardDescription className="text-base mt-2 text-gray-600">
                {staff.length} active team {staff.length === 1 ? "member" : "members"}
              </CardDescription>
            </div>
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
              <Users className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 relative z-10">
          {staff.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
                <UserPlus className="w-12 h-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">No staff members yet</h3>
              <p className="text-gray-500 mb-6 text-base">Invite your first team member to get started</p>
              <Button 
                onClick={() => setShowInvite(true)}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all rounded-xl"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Staff Member
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="group flex items-center justify-between p-6 border-2 border-gray-100 rounded-2xl hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-lg transition-all duration-200 bg-white"
                >
                  <div className="flex items-center gap-5 flex-1">
                    <div className="relative">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl shadow-lg group-hover:scale-110 transition-transform">
                        {(member.profile?.full_name || "U").charAt(0).toUpperCase()}
                      </div>
                      {member.is_active && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-gray-900 truncate">
                        {member.profile?.full_name || "Unknown"}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{member.profile?.email}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge 
                          className={
                            member.is_active 
                              ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-sm" 
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border-blue-200">
                          <Shield className="w-3 h-3 mr-1" />
                          <span className="capitalize">{member.role?.replace(/_/g, ' ') || "Staff"}</span>
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveStaff(member.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl h-10 w-10"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
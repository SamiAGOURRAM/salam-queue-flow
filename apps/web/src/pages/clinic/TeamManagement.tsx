import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { staffService } from "@/services/staff";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        const { data: clinicData, error: clinicError } = await supabase
          .from("clinics")
          .select("*")
          .eq("owner_id", user?.id)
          .single();

        if (clinicError) {
          logger.error("Clinic fetch error", clinicError, { userId: user?.id });
          setIsLoading(false);
          return;
        }

        if (clinicData) {
          setClinic(clinicData);

          const { data: staffData, error: staffError } = await supabase
            .from("clinic_staff")
            .select(`
              *,
              profile:profiles!user_id(id, full_name, email, phone_number)
            `)
            .eq("clinic_id", clinicData.id);

          if (staffError) {
            logger.error("Staff fetch error", staffError, { clinicId: clinicData.id });
          } else if (staffData) {
            logger.debug("Fetched staff data", { clinicId: clinicData.id, staffCount: staffData.length });
            const typedStaff = Array.isArray(staffData) ? (staffData as StaffMember[]) : [];
            setStaff(typedStaff);
          }
        }
      } catch (error) {
        logger.error("Error fetching data", error instanceof Error ? error : new Error(String(error)), { userId: user?.id });
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
      setInviteRole("receptionist");
      setShowCustomRole(false);
      setCustomRole("");
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

  const handleRemoveStaff = async (staffId: string) => {
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

  if (isLoading) {
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

  if (!clinic) {
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
                  onValueChange={(value) => {
                    setInviteRole(value);
                    setShowCustomRole(value === "other");
                    if (value !== "other") setCustomRole("");
                  }}
                >
                  <SelectTrigger>
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
              {showCustomRole && (
                <div className="space-y-2">
                  <Label htmlFor="custom-role">Specify Role</Label>
                  <Input
                    id="custom-role"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="e.g., Medical Assistant, Consultant"
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
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            <span className="text-xs text-muted-foreground font-medium">Clinic</span>
            <div className="p-1.5 rounded-md bg-muted">
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="text-sm font-semibold text-foreground truncate">{clinic?.name || "Your Clinic"}</div>
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
            <Button 
              onClick={() => setShowInvite(true)}
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 h-8 px-3 text-xs font-medium"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Invite
            </Button>
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
                    <Badge variant="outline" className="text-xs">
                      <Shield className="w-3 h-3 mr-1" />
                      <span className="capitalize">{member.role?.replace(/_/g, ' ') || "Staff"}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveStaff(member.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

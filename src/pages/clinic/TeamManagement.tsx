import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Trash2, Users } from "lucide-react";
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

export default function TeamManagement() {
  const { user } = useAuth();
  const [clinic, setClinic] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [sending, setSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
            setStaff(staffData);
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

    setSending(true);
    try {
      // Call edge function to send invitation
      const { data, error } = await supabase.functions.invoke("send-staff-invitation", {
        body: {
          clinicId: clinic.id,
          email: inviteEmail,
          fullName: inviteName,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Invitation sent successfully",
      });

      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
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
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading team data...</p>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No Clinic Found</CardTitle>
            <CardDescription>You don't have a clinic associated with your account.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Your Team</h2>
          <p className="text-base text-muted-foreground">Manage staff members and send invitations</p>
        </div>
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogTrigger asChild>
            <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg">
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInvite(false)}>
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

      {/* Staff List Card */}
      <Card className="shadow-lg border-0 bg-white">
        <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Staff Members</CardTitle>
              <CardDescription className="text-base mt-1">
                {staff.length} active team {staff.length === 1 ? "member" : "members"}
              </CardDescription>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {staff.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No staff members yet</h3>
              <p className="text-gray-500 mb-6">Invite your first team member to get started</p>
              <Button 
                onClick={() => setShowInvite(true)}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Staff Member
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="group flex items-center justify-between p-5 border-2 border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all duration-200 bg-white"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                      {(member.profile?.full_name || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-900">{member.profile?.full_name || "Unknown"}</h3>
                      <p className="text-sm text-gray-500">{member.profile?.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge 
                          variant={member.is_active ? "default" : "secondary"}
                          className={member.is_active ? "bg-green-100 text-green-700 border-green-200" : ""}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className="border-blue-200 text-blue-700">
                          {member.role || "Staff"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveStaff(member.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50"
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
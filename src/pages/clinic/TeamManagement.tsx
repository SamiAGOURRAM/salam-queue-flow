import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, ArrowLeft, UserPlus, Mail, Trash2 } from "lucide-react";
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

export default function ClinicTeam() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
      return;
    }

    const fetchData = async () => {
      // Fetch clinic
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("*")
        .eq("owner_id", user?.id)
        .single();

      if (clinicData) {
        setClinic(clinicData);

        // Fetch staff members
        const { data: staffData } = await supabase
          .from("clinic_staff")
          .select(`
            *,
            profile:profiles(id, full_name, email, phone_number)
          `)
          .eq("clinic_id", clinicData.id);

        if (staffData) setStaff(staffData);
      }
    };

    if (user) fetchData();
  }, [user, loading, navigate]);

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
          name: inviteName,
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

  if (loading || !clinic) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold">{clinic?.name || "QueueMed"}</span>
          </div>
          <Button variant="outline" onClick={() => navigate("/clinic/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Team Management</h1>
            <p className="text-muted-foreground">Manage your clinic staff members</p>
          </div>
          <Dialog open={showInvite} onOpenChange={setShowInvite}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Staff
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Staff Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join your clinic team
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="staff-name">Full Name</Label>
                  <Input
                    id="staff-name"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Email Address</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInvite(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInviteStaff} disabled={sending}>
                  <Mail className="w-4 h-4 mr-2" />
                  {sending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Staff Members</CardTitle>
            <CardDescription>
              {staff.length} active team {staff.length === 1 ? "member" : "members"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {staff.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No staff members yet</p>
                <p className="text-sm">Invite your first team member to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {staff.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold">{member.profile?.full_name || "Unknown"}</h3>
                      <p className="text-sm text-muted-foreground">{member.profile?.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={member.is_active ? "default" : "secondary"}>
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">{member.role || "Staff"}</Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveStaff(member.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

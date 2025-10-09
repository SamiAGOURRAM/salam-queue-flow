import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, Users, Clock, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    full_name: string;
    phone_number: string;
  };
}

interface Invitation {
  id: string;
  phone_number: string;
  full_name: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export default function TeamManagement() {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, isClinicOwner } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !isClinicOwner) {
      navigate("/");
      return;
    }
    fetchTeamData();
  }, [user, isClinicOwner, navigate]);

  const fetchTeamData = async () => {
    // Get clinic ID
    const { data: clinicData } = await supabase
      .from("clinics")
      .select("id")
      .eq("owner_id", user?.id)
      .single();

    if (!clinicData) return;

    // Fetch staff members with profiles
    const { data: staff } = await supabase
      .from("clinic_staff")
      .select("id, user_id, role")
      .eq("clinic_id", clinicData.id);

    if (staff) {
      // Fetch profiles separately
      const userIds = staff.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const staffWithProfiles = staff
        .filter(s => profileMap.has(s.user_id))
        .map(s => ({
          ...s,
          profiles: profileMap.get(s.user_id)!
        }));
      
      setStaffMembers(staffWithProfiles as StaffMember[]);
    }

    // Fetch invitations
    const { data: invites } = await supabase
      .from("staff_invitations")
      .select("*")
      .eq("clinic_id", clinicData.id)
      .order("created_at", { ascending: false });

    if (invites) setInvitations(invites);
  };

  const handleInvite = async () => {
    if (!fullName || !phone) {
      toast({
        title: "Missing information",
        description: "Please enter both name and phone number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("id")
        .eq("owner_id", user?.id)
        .single();

      if (!clinicData) throw new Error("Clinic not found");

      // Call edge function to create invitation and send SMS
      const { data, error } = await supabase.functions.invoke("send-staff-invitation", {
        body: {
          clinicId: clinicData.id,
          fullName,
          phoneNumber: phone,
        },
      });

      if (error) throw error;

      toast({
        title: "Invitation sent!",
        description: `SMS invitation sent to ${fullName}`,
      });

      setIsDialogOpen(false);
      setFullName("");
      setPhone("");
      fetchTeamData();
    } catch (error: any) {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage your clinic staff and invitations</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New Staff Member</DialogTitle>
              <DialogDescription>
                Send an SMS invitation to add a receptionist to your clinic
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+212 XXX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={loading}>
                {loading ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Active Staff
            </CardTitle>
            <CardDescription>Current team members with access</CardDescription>
          </CardHeader>
          <CardContent>
            {staffMembers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No staff members yet</p>
            ) : (
              <div className="space-y-3">
                {staffMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{member.profiles.full_name}</p>
                      <p className="text-sm text-muted-foreground">{member.profiles.phone_number}</p>
                    </div>
                    <Badge variant="secondary">{member.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>Invitations waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending invitations</p>
            ) : (
              <div className="space-y-3">
                {invitations.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{invite.full_name}</p>
                      <p className="text-sm text-muted-foreground">{invite.phone_number}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expires: {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        invite.status === "pending"
                          ? "outline"
                          : invite.status === "accepted"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {invite.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                      {invite.status === "accepted" && <CheckCircle className="w-3 h-3 mr-1" />}
                      {invite.status === "expired" && <XCircle className="w-3 h-3 mr-1" />}
                      {invite.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

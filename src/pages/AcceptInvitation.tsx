import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Activity, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Invitation {
  id: string;
  clinic_id: string;
  full_name: string;
  phone_number: string;
  status: string;
  clinics: {
    name: string;
    specialty: string;
  };
}

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    try {
      const { data, error } = await supabase
        .from("staff_invitations")
        .select(`
          *,
          clinics (
            name,
            specialty
          )
        `)
        .eq("invitation_token", token)
        .eq("status", "pending")
        .single();

      if (error || !data) {
        throw new Error("Invitation not found or already used");
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        throw new Error("This invitation has expired");
      }

      setInvitation(data as Invitation);
    } catch (error: any) {
      toast({
        title: "Invalid invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!invitation) return;

    setAccepting(true);
    try {
      // Check if user is logged in
      if (!user) {
        // Redirect to signup with phone pre-filled
        navigate(`/auth/signup?phone=${encodeURIComponent(invitation.phone_number)}`);
        return;
      }

      // Create staff record
      const { error: staffError } = await supabase
        .from("clinic_staff")
        .insert({
          clinic_id: invitation.clinic_id,
          user_id: user.id,
          role: "receptionist",
        });

      if (staffError) throw staffError;

      // Create user role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: user.id,
          role: "staff",
          clinic_id: invitation.clinic_id,
        });

      if (roleError) throw roleError;

      // Update invitation status
      const { error: updateError } = await supabase
        .from("staff_invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitation.id);

      if (updateError) throw updateError;

      toast({
        title: "Welcome to the team!",
        description: `You've joined ${invitation.clinics.name}`,
      });

      navigate("/clinic/queue");
    } catch (error: any) {
      toast({
        title: "Failed to accept invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="w-16 h-16 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/")}>
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Activity className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold">QueueMed</span>
          </div>
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-primary" />
          </div>
          <CardTitle>You're Invited!</CardTitle>
          <CardDescription>
            Join <strong>{invitation.clinics.name}</strong> as a receptionist
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-accent rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Clinic</span>
              <span className="font-medium">{invitation.clinics.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Specialty</span>
              <span className="font-medium">{invitation.clinics.specialty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Your Name</span>
              <span className="font-medium">{invitation.full_name}</span>
            </div>
          </div>

          {!user && (
            <p className="text-sm text-muted-foreground text-center">
              You'll need to create an account to accept this invitation
            </p>
          )}

          <Button className="w-full" onClick={handleAccept} disabled={accepting}>
            {accepting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Accepting...
              </>
            ) : (
              user ? "Accept Invitation" : "Create Account & Accept"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

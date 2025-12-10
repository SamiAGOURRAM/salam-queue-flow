import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Activity, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { staffService } from "@/services/staff";
import { invitationService } from "@/services/invitation";
import { patientService } from "@/services/patient";
import { logger } from "@/services/shared/logging/Logger";

import type { Invitation } from "@/services/invitation";

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  const fetchInvitation = useCallback(async () => {
    if (!token) return;
    try {
      const invitationData = await invitationService.getInvitationByToken(token);
      
      logger.debug("Fetched invitation data", { invitationId: invitationData.id, role: invitationData.role, clinicId: invitationData.clinicId });
      
      // Map to the component's expected format
      setInvitation({
        ...invitationData,
        clinic_id: invitationData.clinicId,
        full_name: invitationData.fullName,
        phone_number: invitationData.phoneNumber,
        clinics: invitationData.clinic,
      } as Invitation & { clinic_id: string; full_name: string; phone_number?: string; clinics?: { name: string; specialty: string } });
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : "Invitation not found";
      toast({
        title: "Invalid invitation",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  const handleAccept = async () => {
    if (!invitation) return;

    setAccepting(true);
    try {
      // Check if user is logged in
      if (!user) {
        // Redirect to staff signup with email, name, and invitation token
        navigate(`/auth/staff-signup?email=${encodeURIComponent(invitation.email)}&name=${encodeURIComponent(invitation.full_name)}&token=${token}`);
        return;
      }

      // Check if logged-in user's email matches the invitation
      const profile = await patientService.getPatientProfile(user.id);

      const invitationContact = invitation.email || invitation.phone_number;
      const profileContact = profile.email || profile.phoneNumber;

      if (profile && invitationContact && profileContact && profileContact !== invitationContact) {
        toast({
          title: "Wrong account",
          description: `This invitation is for ${invitationContact}. Please log out and create an account with that contact.`,
          variant: "destructive",
        });
        setAccepting(false);
        return;
      }

      // Check if user is already staff at this clinic
      const existingStaff = await staffService.getStaffByClinicAndUser(invitation.clinic_id, user.id);

      if (!existingStaff) {
        // Use StaffService to create staff record
        logger.debug("Creating new staff record", { role: invitation.role, userId: user.id, clinicId: invitation.clinic_id });
        await staffService.addStaff({
          clinicId: invitation.clinic_id,
          userId: user.id,
          role: invitation.role,
        });
        logger.info("Staff record created successfully", { userId: user.id, clinicId: invitation.clinic_id, role: invitation.role });
      } else {
        logger.debug("User is already staff at this clinic", { userId: user.id, clinicId: invitation.clinic_id });
      }

      // Check if user role already exists
      const { data: existingRole, error: checkRoleError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("clinic_id", invitation.clinic_id)
        .maybeSingle();

      // Ignore "not found" errors, only throw on real errors
      if (checkRoleError && checkRoleError.code !== 'PGRST116') {
        logger.error("Error checking existing role", checkRoleError, { userId: user.id, clinicId: invitation.clinic_id });
        throw checkRoleError;
      }

      if (!existingRole) {
        // Create user role only if doesn't exist
        logger.debug("Creating new user role", { userId: user.id, clinicId: invitation.clinic_id, role: "staff" });
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: user.id,
            role: "staff",
            clinic_id: invitation.clinic_id,
          });

        if (roleError) {
          logger.error("Error creating user role", roleError, { userId: user.id, clinicId: invitation.clinic_id });
          throw roleError;
        }
      } else {
        logger.debug("User role already exists", { userId: user.id, clinicId: invitation.clinic_id });
      }

      // Update invitation status
      await invitationService.updateInvitationStatus(invitation.id, "accepted", new Date());

      toast({
        title: "Welcome to the team!",
        description: `You've joined ${invitation.clinics.name}`,
      });

      navigate("/clinic/queue");
    } catch (error: unknown) {
      logger.error("Error accepting invitation", error instanceof Error ? error : new Error(String(error)), { userId: user?.id, invitationId: invitation?.id });
      const description = error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Failed to accept invitation",
        description,
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
            Join <strong>{invitation.clinics.name}</strong> as a <strong className="capitalize">{invitation.role.replace(/_/g, ' ')}</strong>
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
              <span className="text-sm text-muted-foreground">Your Role</span>
              <span className="font-medium capitalize">{invitation.role.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Your Name</span>
              <span className="font-medium">{invitation.full_name}</span>
            </div>
          </div>

          {!user ? (
            <p className="text-sm text-muted-foreground text-center">
              You'll need to create an account to accept this invitation
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Logged in • Ready to accept
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

          {user && (
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={async () => {
                await supabase.auth.signOut();
                toast({
                  title: "Logged out",
                  description: "You can now sign up with the invited email address",
                });
                window.location.reload();
              }}
            >
              Not you? Log out
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
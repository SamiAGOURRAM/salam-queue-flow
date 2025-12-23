import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { staffService } from "@/services/staff";
import { patientService } from "@/services/patient";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useForceLightMode } from "@/hooks/useForceLightMode";
import { Eye, EyeOff, Loader2, UserCheck, Building2, Mail, User, Phone, Lock } from "lucide-react";

export default function StaffSignup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Force light mode on staff signup page
  useForceLightMode();
  
  const [formData, setFormData] = useState({
    email: searchParams.get("email") || "",
    fullName: searchParams.get("name") || "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clinicInfo, setClinicInfo] = useState<{ name: string; specialty: string } | null>(null);
  const invitationToken = searchParams.get("token");

  useEffect(() => {
    // Fetch clinic info from invitation
    const fetchClinicInfo = async () => {
      if (!invitationToken) return;
      
      try {
        const { data, error } = await supabase
          .from("staff_invitations")
          .select(`
            clinics (
              name,
              specialty
            )
          `)
          .eq("invitation_token", invitationToken)
          .eq("status", "pending")
          .single();

        if (!error && data?.clinics) {
          setClinicInfo(data.clinics as { name: string; specialty: string });
        }
      } catch (error) {
        logger.error("Error fetching clinic info", error instanceof Error ? error : new Error(String(error)), { invitationToken });
      }
    };

    fetchClinicInfo();
  }, [invitationToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.email || !formData.fullName || !formData.phoneNumber || !formData.password) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (!invitationToken) {
      toast({
        title: "Invalid invitation",
        description: "No invitation token found. Please use the invitation link sent to your email.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch invitation details to get clinic_id
      logger.debug("Fetching invitation with token", { invitationToken });
      const { data: invitationData, error: inviteError } = await supabase
        .from("staff_invitations")
        .select("id, clinic_id, status, expires_at")
        .eq("invitation_token", invitationToken)
        .eq("email", formData.email)
        .single();

      if (inviteError || !invitationData) {
        logger.error("Invitation fetch error", inviteError, { invitationToken });
        throw new Error("Invalid or expired invitation");
      }

      if (invitationData.status !== "pending") {
        throw new Error("This invitation has already been used");
      }

      if (new Date(invitationData.expires_at) < new Date()) {
        throw new Error("This invitation has expired");
      }

      logger.debug("Valid invitation found for clinic", { clinicId: invitationData.clinic_id, invitationId: invitationData.id });

      // 2. Check if user already exists in auth
      logger.debug("Checking if user exists", { email: formData.email });
      let userId: string;
      let isExistingUser = false;

      // Try to sign in first (in case user was partially created)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInData.user) {
        // User exists and password works - just use this account
        logger.info("User already exists, logging in", { userId: signInData.user.id, email: formData.email });
        userId = signInData.user.id;
        isExistingUser = true;
      } else {
        // User doesn't exist or password wrong, create new account
        logger.debug("Creating new user account", { email: formData.email });
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          phone: formData.phoneNumber,
          options: {
            data: {
              full_name: formData.fullName,
              phone_number: formData.phoneNumber,
              role: "staff",
            },
          },
        });

        if (signUpError) {
          // If error is "user already registered", try to handle it
          if (signUpError.message?.includes("already registered") || signUpError.message?.includes("already exists")) {
            logger.warn("User exists but password didn't work", { email: formData.email });
            throw new Error("An account with this email already exists. Please use the correct password or contact the clinic owner.");
          }
          logger.error("Signup error", signUpError, { email: formData.email });
          throw signUpError;
        }

        if (!authData.user) {
          throw new Error("Failed to create user account");
        }

        logger.info("User created successfully", { userId: authData.user.id, email: formData.email });
        userId = authData.user.id;
      }

      // 3. Wait for DB trigger to create profile (if new user)
      if (!isExistingUser) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 4. Check if already in clinic_staff
      const { data: existingStaff } = await supabase
        .from("clinic_staff")
        .select("id")
        .eq("clinic_id", invitationData.clinic_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingStaff) {
        // 5. Use StaffService to add staff
        logger.debug("Adding to clinic_staff", { userId, clinicId: invitationData.clinic_id, role: "receptionist" });
        try {
          await staffService.addStaff({
            clinicId: invitationData.clinic_id,
            userId: userId,
            role: "receptionist",
          });
          logger.info("Added to clinic_staff", { userId, clinicId: invitationData.clinic_id });
        } catch (staffError) {
          logger.error("clinic_staff insert error", staffError instanceof Error ? staffError : new Error(String(staffError)), { userId, clinicId: invitationData.clinic_id });
          throw new Error(`Failed to add to clinic staff: ${staffError instanceof Error ? staffError.message : 'Unknown error'}`);
        }
      } else {
        logger.debug("Already in clinic_staff", { userId, clinicId: invitationData.clinic_id });
      }

      // 6. Check if already has user role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("clinic_id", invitationData.clinic_id)
        .maybeSingle();

      if (!existingRole) {
        // 7. Insert into user_roles
        logger.debug("Adding user role", { userId, clinicId: invitationData.clinic_id, role: "staff" });
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: userId,
            role: "staff",
            clinic_id: invitationData.clinic_id,
          });

        if (roleError) {
          logger.error("user_roles insert error", roleError, { userId, clinicId: invitationData.clinic_id });
          throw new Error(`Failed to assign role: ${roleError.message}`);
        }

        logger.info("Added to user_roles", { userId, clinicId: invitationData.clinic_id });
      } else {
        logger.debug("Already has user role", { userId, clinicId: invitationData.clinic_id });
      }

      // 8. Update invitation status
      logger.debug("Updating invitation status", { invitationId: invitationData.id });
      const { error: updateError } = await supabase
        .from("staff_invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitationData.id);

      if (updateError) {
        logger.error("Invitation update error", updateError, { invitationId: invitationData.id });
        // Don't throw - invitation is functionally accepted
      }

      logger.info("Invitation marked as accepted", { invitationId: invitationData.id, userId });

      // 9. Success! User is logged in
      toast({
        title: "Welcome to the team!",
        description: isExistingUser 
          ? "You've been added to the clinic successfully." 
          : "Your account has been created successfully.",
      });

      // Redirect to clinic dashboard
      logger.debug("Redirecting to /clinic/queue", { userId });
      navigate("/clinic/queue");
    } catch (error: unknown) {
      logger.error("Signup error", error instanceof Error ? error : new Error(String(error)), { email: formData.email });
      const errorMessage = error instanceof Error ? error.message : "Failed to create account";
      toast({
        title: "Signup failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-2">
            <UserCheck className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold">Staff Registration</span>
          </div>
          <CardTitle className="text-2xl">Join the Team</CardTitle>
          <CardDescription className="text-base">
            {clinicInfo ? (
              <span className="flex items-center justify-center gap-2">
                <Building2 className="w-4 h-4" />
                You've been invited to join <strong>{clinicInfo.name}</strong>
              </span>
            ) : (
              "Complete your registration to join the clinic"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                readOnly
                className="bg-gray-50 cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">This email was provided in your invitation</p>
            </div>

            {/* Full Name (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                value={formData.fullName}
                readOnly
                className="bg-gray-50 cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">This name was provided in your invitation</p>
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-sm font-medium flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="+1 234 567 8900"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Create Account
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              After creating your account, you'll need to verify your email before joining the clinic
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { patientService } from "@/services/patient";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

interface SignupData {
  email: string;
  password: string;
  phone: string;
  fullName: string;
  userType: string;
}

type ClinicInsert = Database["public"]["Tables"]["clinics"]["Insert"];

interface ClinicFormData {
  name: string;
  name_ar: string;
  practice_type: NonNullable<ClinicInsert["practice_type"]>;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  email: string;
}

export default function ClinicOnboarding() {
  const [step, setStep] = useState(1);
  const [signupData, setSignupData] = useState<SignupData | null>(null);
  const [clinicData, setClinicData] = useState<ClinicFormData>({
    name: "",
    name_ar: "",
    practice_type: "solo_practice",
    specialty: "",
    address: "",
    city: "",
    phone: "",
    email: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Load signup data from sessionStorage
  useEffect(() => {
    const storedData = sessionStorage.getItem('clinicOwnerSignup');
    if (storedData) {
      const data: SignupData = JSON.parse(storedData);
      setSignupData(data);
      
      // Pre-fill clinic data from signup form
      setClinicData(prev => ({
        ...prev,
        phone: data.phone,
        email: data.email,
      }));
    } else if (!user) {
      // No signup data and not logged in - redirect to signup
      toast({
        title: "Session expired",
        description: "Please start the signup process again.",
        variant: "destructive",
      });
      navigate("/auth/signup");
    }
  }, [user, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      let currentUser = user;

      // If no user exists, create account first (from stored signup data)
      if (!currentUser && signupData) {
        logger.debug("Creating account with clinic setup", { email: signupData.email, phone: signupData.phone, fullName: signupData.fullName });
        
        // Validate phone number
        if (!signupData.phone || !signupData.phone.trim()) {
          throw new Error("Phone number is required. Please go back and provide a phone number.");
        }
        
        const phoneNumber = signupData.phone.trim();
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: signupData.email,
          password: signupData.password,
          options: {
            data: {
              full_name: signupData.fullName,
              phone_number: phoneNumber,
              role: "clinic_owner",
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (authError) {
          logger.error("Auth signup error", authError, { email: signupData.email });
          throw new Error(`Failed to create account: ${authError.message}`);
        }
        
        if (!authData.user) {
          throw new Error("Failed to create account - no user returned");
        }

        currentUser = authData.user;
        logger.info("Account created successfully", { userId: currentUser.id, email: signupData.email });

        // Wait a moment for database triggers to complete
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Clear stored signup data
        sessionStorage.removeItem('clinicOwnerSignup');
      }

      if (!currentUser) {
        toast({
          title: "Not authenticated",
          description: "Please sign in first.",
          variant: "destructive",
        });
        navigate("/auth/login");
        return;
      }

      logger.debug("Creating clinic for user", { userId: currentUser.id, clinicName: clinicData.name });

      // Create clinic
      const clinicPayload: ClinicInsert = {
        name: clinicData.name,
        name_ar: clinicData.name_ar || clinicData.name,
        specialty: clinicData.specialty,
        address: clinicData.address,
        city: clinicData.city,
        phone: clinicData.phone,
        email: clinicData.email || currentUser.email,
        practice_type: clinicData.practice_type,
        owner_id: currentUser.id,
      };

      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .insert(clinicPayload)
        .select()
        .single();

      if (clinicError) {
        logger.error("Clinic creation error", clinicError, {
          userId: currentUser.id,
          clinicName: clinicData.name,
          details: clinicError.details,
          hint: clinicError.hint,
          code: clinicError.code,
        });
        throw new Error(`Failed to create clinic: ${clinicError.message}`);
      }

      logger.info("Clinic created successfully", { clinicId: clinic.id, clinicName: clinic.name, userId: currentUser.id });

      // Create staff entry for owner using StaffService
      // Note: This might already exist from a database trigger, so we catch errors gracefully
      try {
        await staffService.addStaff({
          clinicId: clinic.id,
          userId: currentUser.id,
          role: "doctor",
          specialization: clinicData.specialty,
        });
        logger.info("Staff entry created successfully", { clinicId: clinic.id, userId: currentUser.id });
      } catch (staffError) {
        logger.warn("Staff creation error (might already exist from trigger)", staffError instanceof Error ? staffError : new Error(String(staffError)), { clinicId: clinic.id, userId: currentUser.id });
        // Continue - this is not a critical error
      }

      // Update user role with clinic_id (might be handled by trigger)
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ clinic_id: clinic.id })
        .eq("user_id", currentUser.id)
        .eq("role", "clinic_owner");

      if (roleError) {
        logger.warn("Role update error (might already be set from trigger)", roleError, { userId: currentUser.id, clinicId: clinic.id });
      }

      toast({
        title: "Success!",
        description: "Your account and clinic have been created successfully.",
      });

      navigate("/clinic/dashboard");
    } catch (error: unknown) {
      logger.error("Onboarding error", error instanceof Error ? error : new Error(String(error)), { userId: currentUser?.id, clinicName: clinicData.name });
      const description =
        error instanceof Error
          ? error.message
          : "Failed to complete setup. Please try again.";
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Set up your clinic</CardTitle>
          <CardDescription>
            Let's get your practice registered on QueueMed
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Clinic Name</Label>
                <Input
                  id="name"
                  value={clinicData.name}
                  onChange={(e) => setClinicData({ ...clinicData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name_ar">Clinic Name (Arabic)</Label>
                <Input
                  id="name_ar"
                  value={clinicData.name_ar}
                  onChange={(e) => setClinicData({ ...clinicData, name_ar: e.target.value })}
                  dir="rtl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="practice_type">Practice Type</Label>
                <Select
                  value={clinicData.practice_type}
                  onValueChange={(value) => setClinicData({ ...clinicData, practice_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo_practice">Solo Practice</SelectItem>
                    <SelectItem value="group_clinic">Group Clinic</SelectItem>
                    <SelectItem value="hospital">Hospital</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Specialty</Label>
                <Input
                  id="specialty"
                  placeholder="e.g., General Practice, Dental"
                  value={clinicData.specialty}
                  onChange={(e) => setClinicData({ ...clinicData, specialty: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={clinicData.address}
                onChange={(e) => setClinicData({ ...clinicData, address: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={clinicData.city}
                  onChange={(e) => setClinicData({ ...clinicData, city: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={clinicData.phone}
                  onChange={(e) => setClinicData({ ...clinicData, phone: e.target.value })}
                  required
                  placeholder={signupData?.phone || "+212..."}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={clinicData.email}
                onChange={(e) => setClinicData({ ...clinicData, email: e.target.value })}
                placeholder={signupData?.email || "clinic@example.com"}
              />
            </div>

            <div className="flex gap-3">
              {signupData && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/auth/signup")}
                  className="flex-1"
                >
                  Back
                </Button>
              )}
              <Button 
                type="submit" 
                className={signupData ? "flex-1" : "w-full"} 
                disabled={loading}
              >
                {loading ? "Creating account and clinic..." : "Complete Setup"}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

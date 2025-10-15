import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface SignupData {
  email: string;
  password: string;
  phone: string;
  fullName: string;
  userType: string;
}

export default function ClinicOnboarding() {
  const [step, setStep] = useState(1);
  const [signupData, setSignupData] = useState<SignupData | null>(null);
  const [clinicData, setClinicData] = useState({
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
        console.log("Creating account with clinic setup...");
        console.log("Signup data:", { email: signupData.email, phone: signupData.phone, fullName: signupData.fullName });
        
        // Ensure phone is not empty string (use a placeholder if needed)
        const phoneNumber = signupData.phone?.trim() || `+212${Date.now().toString().slice(-9)}`;
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: signupData.email,
          password: signupData.password,
          phone: phoneNumber,
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
          console.error("Auth signup error:", authError);
          throw new Error(`Failed to create account: ${authError.message}`);
        }
        
        if (!authData.user) {
          throw new Error("Failed to create account - no user returned");
        }

        currentUser = authData.user;
        console.log("Account created successfully:", currentUser.id);

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

      console.log("Creating clinic for user:", currentUser.id);
      console.log("Clinic data:", clinicData);

      // Create clinic
      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .insert({
          name: clinicData.name,
          name_ar: clinicData.name_ar || clinicData.name,
          specialty: clinicData.specialty,
          address: clinicData.address,
          city: clinicData.city,
          phone: clinicData.phone,
          email: clinicData.email || currentUser.email,
          practice_type: clinicData.practice_type as any,
          owner_id: currentUser.id,
        } as any)
        .select()
        .single();

      if (clinicError) {
        console.error("Clinic creation error details:", {
          message: clinicError.message,
          details: clinicError.details,
          hint: clinicError.hint,
          code: clinicError.code,
        });
        throw new Error(`Failed to create clinic: ${clinicError.message}`);
      }

      console.log("Clinic created:", clinic);

      // Create staff entry for owner (might be handled by trigger)
      const { error: staffError } = await supabase
        .from("clinic_staff")
        .insert({
          clinic_id: clinic.id,
          user_id: currentUser.id,
          role: "doctor",
          specialization: clinicData.specialty,
        });

      if (staffError) {
        console.error("Staff creation error:", staffError);
        console.log("Staff entry might already exist from trigger");
      }

      // Update user role with clinic_id (might be handled by trigger)
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ clinic_id: clinic.id })
        .eq("user_id", currentUser.id)
        .eq("role", "clinic_owner");

      if (roleError) {
        console.error("Role update error:", roleError);
        console.log("Role might already be set from trigger");
      }

      toast({
        title: "Success!",
        description: "Your account and clinic have been created successfully.",
      });

      navigate("/clinic/dashboard");
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to complete setup. Please try again.",
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

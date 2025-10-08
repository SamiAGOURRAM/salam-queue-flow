import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ClinicOnboarding() {
  const [step, setStep] = useState(1);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Create clinic
      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .insert({
          name: clinicData.name,
          name_ar: clinicData.name_ar,
          specialty: clinicData.specialty,
          address: clinicData.address,
          city: clinicData.city,
          phone: clinicData.phone,
          email: clinicData.email,
          practice_type: clinicData.practice_type as any,
          owner_id: user.id,
        } as any)
        .select()
        .single();

      if (clinicError) throw clinicError;

      // Create staff entry for owner
      const { error: staffError } = await supabase
        .from("clinic_staff")
        .insert({
          clinic_id: clinic.id,
          user_id: user.id,
          role: "doctor",
          specialization: clinicData.specialty,
        });

      if (staffError) throw staffError;

      // Update user role with clinic_id
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ clinic_id: clinic.id })
        .eq("user_id", user.id)
        .eq("role", "clinic_owner");

      if (roleError) throw roleError;

      toast({
        title: "Clinic created!",
        description: "Your clinic has been set up successfully.",
      });

      navigate("/clinic/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating clinic..." : "Complete Setup"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

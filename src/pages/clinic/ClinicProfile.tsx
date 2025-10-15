import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Save, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ClinicProfile() {
  const { user, loading, isClinicOwner, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
      return;
    }
    if (user) {
      fetchProfile();
    }
  }, [user, loading, navigate]);

  const fetchProfile = async () => {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.id)
      .single();

    if (profileError) {
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
      return;
    }

    const { data: staffData } = await supabase
      .from("clinic_staff")
      .select("*")
      .eq("user_id", user?.id)
      .single();

    setProfile(profileData);
    setFullName(profileData.full_name || "");
    setEmail(profileData.email || "");
    setPhone(profileData.phone_number || "");
    setSpecialization(staffData?.specialization || "");
    setLicenseNumber(staffData?.license_number || "");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          email,
          phone_number: phone,
        })
        .eq("id", user?.id);

      if (profileError) throw profileError;

      // Update staff info
      const { error: staffError } = await supabase
        .from("clinic_staff")
        .update({
          specialization,
          license_number: licenseNumber,
        })
        .eq("user_id", user?.id);

      if (staffError) throw staffError;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Modern Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/30">
                <Activity className="w-6 h-6 text-white" />
                <span className="text-xl font-bold text-white">QueueMed</span>
              </div>
              <div className="hidden md:block h-8 w-px bg-gray-200" />
              <h1 className="hidden md:block text-lg font-semibold text-gray-700">My Profile</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate("/clinic/queue")} className="border-2">
                Queue
              </Button>
              <Button variant="outline" onClick={() => navigate("/clinic/settings")} className="border-2">
                Settings
              </Button>
              <Button variant="ghost" onClick={signOut} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            Personal Profile
          </h2>
          <p className="text-base text-gray-500">Manage your personal and professional information</p>
        </div>

        <Card className="shadow-lg border-0 bg-white">
          <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
            <CardTitle className="text-xl">Personal Information</CardTitle>
            <CardDescription className="text-base">Update your profile details</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. John Doe"
                className="h-11"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@clinic.com"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212 XXX XXX XXX"
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialization" className="text-sm font-medium">Specialization</Label>
              <Input
                id="specialization"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g., General Practice, Cardiology"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license" className="text-sm font-medium">License Number</Label>
              <Input
                id="license"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Medical License Number"
                className="h-11"
              />
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving} 
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, Save, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton"; // Added Skeleton for better loading state

export default function PatientProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Profile data
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (user) {
      fetchProfile();
      // Ensure email is set from the initial user object if available
      setEmail(user.email || ""); 
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setFullName(data.full_name || "");
        setPhone(data.phone_number || "");
        setCity(data.city || "");
        // Use user object's email as the single source of truth for email
        // setEmail(data.email || ""); // Removed, using user.email from initial load
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone_number: phone,
          city: city,
        })
        .eq("id", user?.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Enhanced Loading State with Skeleton
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 py-8">
        <Skeleton className="h-10 w-64 bg-blue-100/50" />
        <Skeleton className="h-4 w-96 bg-blue-100/50" />
        <Card className="rounded-3xl shadow-xl bg-white/90 border border-white/60 p-8 space-y-6">
          <Skeleton className="h-8 w-60 bg-blue-100/50" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-11 w-full bg-blue-100/50" />
            <Skeleton className="h-11 w-full bg-blue-100/50" />
          </div>
          <Skeleton className="h-11 w-full bg-blue-100/50" />
          <Skeleton className="h-11 w-full bg-blue-100/50" />
          <Skeleton className="h-12 w-full bg-blue-100/50" />
        </Card>
        <Card className="rounded-3xl shadow-xl bg-white/90 border border-white/60 p-8 space-y-6">
          <Skeleton className="h-8 w-60 bg-blue-100/50" />
          <Skeleton className="h-16 w-full bg-blue-100/50" />
          <Skeleton className="h-16 w-full bg-blue-100/50" />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50 relative py-12">
      {/* Animated Background Elements - Inherited from ClinicDirectory */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
            <span className="bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
              My Profile
            </span>
          </h1>
          <p className="text-lg text-gray-600 mt-3">Manage your personal information and account details.</p>
        </div>

        {/* Profile Card - Enhanced Style */}
        <Card className="relative backdrop-blur-sm bg-white/95 border border-white/60 rounded-3xl shadow-2xl transition-all duration-300">
          <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50/50 rounded-t-3xl p-6">
            <CardTitle className="text-2xl font-bold flex items-center gap-3 text-gray-800">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
                <User className="w-4 h-4 text-white" />
              </div>
              Personal Information
            </CardTitle>
            <CardDescription className="text-gray-500 ml-11">Update your profile details</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                  <User className="w-4 h-4 text-blue-600" />
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                  <Phone className="w-4 h-4 text-blue-600" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212..."
                  className="h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <Mail className="w-4 h-4 text-blue-600" />
                Email Address (Read-Only)
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="h-12 bg-blue-50/50 border-2 border-blue-100 text-gray-600 rounded-xl cursor-not-allowed"
              />
              <p className="text-xs text-gray-500">Email is tied to your account and cannot be changed here.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <MapPin className="w-4 h-4 text-blue-600" />
                City
              </Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Casablanca"
                className="h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              // Primary button style with blue/sky gradient
              className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 shadow-xl hover:shadow-2xl text-white rounded-xl font-bold transition-all"
            >
              <Save className="w-5 h-5 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Account Info Card - Enhanced Style */}
        <Card className="relative backdrop-blur-sm bg-white/95 border border-white/60 rounded-3xl shadow-xl transition-all duration-300">
          <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50/50 rounded-t-3xl p-6">
            <CardTitle className="text-2xl font-bold text-gray-800">Account Information</CardTitle>
            <CardDescription className="text-gray-500">Essential account details</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-blue-50/80 border border-blue-200 rounded-xl shadow-inner">
                <div className="mb-2 sm:mb-0">
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">User ID</p>
                  <p className="font-mono text-sm text-gray-900 break-all">{user?.id}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-blue-50/80 border border-blue-200 rounded-xl shadow-inner">
                <div className="mb-2 sm:mb-0">
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Account Created</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(user?.created_at || "").toLocaleDateString("en-US", { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Activity, User, Building2 } from "lucide-react";

type UserType = "patient" | "clinic_owner";

export default function Signup() {
  const [userType, setUserType] = useState<UserType>("patient");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        phone,
        options: {
          data: {
            full_name: fullName,
            phone_number: phone,
            role: userType, // Role is now handled by database trigger
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: "Account created!",
          description: "Please complete your profile.",
        });

        // Redirect to onboarding
        if (userType === "patient") {
          navigate("/auth/onboarding/patient");
        } else {
          navigate("/auth/onboarding/clinic");
        }
      }
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div 
            className="flex items-center justify-center gap-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate("/")}
          >
            <Activity className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold">QueueMed</span>
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Get started with smart queue management
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>I am a</Label>
              <RadioGroup value={userType} onValueChange={(val) => setUserType(val as UserType)}>
                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="patient" id="patient" />
                  <Label htmlFor="patient" className="flex items-center gap-2 cursor-pointer flex-1">
                    <User className="w-4 h-4" />
                    <span>Patient</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="clinic_owner" id="clinic_owner" />
                  <Label htmlFor="clinic_owner" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Building2 className="w-4 h-4" />
                    <span>Healthcare Provider</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Sign up"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link to="/auth/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

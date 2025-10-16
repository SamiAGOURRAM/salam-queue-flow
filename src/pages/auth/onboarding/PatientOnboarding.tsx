import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default function PatientOnboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    }
  }, [user, loading, navigate]);

  const handleComplete = () => {
    navigate("/patient/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-accent rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Welcome to QueueMed!</CardTitle>
          <CardDescription>
            Your account is ready. You can now:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
              <span className="text-sm">Book appointments with your favorite clinics</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
              <span className="text-sm">Track your queue position in real-time</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
              <span className="text-sm">Receive SMS notifications for updates</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
              <span className="text-sm">View your appointment history</span>
            </li>
          </ul>

          <Button onClick={handleComplete} className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

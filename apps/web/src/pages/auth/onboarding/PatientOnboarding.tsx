import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useForceLightMode } from "@/hooks/useForceLightMode";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle, 
  Calendar, 
  Activity, 
  Bell, 
  History,
  ArrowRight,
  Sparkles
} from "lucide-react";

export default function PatientOnboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  
  // Force light mode on onboarding page
  useForceLightMode();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    }
  }, [user, loading, navigate]);

  const handleComplete = () => {
    navigate("/my-appointments");
  };

  const features = [
    {
      icon: Calendar,
      title: "Book Appointments",
      description: "Schedule with your favorite clinics instantly",
    },
    {
      icon: Activity,
      title: "Real-time Queue",
      description: "Track your position in the queue live",
    },
    {
      icon: Bell,
      title: "SMS Notifications",
      description: "Get instant updates on your appointments",
    },
    {
      icon: History,
      title: "Appointment History",
      description: "View and manage all your past visits",
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-[4px] bg-foreground mb-4">
            <Sparkles className="w-8 h-8 text-background" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Welcome to QueueMed
          </h1>
          <p className="text-sm text-muted-foreground">
            Your account is ready. Here's what you can do:
          </p>
        </div>

        {/* Features Grid */}
        <div className="space-y-3 mb-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="flex items-start gap-4 p-4 rounded-[4px] border border-border/60 bg-card hover:border-foreground/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-[4px] bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0 mt-1" />
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <Button 
          onClick={handleComplete} 
          className="w-full h-11 rounded-[4px] bg-foreground text-background hover:bg-foreground/90 font-medium"
        >
          Continue to Dashboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

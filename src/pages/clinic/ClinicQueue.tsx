import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Activity, UserPlus, Calendar, Settings, Users, User as UserIcon, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AddWalkInDialog } from "@/components/clinic/AddWalkInDialog";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { EnhancedQueueManager } from "@/components/clinic/EnhancedQueueManager";

interface QueuePatient {
  id: string;
  patient_id: string;
  queue_position: number;
  status: string;
  scheduled_time: string | null;
  estimated_start_time: string | null;
  appointment_type: string;
  patient_name: string;
  checked_in_at: string | null;
  actual_start_time: string | null;
}

export default function ClinicQueue() {
  const { user, loading, isClinicOwner, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<any>(null);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);

  const fetchClinic = useCallback(async () => {
    try {
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("*")
        .eq("owner_id", user?.id)
        .single();

      if (clinicData) {
        setClinic(clinicData);
      }
    } catch (error) {
      console.error("Error fetching clinic:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && (isClinicOwner || isStaff)) {
      fetchClinic();
    }
  }, [user, loading, isClinicOwner, isStaff, navigate, fetchClinic]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Professional Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Logo & Clinic Name */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10">
                <Activity className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {clinic?.name || "QueueMed"}
                </span>
              </div>
            </div>

            {/* Right: Navigation */}
            <nav className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/clinic/dashboard")}
                className="font-medium"
              >
                Dashboard
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/clinic/calendar")}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Calendar
              </Button>
              {!isStaff && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate("/clinic/profile")}
                  >
                    <UserIcon className="w-4 h-4 mr-2" />
                    Profile
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate("/clinic/settings")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate("/clinic/team")}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Team
                  </Button>
                </>
              )}
              <div className="h-6 w-px bg-border mx-2" />
              <Button 
                variant="ghost" 
                size="sm"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Action Bar - Floating above queue */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              Live Queue
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleDateString("en-US", { 
                weekday: "long", 
                year: "numeric", 
                month: "long", 
                day: "numeric" 
              })}
            </p>
          </div>
          
          {/* Quick Actions */}
          <div className="flex gap-3">
            <Button 
              onClick={() => setShowBookAppointment(true)} 
              size="lg"
              className="shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Book Appointment
            </Button>
            <Button 
              onClick={() => setShowAddWalkIn(true)} 
              variant="outline"
              size="lg"
              className="shadow-sm hover:shadow-md transition-all"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Add Walk-in
            </Button>
          </div>
        </div>

        {/* Enhanced Queue Manager - This is now the main dashboard */}
        {clinic?.id && user?.id && (
          <EnhancedQueueManager 
            clinicId={clinic.id} 
            userId={user.id}
          />
        )}
      </main>

      <AddWalkInDialog
        open={showAddWalkIn}
        onOpenChange={setShowAddWalkIn}
        clinicId={clinic?.id}
        onSuccess={() => {
          setShowAddWalkIn(false);
          toast({
            title: "Success",
            description: "Walk-in patient added to queue",
          });
        }}
      />

      <BookAppointmentDialog
        open={showBookAppointment}
        onOpenChange={setShowBookAppointment}
        clinicId={clinic?.id}
        onSuccess={() => {
          setShowBookAppointment(false);
          toast({
            title: "Success", 
            description: "Appointment booked successfully",
          });
        }}
      />
    </div>
  );
}

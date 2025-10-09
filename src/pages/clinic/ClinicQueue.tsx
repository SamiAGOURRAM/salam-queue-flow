import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Activity, UserPlus, Calendar } from "lucide-react";
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold">{clinic?.name || "QueueMed"}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isStaff && (
              <>
                <Button variant="outline" onClick={() => navigate("/clinic/dashboard")}>
                  Dashboard
                </Button>
                <Button variant="outline" onClick={() => navigate("/clinic/calendar")}>
                  Calendar
                </Button>
                <Button variant="outline" onClick={() => navigate("/clinic/profile")}>
                  Profile
                </Button>
                <Button variant="outline" onClick={() => navigate("/clinic/settings")}>
                  Settings
                </Button>
                <Button variant="outline" onClick={() => navigate("/clinic/team")}>
                  Team
                </Button>
              </>
            )}
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Live Queue</h1>
            <p className="text-muted-foreground">Real-time queue management</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowBookAppointment(true)} variant="default">
              <Calendar className="w-4 h-4 mr-2" />
              Book Appointment
            </Button>
            <Button onClick={() => setShowAddWalkIn(true)} variant="outline">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Walk-in
            </Button>
          </div>
        </div>

        {/* Enhanced Queue Manager Component */}
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

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Modern Professional Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Logo & Clinic Name */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/30">
                <Activity className="w-6 h-6 text-white" />
                <span className="text-xl font-bold text-white">
                  {clinic?.name || "QueueMed"}
                </span>
              </div>
              <div className="hidden md:block h-8 w-px bg-gray-200" />
              <h1 className="hidden md:block text-lg font-semibold text-gray-700">Live Queue Dashboard</h1>
            </div>

            {/* Right: Navigation */}
            <nav className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/clinic/calendar")}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                <Calendar className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Calendar</span>
              </Button>
              
              {!isStaff && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate("/clinic/team")}
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Team</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate("/clinic/settings")}
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Settings</span>
                  </Button>
                </>
              )}
              
              <div className="h-8 w-px bg-gray-200 mx-1" />
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/clinic/profile")}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                <UserIcon className="w-4 h-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={signOut}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Page Header with Date and Quick Actions */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Today's Queue
            </h2>
            <p className="text-base text-gray-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date().toLocaleDateString("en-US", { 
                weekday: "long", 
                year: "numeric", 
                month: "long", 
                day: "numeric" 
              })}
            </p>
          </div>
          
          {/* Quick Actions - Prominent but clean */}
          <div className="flex gap-3 w-full sm:w-auto">
            <Button 
              onClick={() => setShowBookAppointment(true)} 
              size="lg"
              className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Book Appointment
            </Button>
            <Button 
              onClick={() => setShowAddWalkIn(true)} 
              variant="outline"
              size="lg"
              className="flex-1 sm:flex-none border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 shadow-sm"
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

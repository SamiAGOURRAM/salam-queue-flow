import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Activity, Calendar as CalendarIcon, Plus, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { format } from "date-fns";

interface Appointment {
  id: string;
  patient_id: string;
  scheduled_time: string;
  status: string;
  appointment_type: string;
  patient_name: string;
}

export default function ClinicCalendar() {
  const { user, loading, isClinicOwner, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && (isClinicOwner || isStaff)) {
      fetchClinicAndAppointments();
    }
  }, [user, loading, isClinicOwner, isStaff]);

  useEffect(() => {
    if (clinic?.id && selectedDate) {
      fetchAppointments();
    }
  }, [selectedDate, clinic?.id]);

  const fetchClinicAndAppointments = async () => {
    const { data: clinicData } = await supabase
      .from("clinics")
      .select("*")
      .eq("owner_id", user?.id)
      .single();

    if (clinicData) {
      setClinic(clinicData);
    }
  };

  const fetchAppointments = async () => {
    if (!clinic?.id) return;
    
    setLoadingAppointments(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const { data: appointmentData, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("clinic_id", clinic.id)
        .eq("appointment_date", dateStr)
        .order("scheduled_time", { ascending: true });

      if (error) throw error;

      // Fetch patient names
      const patientIds = appointmentData?.map(apt => apt.patient_id) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", patientIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));

      const formattedData: Appointment[] = (appointmentData || []).map((apt) => ({
        id: apt.id,
        patient_id: apt.patient_id,
        scheduled_time: apt.scheduled_time,
        status: apt.status,
        appointment_type: apt.appointment_type,
        patient_name: profileMap.get(apt.patient_id) || 'Unknown',
      }));

      setAppointments(formattedData);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      toast({
        title: "Error",
        description: "Failed to load appointments",
        variant: "destructive"
      });
    } finally {
      setLoadingAppointments(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      scheduled: "outline",
      waiting: "secondary",
      in_progress: "default",
      completed: "default",
      cancelled: "destructive",
      no_show: "destructive"
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getWorkingHours = () => {
    if (!clinic?.settings?.working_hours) return null;
    const dayName = format(selectedDate, 'EEEE').toLowerCase();
    const dayHours = clinic.settings.working_hours[dayName];
    return dayHours;
  };

  const workingHours = getWorkingHours();
  const isClosed = workingHours?.closed;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

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
            <Button variant="outline" onClick={() => navigate("/clinic/queue")}>
              Live Queue
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <CalendarIcon className="w-8 h-8" />
            Schedule Calendar
          </h1>
          <p className="text-muted-foreground">View and manage appointments by date</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Select Date</CardTitle>
              <CardDescription>Choose a date to view appointments</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Appointments for {format(selectedDate, 'MMMM d, yyyy')}</CardTitle>
                  <CardDescription>
                    {isClosed ? (
                      <span className="text-destructive">Clinic closed on this day</span>
                    ) : workingHours ? (
                      <span>Working hours: {workingHours.open} - {workingHours.close}</span>
                    ) : (
                      <span>No working hours configured</span>
                    )}
                  </CardDescription>
                </div>
                <Button onClick={() => setShowBookAppointment(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Book Appointment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingAppointments ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No appointments scheduled for this day</p>
                  <p className="text-sm mt-2">Click "Book Appointment" to add one</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((apt) => (
                    <div key={apt.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{apt.scheduled_time}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className="font-medium">{apt.patient_name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground capitalize">
                          {apt.appointment_type.replace('_', ' ')}
                        </p>
                      </div>
                      <div>
                        {getStatusBadge(apt.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <BookAppointmentDialog
        open={showBookAppointment}
        onOpenChange={setShowBookAppointment}
        clinicId={clinic?.id || ""}
        onSuccess={() => {
          fetchAppointments();
          setShowBookAppointment(false);
        }}
        preselectedDate={selectedDate}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Clock, UserPlus, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AddWalkInDialog } from "@/components/clinic/AddWalkInDialog";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";

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
  const [queuePatients, setQueuePatients] = useState<QueuePatient[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [processingNext, setProcessingNext] = useState(false);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && (isClinicOwner || isStaff)) {
      fetchClinicAndQueue();
    }
  }, [user, loading, isClinicOwner, isStaff]);

  useEffect(() => {
    if (!clinic?.id) return;

    // Subscribe to real-time updates for appointments
    const channel = supabase
      .channel('clinic-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinic.id}`
        },
        () => {
          fetchQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinic?.id]);

  const fetchClinicAndQueue = async () => {
    try {
      // Fetch clinic
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("*")
        .eq("owner_id", user?.id)
        .single();

      if (clinicData) {
        setClinic(clinicData);
        fetchQueue(clinicData.id);
      }
    } catch (error) {
      console.error("Error fetching clinic:", error);
    }
  };

  const fetchQueue = async (clinicId?: string) => {
    try {
      const id = clinicId || clinic?.id;
      if (!id) return;

      const today = new Date().toISOString().split('T')[0];

      // Fetch appointments
      const { data: appointments, error: aptError } = await supabase
        .from("appointments")
        .select("*")
        .eq("clinic_id", id)
        .eq("appointment_date", today)
        .in("status", ["scheduled", "waiting", "in_progress"])
        .order("queue_position", { ascending: true });

      if (aptError) throw aptError;

      // Fetch patient names separately
      const patientIds = appointments?.map(apt => apt.patient_id) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", patientIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));

      const formattedData: QueuePatient[] = (appointments || []).map((apt) => ({
        id: apt.id,
        patient_id: apt.patient_id,
        queue_position: apt.queue_position,
        status: apt.status,
        scheduled_time: apt.scheduled_time,
        estimated_start_time: apt.predicted_start_time,
        appointment_type: apt.appointment_type,
        patient_name: profileMap.get(apt.patient_id) || 'Unknown',
        checked_in_at: apt.checked_in_at,
        actual_start_time: apt.actual_start_time
      }));

      setQueuePatients(formattedData);
    } catch (error) {
      console.error("Error fetching queue:", error);
      toast({
        title: "Error",
        description: "Failed to load queue",
        variant: "destructive"
      });
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleNextPatient = async () => {
    if (processingNext) return;
    
    const currentPatient = queuePatients.find(p => p.status === 'in_progress');
    const nextPatient = queuePatients.find(p => p.status === 'waiting' || p.status === 'scheduled');

    if (!nextPatient) {
      toast({
        title: "No patients waiting",
        description: "The queue is empty",
      });
      return;
    }

    setProcessingNext(true);

    try {
      // Call edge function to handle queue state update
      const { error } = await supabase.functions.invoke('update-queue-state', {
        body: {
          clinic_id: clinic.id,
          current_patient_id: currentPatient?.id,
          next_patient_id: nextPatient.id,
          action: 'next'
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${nextPatient.patient_name} is now in consultation`,
      });
    } catch (error) {
      console.error("Error processing next patient:", error);
      toast({
        title: "Error",
        description: "Failed to process next patient",
        variant: "destructive"
      });
    } finally {
      setProcessingNext(false);
    }
  };

  const handleCallPatient = async (patientId: string) => {
    try {
      const { error } = await supabase.functions.invoke('update-queue-state', {
        body: {
          clinic_id: clinic.id,
          next_patient_id: patientId,
          action: 'call_present'
        }
      });

      if (error) throw error;

      const patient = queuePatients.find(p => p.id === patientId);
      toast({
        title: "Success",
        description: `${patient?.patient_name} has been called`,
      });
    } catch (error) {
      console.error("Error calling patient:", error);
      toast({
        title: "Error",
        description: "Failed to call patient",
        variant: "destructive"
      });
    }
  };

  const handleMarkAbsent = async (patientId: string) => {
    try {
      const { error } = await supabase.functions.invoke('update-queue-state', {
        body: {
          clinic_id: clinic.id,
          patient_id: patientId,
          action: 'mark_absent'
        }
      });

      if (error) throw error;

      toast({
        title: "Marked as absent",
        description: "Patient will be notified",
      });
    } catch (error) {
      console.error("Error marking absent:", error);
      toast({
        title: "Error",
        description: "Failed to mark patient as absent",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      scheduled: { variant: "outline", label: "Scheduled" },
      waiting: { variant: "secondary", label: "Waiting" },
      in_progress: { variant: "default", label: "In Progress" },
    };

    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading || loadingQueue) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const nextPatient = queuePatients.find(p => p.status === 'waiting' || p.status === 'scheduled');
  const inProgressPatient = queuePatients.find(p => p.status === 'in_progress');
  const waitingCount = queuePatients.filter(p => p.status === 'waiting' || p.status === 'scheduled').length;

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

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Waiting</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{waitingCount}</div>
              <p className="text-xs text-muted-foreground">patients in queue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inProgressPatient ? 1 : 0}</div>
              <p className="text-xs text-muted-foreground">
                {inProgressPatient?.patient_name || 'None'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Next Patient</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{nextPatient?.patient_name || 'None'}</div>
              <p className="text-xs text-muted-foreground">
                Position: {nextPatient?.queue_position || '-'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
            <CardDescription>Today's appointments</CardDescription>
          </CardHeader>
          <CardContent>
            {queuePatients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No patients in queue</p>
              </div>
            ) : (
              <div className="space-y-4">
                {nextPatient && (
                  <div className="mb-6">
                    <Button
                      onClick={handleNextPatient}
                      disabled={processingNext}
                      size="lg"
                      className="w-full text-lg py-6"
                    >
                      {processingNext ? "Processing..." : "التالي - Next Patient"}
                    </Button>
                  </div>
                )}

                <div className="space-y-3">
                  {queuePatients.map((patient) => (
                    <div
                      key={patient.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-2xl font-bold text-muted-foreground w-8">
                          #{patient.queue_position}
                        </div>
                        <div>
                          <p className="font-medium">{patient.patient_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {patient.appointment_type} • {patient.scheduled_time || 'Walk-in'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(patient.status)}
                        {patient.status !== 'in_progress' && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCallPatient(patient.id)}
                            >
                              Call
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkAbsent(patient.id)}
                            >
                              Absent
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AddWalkInDialog
        open={showAddWalkIn}
        onOpenChange={setShowAddWalkIn}
        clinicId={clinic?.id}
        onSuccess={fetchQueue}
      />

      <BookAppointmentDialog
        open={showBookAppointment}
        onOpenChange={setShowBookAppointment}
        clinicId={clinic?.id}
        onSuccess={fetchQueue}
      />
    </div>
  );
}

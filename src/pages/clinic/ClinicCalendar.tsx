/**
 * Clinic Calendar (Consistent UI Version)
 * This version correctly identifies and displays absent patients, making it
 * consistent with the Live Queue view and providing a clearer operational picture.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Plus, Clock, UserX } from "lucide-react"; // EDIT 1: Import UserX icon
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { format } from "date-fns";
import { logger } from "@/services/shared/logging/Logger";
import { QueueEntry, SkipReason } from "@/services/queue"; // EDIT 2: Import SkipReason ENUM
import { QueueRepository } from "@/services/queue/repositories/QueueRepository";
import { cn } from "@/lib/utils"; // EDIT 3: Import cn for conditional styling

export default function ClinicCalendar() {
  const { user } = useAuth();
  const [clinic, setClinic] = useState<any>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<QueueEntry[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);

  const queueRepository = useMemo(() => new QueueRepository(), []);

  // Fetch initial data (no changes needed here, your version is correct)
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      try {
        const { data: staffData } = await supabase.from("clinic_staff").select("id, clinic_id").eq("user_id", user.id).single();
        if (staffData) {
          setStaffId(staffData.id);
          const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", staffData.clinic_id).single();
          setClinic(clinicData);
        }
      } catch (error) {
        logger.error("Error fetching initial calendar data", error as Error);
      }
    };
    fetchInitialData();
  }, [user]);

  // Fetch appointments (no changes needed here, your version is correct)
  const fetchAppointments = useCallback(async () => {
    if (!staffId) return;
    setLoadingAppointments(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const scheduleData = await queueRepository.getDailySchedule(staffId, dateStr);
      const sortedAppointments = (scheduleData.schedule || []).sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return timeA - timeB;
      });
      setAppointments(sortedAppointments);
    } catch (error) {
      logger.error("Error fetching appointments", error as Error);
      toast({ title: "Error", description: "Failed to load appointments", variant: "destructive" });
    } finally {
      setLoadingAppointments(false);
    }
  }, [staffId, selectedDate, queueRepository]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // EDIT 4: This is the new, smarter status badge function
  const getStatusBadge = (apt: QueueEntry) => {
    // If patient is marked absent and has not returned, that is the most important status
    if (apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt) {
      return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200"><UserX className="w-3 h-3 mr-1" />Absent</Badge>;
    }
    
    // Otherwise, use the appointment status as before
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = { scheduled: "outline", waiting: "secondary", in_progress: "default", completed: "default", cancelled: "destructive", no_show: "destructive" };
    return <Badge variant={variants[apt.status] || "outline"}>{apt.status.replace('_', ' ')}</Badge>;
  };
  
  const workingHours = useMemo(() => {
    if (!clinic?.settings?.working_hours) return null;
    const dayName = format(selectedDate, 'EEEE').toLowerCase();
    return clinic.settings.working_hours[dayName];
  }, [clinic, selectedDate]);
  
  const isClosed = workingHours?.closed;

  // The JSX is preserved, but with the new logic applied
  return (
    <div className="space-y-8">
      <div><h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><CalendarIcon className="w-8 h-8" />Schedule Calendar</h1><p className="text-muted-foreground">View and manage appointments by date</p></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-0 shadow-lg"><CardHeader><CardTitle>Select Date</CardTitle><CardDescription>Choose a date to view appointments</CardDescription></CardHeader><CardContent className="flex justify-center"><Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} className="rounded-md border" /></CardContent></Card>
        <Card className="lg:col-span-2 border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle>Appointments for {format(selectedDate, 'MMMM d, yyyy')}</CardTitle><CardDescription>{isClosed ? <span className="text-destructive">Clinic closed on this day</span> : workingHours ? <span>Working hours: {workingHours.open} - {workingHours.close}</span> : <span>No working hours configured</span>}</CardDescription></div>
              <Button onClick={() => setShowBookAppointment(true)} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"><Plus className="w-4 h-4 mr-2" />Book Appointment</Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingAppointments ? (
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><Clock className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>No appointments scheduled for this day</p><p className="text-sm mt-2">Click "Book Appointment" to add one</p></div>
            ) : (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  // EDIT 5: Apply conditional styling for absent patients
                  <div key={apt.id} className={cn(
                    "flex items-center justify-between p-4 border rounded-lg transition-colors",
                    apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt 
                      ? "bg-red-50/50 border-red-200 opacity-70" 
                      : "hover:bg-accent/50"
                  )}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{apt.startTime ? format(new Date(apt.startTime), 'HH:mm') : 'No time'}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="font-medium">{apt.patient?.fullName || 'Unknown'}</span>
                      </div>
                      <p className="text-sm text-muted-foreground capitalize">{apt.appointmentType?.replace('_', ' ') || 'No Type'}</p>
                    </div>
                    <div>
                      {/* Pass the entire appointment object to the badge function */}
                      {getStatusBadge(apt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <BookAppointmentDialog open={showBookAppointment} onOpenChange={setShowBookAppointment} clinicId={clinic?.id || ""} staffId={staffId || ""} onSuccess={() => { fetchAppointments(); setShowBookAppointment(false); }} preselectedDate={selectedDate}/>
    </div>
  );
}
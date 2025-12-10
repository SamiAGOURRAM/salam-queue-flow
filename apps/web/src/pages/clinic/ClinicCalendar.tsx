/**
 * Clinic Calendar (Consistent UI Version with Enhanced Styling)
 * This version correctly identifies and displays absent patients, making it
 * consistent with the Live Queue view and providing a clearer operational picture.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Plus, Clock, UserX, CheckCircle2, Activity, XCircle, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { format, isToday, isSameDay } from "date-fns";
import { logger } from "@/services/shared/logging/Logger";
import { QueueEntry, SkipReason } from "@/services/queue";
import { QueueService } from "@/services/queue/QueueService";
import { staffService } from "@/services/staff/StaffService";
import { clinicService } from "@/services/clinic/ClinicService";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type StatusConfig = Record<string, { variant: string; icon?: LucideIcon; className: string }>;

export default function ClinicCalendar() {
  const { user } = useAuth();
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<QueueEntry[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);

  // Use QueueService singleton instead of creating new repository
  const queueService = useMemo(() => new QueueService(), []);

  // Fetch initial data using services
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      try {
        // Use StaffService instead of direct Supabase query
        const staffData = await staffService.getStaffByUser(user.id);
        
        if (staffData) {
          setStaffId(staffData.id);
          // Use ClinicService instead of direct Supabase query
          const clinicData = await clinicService.getClinic(staffData.clinicId);
          if (clinicData) {
            setClinic({
              id: clinicData.id,
              name: clinicData.name,
              practice_type: clinicData.practiceType,
              specialty: clinicData.specialty,
              city: clinicData.city,
            });
          }
        }
      } catch (error) {
        logger.error("Error fetching initial calendar data", error as Error);
      }
    };
    fetchInitialData();
  }, [user]);

  // Fetch appointments using QueueService
  const fetchAppointments = useCallback(async () => {
    if (!staffId) return;
    setLoadingAppointments(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const isViewingToday = dateStr === todayStr;
      
      logger.debug("Fetching appointments for calendar", {
        staffId,
        selectedDate: dateStr,
        today: todayStr,
        isViewingToday,
        note: isViewingToday 
          ? "Calendar and Live Queue should show same appointments" 
          : "Calendar shows different date than Live Queue (which only shows today)"
      });
      
      const scheduleData = await queueService.getDailySchedule(staffId, dateStr);
      const sortedAppointments = (scheduleData.schedule || []).sort((a, b) => {
        // ✅ Use startTime if available, fall back to scheduledTime
        const getTime = (apt: any) => {
          if (apt.startTime) {
            return new Date(apt.startTime).getTime();
          }
          if (apt.scheduledTime && apt.appointmentDate) {
            // Combine date + time for proper sorting
            return new Date(`${apt.appointmentDate}T${apt.scheduledTime}`).getTime();
          }
          return 0;
        };
        
        return getTime(a) - getTime(b);
      });
      
      logger.debug("Appointments fetched for calendar", {
        date: dateStr,
        count: sortedAppointments.length,
        appointments: sortedAppointments.map(apt => ({
          id: apt.id,
          patient: apt.patient?.fullName || apt.guestPatient?.fullName || 'Unknown',
          status: apt.status,
          appointmentDate: apt.appointmentDate,
          startTime: apt.startTime,
        }))
      });
      
      setAppointments(sortedAppointments);
    } catch (error) {
      logger.error("Error fetching appointments", error as Error, { staffId, selectedDate: format(selectedDate, 'yyyy-MM-dd') });
      toast({ 
        title: "Error", 
        description: "Failed to load appointments", 
        variant: "destructive" 
      });
    } finally {
      setLoadingAppointments(false);
    }
  }, [staffId, selectedDate, queueService]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Smart status badge function
  const getStatusBadge = (apt: QueueEntry) => {
    // If patient is marked absent and has not returned, that is the most important status
    if (apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt) {
      return (
        <Badge className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0 shadow-sm">
          <UserX className="w-3 h-3 mr-1" />
          Absent
        </Badge>
      );
    }
    
    // Status styling map
    const statusConfig: StatusConfig = {
      scheduled: { 
        variant: "outline", 
        icon: Clock,
        className: "border-blue-300 text-blue-700 bg-blue-50" 
      },
      waiting: { 
        variant: "outline", 
        icon: Clock,
        className: "border-orange-300 text-orange-700 bg-orange-50" 
      },
      in_progress: { 
        variant: "default", 
        icon: Activity,
        className: "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-sm" 
      },
      completed: { 
        variant: "default", 
        icon: CheckCircle2,
        className: "bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0 shadow-sm" 
      },
      cancelled: { 
        variant: "destructive", 
        icon: XCircle,
        className: "bg-gradient-to-r from-gray-500 to-gray-600 text-white border-0 shadow-sm" 
      },
      no_show: { 
        variant: "destructive", 
        icon: UserX,
        className: "bg-gradient-to-r from-red-500 to-red-600 text-white border-0 shadow-sm" 
      },
    };

    const config = statusConfig[apt.status] || statusConfig.scheduled;
    const Icon = config.icon;

    return (
      <Badge className={config.className}>
        {Icon && <Icon className="w-3 h-3 mr-1" />}
        {apt.status.replace('_', ' ')}
      </Badge>
    );
  };
  
  const workingHours = useMemo(() => {
    if (!clinic?.settings?.working_hours) return null;
    const dayName = format(selectedDate, 'EEEE').toLowerCase();
    return clinic.settings.working_hours[dayName];
  }, [clinic, selectedDate]);
  
  const isClosed = workingHours?.closed;

  // Calculate stats
  const stats = useMemo(() => {
    const scheduled = appointments.filter(a => a.status === 'scheduled').length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const absent = appointments.filter(a => a.skipReason === SkipReason.PATIENT_ABSENT && !a.returnedAt).length;
    return { scheduled, completed, absent, total: appointments.length };
  }, [appointments]);

  return (
    <div className="space-y-6">
      {/* Clean Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-blue-600" />
            Schedule Calendar
          </h1>
          <p className="text-base text-gray-600">View and manage appointments by date</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-blue-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Total</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 group-hover:scale-110 transition-transform">
                <CalendarIcon className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {stats.total}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-orange-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Scheduled</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-100 to-amber-200 group-hover:scale-110 transition-transform">
                <Clock className="w-4 h-4 text-orange-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              {stats.scheduled}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-purple-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Completed</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-purple-200 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {stats.completed}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-red-50/50 rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-red-500/10 to-transparent rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-600">Absent</span>
              <div className="p-2 rounded-lg bg-gradient-to-br from-red-100 to-red-200 group-hover:scale-110 transition-transform">
                <UserX className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-red-600 to-red-700 bg-clip-text text-transparent">
              {stats.absent}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar Card */}
        <Card className="lg:col-span-1 relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all bg-white rounded-2xl">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-transparent rounded-full blur-3xl"></div>
          <CardHeader className="relative z-10 border-b bg-gradient-to-r from-blue-50/50 via-sky-50/30 to-cyan-50/50">
            <CardTitle className="text-xl font-bold">Select Date</CardTitle>
            <CardDescription className="text-base">Choose a date to view appointments</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pt-6 relative z-10">
            <Calendar 
              mode="single" 
              selected={selectedDate} 
              onSelect={(date) => date && setSelectedDate(date)} 
              className="rounded-xl border-2 border-gray-200" 
            />
          </CardContent>
        </Card>

        {/* Appointments Card */}
        <Card className="lg:col-span-2 relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all bg-white rounded-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-full blur-3xl"></div>
          <CardHeader className="relative z-10 border-b bg-gradient-to-r from-blue-50/50 via-sky-50/30 to-cyan-50/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-xl font-bold mb-2">
                  Appointments for {format(selectedDate, 'MMMM d, yyyy')}
                </CardTitle>
                <CardDescription className="text-base space-y-2">
                  {!isToday(selectedDate) && (
                    <div className="flex items-center gap-2 text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
                      <AlertCircle className="w-4 h-4" />
                      <span>
                        Viewing {format(selectedDate, 'MMMM d')} - Live Queue only shows today's appointments
                      </span>
                    </div>
                  )}
                  {isClosed ? (
                    <span className="flex items-center gap-2 text-red-600 font-semibold">
                      <XCircle className="w-4 h-4" />
                      Clinic closed on this day
                    </span>
                  ) : workingHours ? (
                    <span className="flex items-center gap-2 text-green-600 font-semibold">
                      <Clock className="w-4 h-4" />
                      Working hours: {workingHours.open} - {workingHours.close}
                    </span>
                  ) : (
                    <span className="text-gray-500">No working hours configured</span>
                  )}
                </CardDescription>
              </div>
              <Button 
                onClick={() => setShowBookAppointment(true)} 
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all rounded-xl"
              >
                <Plus className="w-4 h-4 mr-2" />
                Book
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 relative z-10">
            {loadingAppointments ? (
              <div className="flex justify-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center animate-pulse">
                  <CalendarIcon className="w-10 h-10 text-blue-600" />
                </div>
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-12 h-12 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No appointments scheduled</h3>
                <p className="text-gray-500 mb-1">This day is free</p>
                <p className="text-sm text-gray-400">Click "Book" to add an appointment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <div 
                    key={apt.id} 
                    className={cn(
                      "flex items-center justify-between p-5 border-2 rounded-2xl transition-all",
                      apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt 
                        ? "bg-red-50/50 border-red-200 opacity-70 hover:opacity-100" 
                        : "border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md"
                    )}
                  >
                    <div className="flex items-center gap-4 flex-1">
                    <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center font-bold text-sm shadow-md",
                        apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt
                          ? "bg-gradient-to-br from-red-400 to-red-500 text-white"
                          : "bg-gradient-to-br from-blue-500 to-cyan-500 text-white"
                      )}>
                        {(() => {
                          // ✅ NEW: Check both startTime and scheduledTime fields
                          if (apt.startTime) {
                            // startTime is a Date object
                            return format(apt.startTime, 'HH:mm');
                          } else if (apt.scheduledTime) {
                            // scheduledTime is a string like "14:30:00" or "14:30"
                            return typeof apt.scheduledTime === 'string' 
                              ? apt.scheduledTime.slice(0, 5) 
                              : '--:--';
                          }
                          return '--:--';
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base text-gray-900 truncate">
                          {apt.patient?.fullName || 'Unknown Patient'}
                        </h3>
                        <p className="text-sm text-gray-500 capitalize truncate">
                          {apt.appointmentType?.replace('_', ' ') || 'No Type'}
                        </p>
                      </div>
                    </div>
                    <div>
                      {getStatusBadge(apt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Book Appointment Dialog */}
      <BookAppointmentDialog 
        open={showBookAppointment} 
        onOpenChange={setShowBookAppointment} 
        clinicId={clinic?.id || ""} 
        staffId={staffId || ""} 
        onSuccess={() => { 
          fetchAppointments(); 
          setShowBookAppointment(false); 
        }} 
        preselectedDate={selectedDate}
      />
    </div>
  );
}
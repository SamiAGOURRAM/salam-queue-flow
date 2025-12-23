/**
 * Clinic Calendar - Premium Apple/Uber Design
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  UserX,
  CheckCircle2,
  Play,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BookAppointmentDialog } from "@/components/clinic/BookAppointmentDialog";
import { format, isToday, addDays, subDays } from "date-fns";
import { logger } from "@/services/shared/logging/Logger";
import { QueueEntry, SkipReason } from "@/services/queue";
import { QueueService } from "@/services/queue/QueueService";
import { staffService } from "@/services/staff/StaffService";
import { clinicService } from "@/services/clinic/ClinicService";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

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

  // Get status styling for appointment
  const getStatusStyle = (apt: QueueEntry) => {
    if (apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt) {
      return {
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-200 dark:border-red-800',
        dot: 'bg-red-500',
        text: 'text-red-600 dark:text-red-400',
        label: 'Absent'
      };
    }

    const statusMap: Record<string, { bg: string; border: string; dot: string; text: string; label: string }> = {
      scheduled: {
        bg: 'bg-blue-50 dark:bg-blue-950/30',
        border: 'border-blue-200 dark:border-blue-800',
        dot: 'bg-blue-500',
        text: 'text-blue-600 dark:text-blue-400',
        label: 'Scheduled'
      },
      waiting: {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-200 dark:border-amber-800',
        dot: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        label: 'Waiting'
      },
      in_progress: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        border: 'border-emerald-200 dark:border-emerald-800',
        dot: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        label: 'Active'
      },
      completed: {
        bg: 'bg-gray-50 dark:bg-gray-900/50',
        border: 'border-gray-200 dark:border-gray-800',
        dot: 'bg-gray-400',
        text: 'text-gray-500 dark:text-gray-400',
        label: 'Done'
      },
      cancelled: {
        bg: 'bg-gray-50 dark:bg-gray-900/50',
        border: 'border-gray-200 dark:border-gray-800',
        dot: 'bg-gray-400',
        text: 'text-gray-500 dark:text-gray-400',
        label: 'Cancelled'
      },
    };

    return statusMap[apt.status] || statusMap.scheduled;
  };

  const workingHours = useMemo(() => {
    if (!clinic?.settings?.working_hours) return null;
    const dayName = format(selectedDate, 'EEEE').toLowerCase();
    return clinic.settings.working_hours[dayName];
  }, [clinic, selectedDate]);

  const isClosed = workingHours?.closed;

  // Calculate stats
  const stats = useMemo(() => {
    const scheduled = appointments.filter(a => a.status === 'scheduled' || a.status === 'waiting').length;
    const inProgress = appointments.filter(a => a.status === 'in_progress').length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const absent = appointments.filter(a => a.skipReason === SkipReason.PATIENT_ABSENT && !a.returnedAt).length;
    return { scheduled, inProgress, completed, absent, total: appointments.length };
  }, [appointments]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and manage appointments
          </p>
        </div>
        <Button
          onClick={() => setShowBookAppointment(true)}
          size="sm"
          className="bg-foreground text-background hover:bg-foreground/90 h-8 px-3 text-xs font-medium w-fit"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Book
        </Button>
      </div>

      {/* Date Navigation + Inline Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {format(selectedDate, 'EEE, MMM d')}
            </span>
            {isToday(selectedDate) && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white">
                TODAY
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isToday(selectedDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(new Date())}
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              Today
            </Button>
          )}
        </div>

        {/* Inline Stats - Scrollable on mobile */}
        <div className="flex items-center gap-3 sm:gap-5 text-sm overflow-x-auto pb-1">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground hidden sm:inline">Scheduled</span>
            <span className="font-semibold text-foreground">{stats.scheduled}</span>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground hidden sm:inline">Active</span>
            <span className="font-semibold text-foreground">{stats.inProgress}</span>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-muted-foreground hidden sm:inline">Done</span>
            <span className="font-semibold text-foreground">{stats.completed}</span>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-muted-foreground hidden sm:inline">Absent</span>
            <span className="font-semibold text-foreground">{stats.absent}</span>
          </div>
        </div>
      </div>

      {/* Working Hours Info */}
      {isClosed ? (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <XCircle className="w-4 h-4" />
          <span>Clinic closed on {format(selectedDate, 'EEEE')}</span>
        </div>
      ) : workingHours ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Working hours: {workingHours.open} - {workingHours.close}</span>
        </div>
      ) : null}

      {/* Main Content Grid */}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr] items-start">
        {/* Calendar Sidebar - Hidden on mobile, show as collapsible or just date nav */}
        <div className="hidden lg:block border border-border rounded-lg bg-card p-4 h-fit">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            className="w-full"
          />
        </div>

        {/* Appointments List */}
        <div className="border border-border rounded-lg bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">
              {format(selectedDate, 'MMMM d, yyyy')}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.total} appointment{stats.total !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="p-4">
            {loadingAppointments ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <CalendarIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No appointments</p>
                <p className="text-xs text-muted-foreground mt-1">This day is free</p>
              </div>
            ) : (
              <div className="space-y-1">
                {appointments.map((apt) => {
                  const statusStyle = getStatusStyle(apt);
                  const timeDisplay = (() => {
                    if (apt.startTime) {
                      return format(new Date(apt.startTime), 'h:mm a');
                    } else if (apt.scheduledTime) {
                      const [h, m] = apt.scheduledTime.split(':');
                      const hour = parseInt(h);
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      const hour12 = hour % 12 || 12;
                      return `${hour12}:${m} ${ampm}`;
                    }
                    return '--:--';
                  })();

                  return (
                    <div
                      key={apt.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all",
                        statusStyle.bg,
                        statusStyle.border,
                        apt.status === 'completed' && "opacity-60"
                      )}
                    >
                      {/* Time */}
                      <div className="w-16 flex-shrink-0">
                        <p className="text-xs font-medium text-foreground">{timeDisplay}</p>
                      </div>

                      {/* Status Dot */}
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusStyle.dot)} />

                      {/* Patient Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {apt.patient?.fullName || 'Unknown Patient'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {apt.appointmentType?.replace('_', ' ') || 'Appointment'}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded", statusStyle.text, statusStyle.bg)}>
                        {statusStyle.label}
                      </span>

                      {/* Status Icons */}
                      {apt.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      {apt.status === 'in_progress' && (
                        <Play className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      )}
                      {apt.skipReason === SkipReason.PATIENT_ABSENT && !apt.returnedAt && (
                        <UserX className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
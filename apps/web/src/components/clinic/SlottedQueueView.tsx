/**
 * Slotted Queue View - Premium Timeline Design
 */
import { Button } from "@/components/ui/button";
import { QueueEntry, AppointmentStatus, SkipReason } from "@/services/queue";
import { Clock, UserCheck, UserX, CheckCircle2, Play, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SlottedQueueViewProps {
  schedule: QueueEntry[];
  currentPatient: QueueEntry | null;
  onCheckIn?: (appointmentId: string) => void;
  onMarkAbsent?: (appointmentId: string) => void;
  onMarkPresent?: (appointmentId: string) => void;
  onMarkNotPresent?: (appointmentId: string) => void;
  actionLoading?: boolean;
  gracePeriodMinutes?: number;
  workingDayStart?: Date | null;
  workingDayEnd?: Date | null;
}

export function SlottedQueueView({
  schedule,
  currentPatient,
  onCheckIn,
  onMarkAbsent,
  onMarkPresent,
  onMarkNotPresent,
  actionLoading = false,
  gracePeriodMinutes = 15,
  workingDayStart,
  workingDayEnd,
}: SlottedQueueViewProps) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get today's appointments
  const todayAppointments = useMemo(() => {
    return schedule
      .filter(apt => {
        if (!apt.startTime) return false;
        const aptDate = new Date(apt.startTime);
        return aptDate.getDate() === today.getDate() &&
               aptDate.getMonth() === today.getMonth() &&
               aptDate.getFullYear() === today.getFullYear() &&
               apt.skipReason !== SkipReason.PATIENT_ABSENT;
      })
      .sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
        return timeA - timeB;
      });
  }, [schedule, today]);

  // Generate time slots (every 30 minutes from 9am to 6pm)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 9; hour <= 18; hour++) {
      slots.push({ hour, minute: 0 });
      if (hour < 18) {
        slots.push({ hour, minute: 30 });
      }
    }
    return slots;
  }, []);

  // Get appointment for a specific time slot
  const getAppointmentAtSlot = (slotHour: number, slotMinute: number) => {
    const slotTime = new Date(today);
    slotTime.setHours(slotHour, slotMinute, 0, 0);
    const slotEnd = new Date(slotTime);
    slotEnd.setMinutes(slotEnd.getMinutes() + 30);

    return todayAppointments.find(apt => {
      if (!apt.startTime || !apt.endTime) return false;
      const aptStart = new Date(apt.startTime);
      const aptEnd = new Date(apt.endTime);
      
      // Check if appointment overlaps with this 30-minute slot
      return aptStart < slotEnd && aptEnd > slotTime;
    });
  };

  // Get status config for appointment
  const getStatusConfig = (apt: QueueEntry) => {
    if (apt.status === AppointmentStatus.COMPLETED) {
      return {
        bg: 'bg-gray-50 dark:bg-gray-900/50',
        border: 'border-gray-200 dark:border-gray-800',
        dot: 'bg-gray-400',
        text: 'text-gray-500 dark:text-gray-400',
        label: 'Done'
      };
    }
    if (apt.status === AppointmentStatus.IN_PROGRESS) {
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        border: 'border-emerald-200 dark:border-emerald-800',
        dot: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        label: 'Active'
      };
    }
    if (apt.skipReason === SkipReason.PATIENT_ABSENT || apt.status === AppointmentStatus.CANCELLED) {
      return {
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-200 dark:border-red-800',
        dot: 'bg-red-500',
        text: 'text-red-600 dark:text-red-400',
        label: 'Cancelled'
      };
    }
    if (apt.status === AppointmentStatus.WAITING && apt.isPresent) {
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-200 dark:border-amber-800',
        dot: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        label: 'Waiting'
      };
    }
    return {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      dot: 'bg-blue-500',
      text: 'text-blue-600 dark:text-blue-400',
      label: 'Scheduled'
    };
  };

  const formatTime = (date: Date) => format(date, "h:mm a");
  const formatTimeRange = (start: Date, end: Date) => `${formatTime(start)} - ${formatTime(end)}`;
  const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Create grid items: appointments and gaps
  const gridItems = useMemo(() => {
    const items: Array<{
      type: 'appointment' | 'gap';
      appointment?: QueueEntry;
      startTime?: Date;
      endTime?: Date;
      durationSlots?: number;
    }> = [];

    // Sort appointments by start time
    const sortedAppts = [...todayAppointments].sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
      return timeA - timeB;
    });

    const defaultStart = new Date(today);
    defaultStart.setHours(9, 0, 0, 0);
    const defaultEnd = new Date(today);
    defaultEnd.setHours(18, 0, 0, 0);
    
    const workStart = workingDayStart ? new Date(workingDayStart) : defaultStart;
    const workEnd = workingDayEnd ? new Date(workingDayEnd) : defaultEnd;

    if (sortedAppts.length === 0) {
      // No appointments - show full day as gap
      const gapMinutes = (workEnd.getTime() - workStart.getTime()) / (1000 * 60);
      items.push({
        type: 'gap',
        startTime: workStart,
        endTime: workEnd,
        durationSlots: Math.ceil(gapMinutes / 30),
      });
      return items;
    }

    // Gap before first appointment
    const firstAppt = sortedAppts[0];
    if (firstAppt.startTime) {
      const firstStart = new Date(firstAppt.startTime);
      if (firstStart > workStart) {
        const gapMinutes = (firstStart.getTime() - workStart.getTime()) / (1000 * 60);
        items.push({
          type: 'gap',
          startTime: workStart,
          endTime: firstStart,
          durationSlots: Math.ceil(gapMinutes / 30),
        });
      }
    }

    // Appointments and gaps
    for (let i = 0; i < sortedAppts.length; i++) {
      const appointment = sortedAppts[i];
      const startTime = appointment.startTime ? new Date(appointment.startTime) : null;
      const endTime = appointment.endTime ? new Date(appointment.endTime) : null;
      
      if (startTime && endTime) {
        const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
        items.push({
          type: 'appointment',
          appointment,
          startTime,
          endTime,
          durationSlots: Math.ceil(durationMinutes / 30),
        });

        // Gap after this appointment
        if (i < sortedAppts.length - 1) {
          const nextAppt = sortedAppts[i + 1];
          if (nextAppt.startTime) {
            const nextStart = new Date(nextAppt.startTime);
            if (nextStart > endTime) {
              const gapMinutes = (nextStart.getTime() - endTime.getTime()) / (1000 * 60);
              items.push({
                type: 'gap',
                startTime: endTime,
                endTime: nextStart,
                durationSlots: Math.ceil(gapMinutes / 30),
              });
            }
          }
        }
      }
    }

    // Gap after last appointment
    const lastAppt = sortedAppts[sortedAppts.length - 1];
    if (lastAppt.endTime) {
      const lastEnd = new Date(lastAppt.endTime);
      if (lastEnd < workEnd) {
        const gapMinutes = (workEnd.getTime() - lastEnd.getTime()) / (1000 * 60);
        items.push({
          type: 'gap',
          startTime: lastEnd,
          endTime: workEnd,
          durationSlots: Math.ceil(gapMinutes / 30),
        });
      }
    }

    return items;
  }, [todayAppointments, workingDayStart, workingDayEnd, today]);

  if (gridItems.length === 0 || (gridItems.length === 1 && gridItems[0].type === 'gap')) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Clock className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No appointments scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {gridItems.map((item, index) => {
        if (item.type === 'gap') {
          const gapMins = item.durationSlots ? item.durationSlots * 30 : 0;
          if (gapMins < 30) return null; // Don't show tiny gaps

          return (
            <div
              key={`gap-${index}`}
              className="flex items-center gap-3 py-2 px-3"
            >
              <div className="w-16 text-xs text-muted-foreground text-right">
                {item.startTime && formatTime(item.startTime)}
              </div>
              <div className="flex-1 border-t border-dashed border-border" />
              <span className="text-xs text-muted-foreground">
                {Math.floor(gapMins / 60) > 0 ? `${Math.floor(gapMins / 60)}h ` : ''}{gapMins % 60}m free
              </span>
            </div>
          );
        }

        // Appointment item
        const appointment = item.appointment!;
        const statusConfig = getStatusConfig(appointment);
        const startTime = item.startTime!;
        const endTime = item.endTime!;
        const isCurrent = appointment.id === currentPatient?.id;
        const isPast = endTime < now && appointment.status !== AppointmentStatus.IN_PROGRESS;
        const canMarkPresent = !appointment.isPresent &&
          (appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED);
        const canMarkAbsent = appointment.status === AppointmentStatus.WAITING ||
          appointment.status === AppointmentStatus.SCHEDULED;

        return (
          <div
            key={appointment.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all",
              statusConfig.bg,
              statusConfig.border,
              isCurrent && "ring-1 ring-emerald-500 ring-offset-1",
              isPast && "opacity-60"
            )}
          >
            {/* Time Column */}
            <div className="w-16 flex-shrink-0">
              <p className="text-xs font-medium text-foreground">
                {formatTime(startTime)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formatTime(endTime)}
              </p>
            </div>

            {/* Status Dot */}
            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusConfig.dot)} />

            {/* Patient Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {appointment.patient?.fullName || 'Patient'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {appointment.appointmentType || 'Appointment'}
              </p>
            </div>

            {/* Status Badge */}
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded", statusConfig.text, statusConfig.bg)}>
              {statusConfig.label}
            </span>

            {/* Actions */}
            {appointment.status !== AppointmentStatus.COMPLETED &&
             appointment.status !== AppointmentStatus.CANCELLED && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {canMarkPresent && onMarkPresent && (
                  <Button
                    onClick={() => onMarkPresent(appointment.id)}
                    disabled={actionLoading}
                    size="sm"
                    className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <UserCheck className="h-3 w-3 mr-1" />
                    Present
                  </Button>
                )}
                {canMarkAbsent && onMarkAbsent && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!appointment.isPresent && onMarkPresent && (
                        <DropdownMenuItem onClick={() => onMarkPresent(appointment.id)}>
                          <UserCheck className="h-4 w-4 mr-2" />
                          Mark Present
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onMarkAbsent(appointment.id)}
                        className="text-red-600"
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Mark Absent
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}

            {/* Completed Icon */}
            {appointment.status === AppointmentStatus.COMPLETED && (
              <CheckCircle2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}

            {/* Active Icon */}
            {appointment.status === AppointmentStatus.IN_PROGRESS && (
              <Play className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

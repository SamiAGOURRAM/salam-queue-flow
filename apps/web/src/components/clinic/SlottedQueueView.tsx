/**
 * Slotted Queue View - Grid Layout for Today
 * Displays appointments in a grid format with time slots
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueueEntry, AppointmentStatus, SkipReason } from "@/services/queue";
import { Clock, UserCheck, UserX, CheckCircle2, XCircle, AlertCircle, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMemo } from "react";

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
        color: 'bg-success', 
        borderColor: 'border-success', 
        icon: CheckCircle2, 
        label: 'Completed',
        textColor: 'text-success'
      };
    }
    if (apt.status === AppointmentStatus.IN_PROGRESS) {
      return { 
        color: 'bg-teal', 
        borderColor: 'border-teal', 
        icon: Play, 
        label: 'In Progress',
        textColor: 'text-teal'
      };
    }
    if (apt.skipReason === SkipReason.PATIENT_ABSENT || apt.status === AppointmentStatus.CANCELLED) {
      return { 
        color: 'bg-destructive', 
        borderColor: 'border-destructive', 
        icon: XCircle, 
        label: 'Canceled',
        textColor: 'text-destructive'
      };
    }
    if (apt.status === AppointmentStatus.WAITING && apt.isPresent) {
      return { 
        color: 'bg-warning', 
        borderColor: 'border-warning', 
        icon: Clock, 
        label: 'Patient is waiting',
        textColor: 'text-warning'
      };
    }
    return { 
      color: 'bg-primary', 
      borderColor: 'border-primary', 
      icon: Clock, 
      label: 'Scheduled',
      textColor: 'text-primary'
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

  return (
    <div className="space-y-4">
      {/* Grid Layout */}
      <div className="border-2 border-border/80 rounded-xl overflow-hidden bg-card">
        {/* Grid Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
          {gridItems.map((item, index) => {
            if (item.type === 'gap') {
              const gapHours = item.durationSlots ? Math.floor((item.durationSlots * 30) / 60) : 0;
              const gapMins = item.durationSlots ? (item.durationSlots * 30) % 60 : 0;
              const isPast = item.endTime ? new Date(item.endTime) < now : false;
              
              return (
                <div
                  key={`gap-${index}`}
                  className={cn(
                    "rounded-xl border-2 border-dashed border-border/50 bg-background-tertiary/30 p-4 min-h-[120px] flex flex-col items-center justify-center",
                    isPast && "opacity-50"
                  )}
                >
                  <Clock className="h-6 w-6 text-foreground-muted mb-2" />
                  {item.startTime && item.endTime && (
                    <div className="text-xs font-semibold text-foreground-muted text-center mb-1">
                      {formatTime(item.startTime)} - {formatTime(item.endTime)}
                    </div>
                  )}
                  <Badge variant="outline" className="text-xs border-border/50 bg-background-secondary">
                    {gapHours > 0 ? `${gapHours}h ` : ''}{gapMins}m available
                  </Badge>
                </div>
              );
            }

            // Appointment item
            const appointment = item.appointment!;
            const statusConfig = getStatusConfig(appointment);
            const StatusIcon = statusConfig.icon;
            const startTime = item.startTime!;
            const endTime = item.endTime!;
            const isCurrent = appointment.id === currentPatient?.id;
            const isPast = startTime < now;

            return (
              <div
                key={appointment.id}
                className={cn(
                  "relative rounded-xl border-2 p-4 min-h-[120px] transition-all hover:shadow-md",
                  statusConfig.color,
                  statusConfig.borderColor,
                  isCurrent && "ring-2 ring-teal/30 ring-offset-2",
                  isPast && "opacity-70"
                )}
              >
                {/* Status Bar */}
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1 rounded-l",
                  statusConfig.color
                )}></div>

                <div className="pl-3 space-y-2">
                  <div className="text-xs font-semibold text-foreground-primary">
                    {formatTimeRange(startTime, endTime)}
                  </div>
                  
                  <div className="font-bold text-sm text-foreground-primary">
                    {appointment.patient?.fullName || 'Patient'}
                  </div>
                  
                  <div className="text-xs text-foreground-secondary">
                    {appointment.appointmentType || 'Appointment'}
                  </div>
                  
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs border-0",
                      statusConfig.color,
                      statusConfig.textColor,
                      "bg-opacity-10"
                    )}
                  >
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusConfig.label}
                  </Badge>

                  {/* Actions */}
                  {appointment.status !== AppointmentStatus.COMPLETED && 
                   appointment.status !== AppointmentStatus.CANCELLED && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/30">
                      {!appointment.isPresent && (appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED) && onMarkPresent && (
                        <Button
                          onClick={() => onMarkPresent(appointment.id)}
                          disabled={actionLoading}
                          size="sm"
                          className="bg-success hover:bg-success-600 text-white text-xs h-7"
                        >
                          <UserCheck className="h-3 w-3 mr-1" />
                          Present
                        </Button>
                      )}
                      {(appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED) && onMarkAbsent && (
                        <Button
                          onClick={() => onMarkAbsent(appointment.id)}
                          disabled={actionLoading}
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 text-xs h-7"
                        >
                          <UserX className="h-3 w-3 mr-1" />
                          Absent
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

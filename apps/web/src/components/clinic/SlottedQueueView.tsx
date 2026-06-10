/**
 * Slotted Queue View - Premium Timeline Design
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QueueEntry, AppointmentStatus, SkipReason } from "@/services/queue";
import { Clock, UserCheck, UserX, CheckCircle2, Play, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMemo } from "react";
import type { NoShowCountdownState } from "@/hooks/useNoShowDetection";
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
  onCallPatient?: (appointmentId: string) => void;
  onOpenAppointment?: (appointmentId: string) => void;
  actionLoading?: boolean;
  gracePeriodMinutes?: number;
  workingDayStart?: Date | null;
  workingDayEnd?: Date | null;
  countdownByAppointmentId?: Record<string, NoShowCountdownState>;
}

export function SlottedQueueView({
  schedule,
  currentPatient,
  onCheckIn,
  onMarkAbsent,
  onMarkPresent,
  onMarkNotPresent,
  onCallPatient,
  onOpenAppointment,
  actionLoading = false,
  gracePeriodMinutes = 15,
  workingDayStart,
  workingDayEnd,
  countdownByAppointmentId = {},
}: SlottedQueueViewProps) {
  const now = new Date();

  const parseTimeParts = (value: string): { hours: number; minutes: number; seconds: number } | null => {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? '0');

    if (
      Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds) ||
      hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59
    ) {
      return null;
    }

    return { hours, minutes, seconds };
  };

  const getAppointmentWindow = (appointment: QueueEntry): { startTime: Date; endTime: Date } | null => {
    if (!appointment.scheduledTime) return null;

    const appointmentDate = appointment.appointmentDate instanceof Date
      ? appointment.appointmentDate
      : new Date(appointment.appointmentDate);
    if (Number.isNaN(appointmentDate.getTime())) return null;

    const parsedTime = parseTimeParts(appointment.scheduledTime);
    if (!parsedTime) return null;

    const startTime = new Date(appointmentDate);
    startTime.setHours(parsedTime.hours, parsedTime.minutes, parsedTime.seconds, 0);
    if (Number.isNaN(startTime.getTime())) return null;

    const durationMinutes = appointment.estimatedDurationMinutes && appointment.estimatedDurationMinutes > 0
      ? appointment.estimatedDurationMinutes
      : 15;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    return { startTime, endTime };
  };

  // The schedule is already day-scoped by backend RPC; avoid re-filtering by local "today"
  // because timezone conversions can hide valid entries.
  const slottedAppointments = useMemo(() => {
    return schedule
      .filter(apt => {
        const appointmentWindow = getAppointmentWindow(apt);
        return Boolean(appointmentWindow);
      })
      .sort((a, b) => {
        const timeA = getAppointmentWindow(a)?.startTime.getTime() ?? Infinity;
        const timeB = getAppointmentWindow(b)?.startTime.getTime() ?? Infinity;
        return timeA - timeB;
      });
  }, [schedule]);

  const overflowAppointments = useMemo(() => {
    return schedule
      .filter((appointment) => {
        const hasScheduledWindow = Boolean(getAppointmentWindow(appointment));
        if (hasScheduledWindow) {
          return false;
        }

        return [
          AppointmentStatus.SCHEDULED,
          AppointmentStatus.WAITING,
          AppointmentStatus.IN_PROGRESS,
        ].includes(appointment.status);
      })
      .sort((a, b) => {
        const scoreA = a.priorityScore || 0;
        const scoreB = b.priorityScore || 0;

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
      });
  }, [schedule]);

  // Get status config for appointment
  const getStatusConfig = (apt: QueueEntry) => {
    if (apt.status === AppointmentStatus.COMPLETED) {
      return {
        bg: 'bg-gray-50 dark:bg-obsidian/50',
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
    const sortedAppts = [...slottedAppointments].sort((a, b) => {
      const timeA = getAppointmentWindow(a)?.startTime.getTime() ?? Infinity;
      const timeB = getAppointmentWindow(b)?.startTime.getTime() ?? Infinity;
      return timeA - timeB;
    });

    const referenceDate = sortedAppts[0]?.appointmentDate
      ? new Date(sortedAppts[0].appointmentDate)
      : now;

    const defaultStart = new Date(referenceDate);
    defaultStart.setHours(9, 0, 0, 0);
    const defaultEnd = new Date(referenceDate);
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
    const firstWindow = getAppointmentWindow(firstAppt);
    if (firstWindow) {
      const firstStart = firstWindow.startTime;
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
      const appointmentWindow = getAppointmentWindow(appointment);
      const startTime = appointmentWindow?.startTime || null;
      const endTime = appointmentWindow?.endTime || null;
      
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
          const nextWindow = getAppointmentWindow(nextAppt);
          if (nextWindow) {
            const nextStart = nextWindow.startTime;
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
    const lastWindow = getAppointmentWindow(lastAppt);
    if (lastWindow) {
      const lastEnd = lastWindow.endTime;
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
  }, [slottedAppointments, workingDayStart, workingDayEnd, now]);

  const hasTimelineAppointments = !(gridItems.length === 0 || (gridItems.length === 1 && gridItems[0].type === 'gap'));

  if (!hasTimelineAppointments && overflowAppointments.length === 0) {
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
      {hasTimelineAppointments && gridItems.map((item, index) => {
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
        const isAbsent = appointment.skipReason === SkipReason.PATIENT_ABSENT && !appointment.returnedAt;
        const graceCountdown = countdownByAppointmentId[appointment.id];
        const canMarkPresent = !appointment.isPresent &&
          (appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED);
        const canMarkAbsent = !isAbsent && (appointment.status === AppointmentStatus.WAITING ||
          appointment.status === AppointmentStatus.SCHEDULED);
        const canCallNow =
          !currentPatient &&
          Boolean(onCallPatient) &&
          appointment.isPresent &&
          (appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED);

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
            {onOpenAppointment ? (
              <button
                type="button"
                onClick={() => onOpenAppointment(appointment.id)}
                className="flex-1 min-w-0 text-left rounded px-1 py-0.5 -mx-1 hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {appointment.patient?.fullName || 'Patient'}
                  </p>
                  {appointment.status === AppointmentStatus.IN_PROGRESS && appointment.resource?.name && (
                    <Badge variant="outline" className="h-5 rounded-full text-[10px] px-2 border-emerald-300/60 text-emerald-700">
                      {appointment.resource.name}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {appointment.appointmentType || 'Appointment'}
                </p>
                {graceCountdown && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 h-5 rounded-full text-[10px] px-2 font-medium",
                      graceCountdown.urgency === 'expired' && "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-100/60 dark:bg-red-950/50",
                      graceCountdown.urgency === 'expiring' && "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/50",
                      graceCountdown.urgency === 'normal' && "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-900/50"
                    )}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {graceCountdown.isExpired
                      ? 'Grace expired'
                      : `Grace ${graceCountdown.label} left`}
                  </Badge>
                )}
              </button>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {appointment.patient?.fullName || 'Patient'}
                  </p>
                  {appointment.status === AppointmentStatus.IN_PROGRESS && appointment.resource?.name && (
                    <Badge variant="outline" className="h-5 rounded-full text-[10px] px-2 border-emerald-300/60 text-emerald-700">
                      {appointment.resource.name}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {appointment.appointmentType || 'Appointment'}
                </p>
                {graceCountdown && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 h-5 rounded-full text-[10px] px-2 font-medium",
                      graceCountdown.urgency === 'expired' && "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-100/60 dark:bg-red-950/50",
                      graceCountdown.urgency === 'expiring' && "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/50",
                      graceCountdown.urgency === 'normal' && "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-900/50"
                    )}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {graceCountdown.isExpired
                      ? 'Grace expired'
                      : `Grace ${graceCountdown.label} left`}
                  </Badge>
                )}
              </div>
            )}

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
                      {canCallNow && onCallPatient && (
                        <DropdownMenuItem onClick={() => onCallPatient(appointment.id)}>
                          <Play className="h-4 w-4 mr-2" />
                          Call Now
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

      {overflowAppointments.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5">
                Overflow Lane
              </Badge>
              <p className="text-xs text-muted-foreground">
                Hybrid queue patients without fixed time
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {overflowAppointments.length} waiting
            </p>
          </div>

          {overflowAppointments.map((appointment) => {
            const statusConfig = getStatusConfig(appointment);
            const isAbsent = appointment.skipReason === SkipReason.PATIENT_ABSENT && !appointment.returnedAt;
            const graceCountdown = countdownByAppointmentId[appointment.id];
            const canMarkPresent = !appointment.isPresent &&
              (appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED);
            const canMarkAbsent = !isAbsent && (appointment.status === AppointmentStatus.WAITING ||
              appointment.status === AppointmentStatus.SCHEDULED);
            const canCallNow =
              !currentPatient &&
              Boolean(onCallPatient) &&
              appointment.isPresent &&
              (appointment.status === AppointmentStatus.WAITING || appointment.status === AppointmentStatus.SCHEDULED);

            return (
              <div
                key={`overflow-${appointment.id}`}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all",
                  statusConfig.bg,
                  statusConfig.border
                )}
              >
                <div className="w-16 flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground">FIFO</p>
                  <p className="text-xs font-medium text-foreground">
                    #{appointment.queuePosition ?? '-'}
                  </p>
                </div>

                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusConfig.dot)} />

                {onOpenAppointment ? (
                  <button
                    type="button"
                    onClick={() => onOpenAppointment(appointment.id)}
                    className="flex-1 min-w-0 text-left rounded px-1 py-0.5 -mx-1 hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="text-sm font-medium text-foreground truncate">
                      {appointment.patient?.fullName || 'Patient'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {appointment.appointmentType || 'Appointment'}
                    </p>
                    {graceCountdown && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1 h-5 rounded-full text-[10px] px-2 font-medium",
                          graceCountdown.urgency === 'expired' && "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-100/60 dark:bg-red-950/50",
                          graceCountdown.urgency === 'expiring' && "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/50",
                          graceCountdown.urgency === 'normal' && "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-900/50"
                        )}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {graceCountdown.isExpired
                          ? 'Grace expired'
                          : `Grace ${graceCountdown.label} left`}
                      </Badge>
                    )}
                  </button>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {appointment.patient?.fullName || 'Patient'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {appointment.appointmentType || 'Appointment'}
                    </p>
                  </div>
                )}

                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded", statusConfig.text, statusConfig.bg)}>
                  {statusConfig.label}
                </span>

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
                          {canCallNow && onCallPatient && (
                            <DropdownMenuItem onClick={() => onCallPatient(appointment.id)}>
                              <Play className="h-4 w-4 mr-2" />
                              Call Now
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

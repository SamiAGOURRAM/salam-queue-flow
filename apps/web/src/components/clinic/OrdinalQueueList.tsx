/**
 * OrdinalQueueList - Premium Queue Design
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QueueEntry, AppointmentStatus, SkipReason } from "@/services/queue";
import { Clock, UserCheck, UserX, MoreHorizontal, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoShowCountdownState } from "@/hooks/useNoShowDetection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrdinalQueueListProps {
  patients: QueueEntry[];
  currentPatient: QueueEntry | null;
  onMarkAbsent: (id: string) => void;
  onMarkPresent?: (id: string) => void;
  onMarkNotPresent?: (id: string) => void;
  onCallPatient?: (id: string) => void;
  onOpenAppointment?: (appointmentId: string) => void;
  loading: boolean;
  countdownByAppointmentId?: Record<string, NoShowCountdownState>;
}

const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const formatScheduledTime = (scheduledTime?: string) => {
  if (!scheduledTime) return '';

  const [hourPart, minutePart] = scheduledTime.split(':');
  const hour = parseInt(hourPart, 10);
  if (Number.isNaN(hour)) return scheduledTime;

  const minutes = (minutePart || '00').padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${minutes} ${ampm}`;
};

export function OrdinalQueueList({
  patients,
  currentPatient,
  onMarkAbsent,
  onMarkPresent,
  onMarkNotPresent,
  onCallPatient,
  onOpenAppointment,
  loading,
  countdownByAppointmentId = {},
}: OrdinalQueueListProps) {

  if (patients.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Clock className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No patients waiting</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {patients.map((patient, index) => {
        const isAbsent = patient.skipReason === SkipReason.PATIENT_ABSENT && !patient.returnedAt;
        const graceCountdown = countdownByAppointmentId[patient.id];
        const isNext = index === 0 && !currentPatient && patient.isPresent;
        const canMarkPresent = !patient.isPresent &&
          (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED);
        const canMarkAbsent = !isAbsent && (patient.status === AppointmentStatus.WAITING ||
          patient.status === AppointmentStatus.SCHEDULED);
        const canCallNow =
          !currentPatient &&
          Boolean(onCallPatient) &&
          patient.isPresent &&
          (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED);

        // Determine status styling
        const getStatusStyle = () => {
          if (isNext) {
            return {
              bg: 'bg-blue-50 dark:bg-blue-950/30',
              border: 'border-blue-200 dark:border-blue-800',
              dot: 'bg-blue-500'
            };
          }
          if (isAbsent) {
            return {
              bg: 'bg-red-50 dark:bg-red-950/30',
              border: 'border-red-200 dark:border-red-800',
              dot: 'bg-red-500'
            };
          }
          if (!patient.isPresent) {
            return {
              bg: 'bg-amber-50 dark:bg-amber-950/30',
              border: 'border-amber-200 dark:border-amber-800',
              dot: 'bg-amber-500'
            };
          }
          return {
            bg: 'bg-card hover:bg-muted/50',
            border: 'border-border',
            dot: 'bg-gray-400'
          };
        };

        const statusStyle = getStatusStyle();

        return (
          <div
            key={patient.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all",
              statusStyle.bg,
              statusStyle.border
            )}
          >
            {/* Queue Position */}
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
            </div>

            {/* Status Dot */}
            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusStyle.dot)} />

            {/* Patient Info */}
            {onOpenAppointment ? (
              <button
                type="button"
                onClick={() => onOpenAppointment(patient.id)}
                className="flex-1 min-w-0 text-left rounded px-1 py-0.5 -mx-1 hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {patient.patient?.fullName || 'Patient'}
                  </p>
                  {patient.status === AppointmentStatus.IN_PROGRESS && patient.resource?.name && (
                    <Badge variant="outline" className="h-5 rounded-full text-[10px] px-2 border-emerald-300/60 text-emerald-700">
                      {patient.resource.name}
                    </Badge>
                  )}
                  {isNext && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white">
                      NEXT
                    </span>
                  )}
                  {isAbsent && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
                      Absent
                    </span>
                  )}
                  {!isAbsent && !patient.isPresent && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                      Not Present
                    </span>
                  )}
                  {graceCountdown && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 rounded-full text-[10px] px-2 font-medium",
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
                <p className="text-xs text-muted-foreground truncate">
                  {patient.appointmentType || 'Appointment'}
                  {patient.scheduledTime && ` • ${formatScheduledTime(patient.scheduledTime)}`}
                </p>
              </button>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {patient.patient?.fullName || 'Patient'}
                  </p>
                  {patient.status === AppointmentStatus.IN_PROGRESS && patient.resource?.name && (
                    <Badge variant="outline" className="h-5 rounded-full text-[10px] px-2 border-emerald-300/60 text-emerald-700">
                      {patient.resource.name}
                    </Badge>
                  )}
                  {isNext && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white">
                      NEXT
                    </span>
                  )}
                  {isAbsent && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
                      Absent
                    </span>
                  )}
                  {!isAbsent && !patient.isPresent && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                      Not Present
                    </span>
                  )}
                  {graceCountdown && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 rounded-full text-[10px] px-2 font-medium",
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
                <p className="text-xs text-muted-foreground truncate">
                  {patient.appointmentType || 'Appointment'}
                  {patient.scheduledTime && ` • ${formatScheduledTime(patient.scheduledTime)}`}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canMarkPresent && onMarkPresent && (
                <Button
                  onClick={() => onMarkPresent(patient.id)}
                  disabled={loading}
                  size="sm"
                  className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <UserCheck className="h-3 w-3 mr-1" />
                  Present
                </Button>
              )}

              {canMarkAbsent && (
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
                    {patient.isPresent && onMarkNotPresent && (
                      <DropdownMenuItem onClick={() => onMarkNotPresent(patient.id)}>
                        <Clock className="h-4 w-4 mr-2" />
                        Mark Not Present
                      </DropdownMenuItem>
                    )}
                    {!patient.isPresent && onMarkPresent && (
                      <DropdownMenuItem onClick={() => onMarkPresent(patient.id)}>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Mark Present
                      </DropdownMenuItem>
                    )}
                    {canCallNow && onCallPatient && (
                      <DropdownMenuItem onClick={() => onCallPatient(patient.id)}>
                        <Play className="h-4 w-4 mr-2" />
                        Call Now
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onMarkAbsent(patient.id)}
                      className="text-red-600"
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Mark Absent
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

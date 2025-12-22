/**
 * OrdinalQueueList - Premium Queue Design
 */
import { Button } from "@/components/ui/button";
import { QueueEntry, AppointmentStatus } from "@/services/queue";
import { Clock, UserCheck, UserX, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
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
  loading: boolean;
}

const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

export function OrdinalQueueList({
  patients,
  currentPatient,
  onMarkAbsent,
  onMarkPresent,
  onMarkNotPresent,
  loading
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
        const isNext = index === 0 && !currentPatient && patient.isPresent;
        const canMarkPresent = !patient.isPresent &&
          (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED);
        const canMarkAbsent = patient.status === AppointmentStatus.WAITING ||
          patient.status === AppointmentStatus.SCHEDULED;

        // Determine status styling
        const getStatusStyle = () => {
          if (isNext) {
            return {
              bg: 'bg-blue-50 dark:bg-blue-950/30',
              border: 'border-blue-200 dark:border-blue-800',
              dot: 'bg-blue-500'
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">
                  {patient.patient?.fullName || 'Patient'}
                </p>
                {isNext && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white">
                    NEXT
                  </span>
                )}
                {!patient.isPresent && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                    Not Present
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {patient.appointmentType || 'Appointment'}
                {patient.startTime && ` • ${format(new Date(patient.startTime), "h:mm a")}`}
              </p>
            </div>

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

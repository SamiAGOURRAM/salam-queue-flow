/**
 * OrdinalQueueList - Premium "Next Appointments" Style
 * Clean list view matching the inspiration design
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { QueueEntry, AppointmentStatus } from "@/services/queue";
import { Clock, UserCheck, UserX, AlertCircle, Play, CheckCircle2, MoreVertical, RotateCcw, Stethoscope, FlaskConical } from "lucide-react";
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

// Get icon based on appointment type
const getAppointmentIcon = (type?: string) => {
  if (!type) return Clock;
  const lowerType = type.toLowerCase();
  if (lowerType.includes('follow') || lowerType.includes('follow-up')) return RotateCcw;
  if (lowerType.includes('consultation') || lowerType.includes('general')) return Stethoscope;
  if (lowerType.includes('lab') || lowerType.includes('test') || lowerType.includes('diagnostic')) return FlaskConical;
  return Clock;
};

export function OrdinalQueueList({ 
  patients, 
  currentPatient, 
  onMarkAbsent, 
  onMarkPresent,
  onMarkNotPresent,
  loading 
}: OrdinalQueueListProps) {
  const nextPresentPatient = patients.find(
    p => !currentPatient && 
    (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) &&
    p.isPresent
  );

  if (patients.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="h-16 w-16 rounded-full bg-background-tertiary flex items-center justify-center mx-auto mb-4">
          <Clock className="h-8 w-8 text-foreground-muted" />
        </div>
        <p className="text-foreground-muted font-medium">No patients waiting</p>
        <p className="text-sm text-foreground-muted/70 mt-1">The queue is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patients.map((patient) => {
        const isNext = nextPresentPatient?.id === patient.id;
        const canBeCalled = patient.isPresent && (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED);
        const AppointmentIcon = getAppointmentIcon(patient.appointmentType);
        
        // Format time range
        const timeRange = patient.startTime && patient.endTime
          ? `${format(new Date(patient.startTime), "h:mm a")} - ${format(new Date(patient.endTime), "h:mm a")}`
          : patient.startTime
          ? format(new Date(patient.startTime), "h:mm a")
          : "No time set";
        
        // Get doctor name (if available)
        const doctorName = "Dr. Staff"; // Staff name would come from staffId if needed
        
        return (
          <div
            key={patient.id}
            className={cn(
              "group relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-sm bg-card",
              isNext
                ? "border-primary/60 bg-primary/5"
                : !patient.isPresent
                ? "border-warning/40 bg-warning/5"
                : "border-border/80 hover:border-primary/30"
            )}
          >
            {/* Icon */}
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 border-2",
              isNext 
                ? "bg-primary/10 border-primary/30 text-primary" 
                : "bg-background-tertiary border-border/50 text-foreground-muted"
            )}>
              <AppointmentIcon className="h-6 w-6" />
            </div>
            
            {/* Patient Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold text-base text-foreground-primary">
                  {patient.patient?.fullName || 'Patient'} - {patient.appointmentType || 'Appointment'}
                </p>
                {isNext && (
                  <Badge className="bg-primary text-white text-xs border-0">
                    Next
                  </Badge>
                )}
                {!patient.isPresent && (
                  <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 text-xs">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not Present
                  </Badge>
                )}
              </div>
              
              <p className="text-sm text-foreground-secondary">
                {timeRange} • {doctorName}
              </p>
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-2">
              {canBeCalled && !currentPatient ? (
                <Button 
                  disabled={loading} 
                  size="sm" 
                  className="bg-primary hover:bg-primary-600 text-white shadow-sm"
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Start Appointment
                </Button>
              ) : !patient.isPresent && onMarkPresent && (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED) ? (
                <Button 
                  onClick={() => onMarkPresent(patient.id)} 
                  disabled={loading} 
                  size="sm" 
                  className="bg-success hover:bg-success-600 text-white shadow-sm"
                >
                  <UserCheck className="mr-1 h-3.5 w-3.5" />
                  Mark Present
                </Button>
              ) : (
                <Button 
                  disabled={loading} 
                  size="sm" 
                  variant="outline"
                  className="border-border/80 text-foreground-secondary hover:bg-background-secondary"
                >
                  View Details
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {patient.isPresent && onMarkNotPresent && patient.status !== AppointmentStatus.IN_PROGRESS && (
                    <DropdownMenuItem onClick={() => onMarkNotPresent(patient.id)}>
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Mark Not Present
                    </DropdownMenuItem>
                  )}
                  {(patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED) && (
                    <DropdownMenuItem 
                      onClick={() => onMarkAbsent(patient.id)}
                      className="text-destructive"
                    >
                      <UserX className="mr-2 h-4 w-4" />
                      Mark Absent
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem>
                    <Clock className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}

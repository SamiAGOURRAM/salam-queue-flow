/**
 * OrdinalQueueList
 * Renders only the list of waiting patients for an ordinal-based queue.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueueEntry, AppointmentStatus } from "@/services/queue";
import { Clock, UserCheck, UserX, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface OrdinalQueueListProps {
  patients: QueueEntry[];
  currentPatient: QueueEntry | null;
  onMarkAbsent: (id: string) => void;
  onMarkPresent?: (id: string) => void;
  onMarkNotPresent?: (id: string) => void;
  loading: boolean;
}

const getPositionDisplay = (pos?: number | null) => !pos ? "—" : pos.toString().padStart(3, '0');
const formatWaitTime = (entry: QueueEntry) => !entry.checkedInAt ? "Not checked in" : formatDistanceToNow(entry.checkedInAt, { addSuffix: true });

export function OrdinalQueueList({ 
  patients, 
  currentPatient, 
  onMarkAbsent, 
  onMarkPresent,
  onMarkNotPresent,
  loading 
}: OrdinalQueueListProps) {
  // Find the next patient who is present (can be called)
  const nextPresentPatient = patients.find(
    p => !currentPatient && 
    (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) &&
    p.isPresent
  );
  if (patients.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">No patients waiting</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {patients.map((patient) => {
        const isNext = nextPresentPatient?.id === patient.id;
        const canBeCalled = patient.isPresent && (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED);
        
        return (
          <div
            key={patient.id}
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
              isNext
                ? "border-orange-300 bg-orange-50"
                : !patient.isPresent
                ? "border-amber-200 bg-amber-50/50"
                : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className={cn(
              "h-12 w-12 rounded-full flex items-center justify-center font-bold shadow-sm",
              isNext 
                ? "bg-orange-500 text-white" 
                : !patient.isPresent
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-700"
            )}>
              {getPositionDisplay(patient.queuePosition)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold truncate">{patient.patient?.fullName || 'Patient'}</p>
                {isNext && (<Badge className="bg-orange-500 text-white text-xs">Next</Badge>)}
                {patient.isPresent ? (
                  <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                    <UserCheck className="mr-1 h-3 w-3" />Checked In
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
                    <AlertCircle className="mr-1 h-3 w-3" />Not Present
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-500">{patient.patient?.phoneNumber || 'No phone'}</p>
              {patient.checkedInAt && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />Waiting {formatWaitTime(patient)}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {!patient.isPresent && onMarkPresent && (patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED) && (
                <Button 
                  onClick={() => onMarkPresent(patient.id)} 
                  disabled={loading} 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700 text-white text-xs"
                >
                  <UserCheck className="mr-1 h-3.5 w-3.5" />Mark Present
                </Button>
              )}
              {patient.isPresent && onMarkNotPresent && patient.status !== AppointmentStatus.IN_PROGRESS && (
                <Button 
                  onClick={() => onMarkNotPresent(patient.id)} 
                  disabled={loading} 
                  size="sm" 
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 text-xs"
                >
                  <AlertCircle className="mr-1 h-3.5 w-3.5" />Mark Not Present
                </Button>
              )}
              {(patient.status === AppointmentStatus.WAITING || patient.status === AppointmentStatus.SCHEDULED) && (
                <Button 
                  onClick={() => onMarkAbsent(patient.id)} 
                  disabled={loading} 
                  size="sm" 
                  variant="outline" 
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <UserX className="mr-1 h-3.5 w-3.5" />Absent
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
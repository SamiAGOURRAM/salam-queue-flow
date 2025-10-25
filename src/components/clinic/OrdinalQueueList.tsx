/**
 * OrdinalQueueList
 * Renders only the list of waiting patients for an ordinal-based queue.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueueEntry, UserCheck, Clock, UserX } from "@/services/queue";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface OrdinalQueueListProps {
  patients: QueueEntry[];
  currentPatient: QueueEntry | null;
  onMarkAbsent: (id: string) => void;
  loading: boolean;
}

const getPositionDisplay = (pos?: number | null) => !pos ? "—" : pos.toString().padStart(3, '0');
const formatWaitTime = (entry: QueueEntry) => !entry.checkedInAt ? "Not checked in" : formatDistanceToNow(entry.checkedInAt, { addSuffix: true });

export function OrdinalQueueList({ patients, currentPatient, onMarkAbsent, loading }: OrdinalQueueListProps) {
  if (patients.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">No patients waiting</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {patients.map((patient, index) => (
        <div
          key={patient.id}
          className={cn(
            "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
            index === 0 && !currentPatient
              ? "border-orange-300 bg-orange-50"
              : "border-slate-200 hover:border-slate-300"
          )}
        >
          <div className={cn("h-12 w-12 rounded-full flex items-center justify-center font-bold shadow-sm", index === 0 && !currentPatient ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-700")}>
            {getPositionDisplay(patient.queuePosition)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold truncate">{patient.patient?.fullName || 'Patient'}</p>
              {index === 0 && !currentPatient && (<Badge className="bg-orange-500 text-white text-xs">Next</Badge>)}
              {patient.isPresent && (<Badge variant="outline" className="text-green-600 border-green-600 text-xs"><UserCheck className="mr-1 h-3 w-3" />Checked In</Badge>)}
            </div>
            <p className="text-sm text-slate-500">{patient.patient?.phoneNumber || 'No phone'}</p>
            {patient.checkedInAt && (<p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock className="h-3 w-3" />Waiting {formatWaitTime(patient)}</p>)}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => onMarkAbsent(patient.id)} disabled={loading} size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
              <UserX className="mr-1 h-4 w-4" /> Absent
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
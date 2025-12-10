/**
 * TimeGridQueueList (Placeholder)
 * Renders a time-based view of the schedule.
 */
import { QueueEntry } from "@/services/queue";
import { format } from 'date-fns';

export function TimeGridQueueList({ patients }: { patients: QueueEntry[] }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-8 text-center">
      <h3 className="text-lg font-semibold">Time-Grid View</h3>
      <p className="text-muted-foreground mt-1">This clinic operates on a time-based schedule.</p>
      <div className="mt-4 space-y-2 text-left">
        {patients.map(p => (
          <div key={p.id} className="bg-slate-100 p-2 rounded-md flex justify-between">
            <span className="font-mono">{p.startTime ? format(new Date(p.startTime), 'HH:mm') : ''}</span>
            <span>{p.patient?.fullName}</span>
            <span className="capitalize">{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClinicResourceAvailability, QueueEntry } from "@/services/queue";
import { cn } from "@/lib/utils";

interface ResourceAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: QueueEntry | null;
  resources: ClinicResourceAvailability[];
  schedule: QueueEntry[];
  loading?: boolean;
  onAssign: (resourceId?: string) => Promise<void> | void;
}

export function ResourceAssignmentDialog({
  open,
  onOpenChange,
  patient,
  resources,
  schedule,
  loading = false,
  onAssign,
}: ResourceAssignmentDialogProps) {
  const [submittingResourceId, setSubmittingResourceId] = useState<string | "skip" | null>(null);

  const occupiedByResource = useMemo(() => {
    const map = new Map<string, string>();
    schedule
      .filter((entry) => entry.status === "in_progress" && entry.resourceId)
      .forEach((entry) => {
        map.set(entry.resourceId as string, entry.patient?.fullName || "Occupied");
      });
    return map;
  }, [schedule]);

  const handleAssign = async (resourceId?: string) => {
    setSubmittingResourceId(resourceId ?? "skip");
    try {
      await onAssign(resourceId);
      onOpenChange(false);
    } finally {
      setSubmittingResourceId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-[8px]">
        <DialogHeader>
          <DialogTitle>Assign Room</DialogTitle>
          <DialogDescription>
            {patient
              ? `Select a resource for ${patient.patient?.fullName || "this patient"}.`
              : "Select a resource for the next patient."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-1">
          {resources.map((resource) => {
            const occupiedBy = occupiedByResource.get(resource.id);
            const isOccupied = resource.isOccupied || Boolean(occupiedBy);

            return (
              <button
                key={resource.id}
                type="button"
                disabled={loading || submittingResourceId !== null || isOccupied}
                onClick={() => {
                  void handleAssign(resource.id);
                }}
                className={cn(
                  "text-left rounded-[4px] border px-3 py-2 transition-colors",
                  isOccupied
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                )}
              >
                <p className="text-sm font-medium truncate">{resource.name}</p>
                <p className="text-xs opacity-80">
                  {isOccupied ? occupiedBy || "Occupied" : "Free"}
                </p>
              </button>
            );
          })}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={loading || submittingResourceId !== null}
            onClick={() => {
              void handleAssign(undefined);
            }}
          >
            Skip - no room needed
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || submittingResourceId !== null}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

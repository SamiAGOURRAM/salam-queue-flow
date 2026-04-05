import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ClinicResourceAvailability, QueueEntry } from "@/services/queue";

interface ResourceOccupancyPanelProps {
  resources: ClinicResourceAvailability[];
  schedule: QueueEntry[];
  loading?: boolean;
}

export function ResourceOccupancyPanel({ resources, schedule, loading = false }: ResourceOccupancyPanelProps) {
  const occupiedByResource = useMemo(() => {
    const map = new Map<string, string>();
    schedule
      .filter((entry) => entry.status === "in_progress" && entry.resourceId)
      .forEach((entry) => {
        map.set(entry.resourceId as string, entry.patient?.fullName || "Occupied");
      });
    return map;
  }, [schedule]);

  if (resources.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Occupancy</p>
        {loading && <p className="text-xs text-muted-foreground">Refreshing...</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {resources.map((resource) => {
          const occupiedBy = occupiedByResource.get(resource.id);
          const isOccupied = resource.isOccupied || Boolean(occupiedBy);

          return (
            <span
              key={resource.id}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                isOccupied
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              {resource.name} - {isOccupied ? occupiedBy || "Occupied" : "Free"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

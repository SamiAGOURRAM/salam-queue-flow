import {
  AppointmentStatus,
  QueueEntry,
  QueueMode,
  SkipReason,
} from './models/QueueModels';

export interface QueueModePreviewItem {
  appointmentId: string;
  patientName: string;
  currentPosition: number;
  projectedPosition: number;
  delta: number;
  scheduledTime?: string;
  lane: 'scheduled' | 'overflow';
}

export interface QueueModePreviewResult {
  targetMode: QueueMode;
  generatedAt: Date;
  currentOrder: QueueModePreviewItem[];
  projectedOrder: QueueModePreviewItem[];
  movedCount: number;
  unchangedCount: number;
}

function sortByCurrentQueue(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => {
    const positionA = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
    const positionB = b.queuePosition ?? Number.MAX_SAFE_INTEGER;

    if (positionA !== positionB) {
      return positionA - positionB;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function toTimestamp(entry: QueueEntry): number {
  if (!entry.scheduledTime) {
    return Infinity;
  }

  const date = entry.appointmentDate;
  const dateOnly = date.toISOString().split('T')[0];
  const normalizedTime = entry.scheduledTime.length === 5
    ? `${entry.scheduledTime}:00`
    : entry.scheduledTime;

  const parsed = new Date(`${dateOnly}T${normalizedTime}`);
  return Number.isNaN(parsed.getTime()) ? Infinity : parsed.getTime();
}

function sortBySlotted(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => {
    const timeA = toTimestamp(a);
    const timeB = toTimestamp(b);

    if (timeA !== timeB) {
      return timeA - timeB;
    }

    const positionA = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
    const positionB = b.queuePosition ?? Number.MAX_SAFE_INTEGER;

    if (positionA !== positionB) {
      return positionA - positionB;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function sortByFluid(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => {
    const scoreA = a.priorityScore || 0;
    const scoreB = b.priorityScore || 0;

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    const positionA = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
    const positionB = b.queuePosition ?? Number.MAX_SAFE_INTEGER;

    if (positionA !== positionB) {
      return positionA - positionB;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function sortByHybrid(entries: QueueEntry[], now: Date): QueueEntry[] {
  const scheduledDue = entries
    .filter((entry) => entry.scheduledTime && toTimestamp(entry) <= now.getTime())
    .sort((a, b) => {
      const timeA = toTimestamp(a);
      const timeB = toTimestamp(b);
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
    });

  const overflow = entries
    .filter((entry) => !entry.scheduledTime)
    .sort((a, b) => {
      const scoreA = a.priorityScore || 0;
      const scoreB = b.priorityScore || 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
    });

  const scheduledFuture = entries
    .filter((entry) => entry.scheduledTime && toTimestamp(entry) > now.getTime())
    .sort((a, b) => {
      const timeA = toTimestamp(a);
      const timeB = toTimestamp(b);
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
    });

  return [...scheduledDue, ...overflow, ...scheduledFuture];
}

function toPreviewItems(
  orderedEntries: QueueEntry[],
  previousPositionsById: Record<string, number>
): QueueModePreviewItem[] {
  return orderedEntries.map((entry, index) => {
    const projectedPosition = index + 1;
    const currentPosition = previousPositionsById[entry.id] ?? projectedPosition;

    return {
      appointmentId: entry.id,
      patientName: entry.patient?.fullName || 'Patient',
      currentPosition,
      projectedPosition,
      delta: currentPosition - projectedPosition,
      scheduledTime: entry.scheduledTime,
      lane: entry.scheduledTime ? 'scheduled' : 'overflow',
    };
  });
}

export function previewQueueModeTransition(
  schedule: QueueEntry[],
  targetMode: QueueMode,
  now: Date = new Date()
): QueueModePreviewResult {
  const candidates = schedule.filter((entry) => {
    const activeStatus =
      entry.status === AppointmentStatus.SCHEDULED ||
      entry.status === AppointmentStatus.WAITING;

    return activeStatus && entry.skipReason !== SkipReason.PATIENT_ABSENT;
  });

  const currentOrdered = sortByCurrentQueue(candidates);

  const projectedOrdered = targetMode === QueueMode.FLUID
    ? sortByFluid(candidates)
    : targetMode === QueueMode.HYBRID
      ? sortByHybrid(candidates, now)
      : sortBySlotted(candidates);

  const currentPositionsById = currentOrdered.reduce<Record<string, number>>((acc, entry, index) => {
    acc[entry.id] = index + 1;
    return acc;
  }, {});

  const currentOrder = toPreviewItems(currentOrdered, currentPositionsById);
  const projectedOrder = toPreviewItems(projectedOrdered, currentPositionsById);

  const movedCount = projectedOrder.filter((entry) => entry.delta !== 0).length;

  return {
    targetMode,
    generatedAt: now,
    currentOrder,
    projectedOrder,
    movedCount,
    unchangedCount: projectedOrder.length - movedCount,
  };
}

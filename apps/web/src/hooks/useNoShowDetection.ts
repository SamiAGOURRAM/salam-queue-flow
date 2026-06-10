import { useCallback, useMemo } from "react";
import { QueueEntry, SkipReason } from "@/services/queue";
import { GraceCountdownState, resolveGraceCountdown, useGracePeriodTimer } from "./useGracePeriodTimer";

export interface NoShowCountdownState extends GraceCountdownState {
  appointmentId: string;
  markedAbsentAt: Date;
  gracePeriodEndsAt: Date;
}

interface UseNoShowDetectionResult {
  countdownByAppointmentId: Record<string, NoShowCountdownState>;
  getCountdownForAppointment: (appointmentId: string) => NoShowCountdownState | null;
  expiringSoonCount: number;
  expiredCount: number;
}

const toValidDate = (value: Date | string | undefined): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function useNoShowDetection(
  entries: QueueEntry[],
  gracePeriodMinutes = 15
): UseNoShowDetectionResult {
  const { nowMs } = useGracePeriodTimer(1000);

  const countdownByAppointmentId = useMemo(() => {
    const byAppointmentId: Record<string, NoShowCountdownState> = {};
    const graceWindowMs = Math.max(1, gracePeriodMinutes) * 60_000;

    for (const entry of entries) {
      if (entry.skipReason !== SkipReason.PATIENT_ABSENT || entry.returnedAt) {
        continue;
      }

      const markedAbsentAt = toValidDate(entry.markedAbsentAt);
      if (!markedAbsentAt) {
        continue;
      }

      const gracePeriodEndsAt = new Date(markedAbsentAt.getTime() + graceWindowMs);
      const countdown = resolveGraceCountdown(gracePeriodEndsAt, nowMs);
      if (!countdown) {
        continue;
      }

      byAppointmentId[entry.id] = {
        appointmentId: entry.id,
        markedAbsentAt,
        gracePeriodEndsAt,
        ...countdown,
      };
    }

    return byAppointmentId;
  }, [entries, gracePeriodMinutes, nowMs]);

  const getCountdownForAppointment = useCallback(
    (appointmentId: string) => countdownByAppointmentId[appointmentId] ?? null,
    [countdownByAppointmentId]
  );

  const countdownStates = useMemo(() => Object.values(countdownByAppointmentId), [countdownByAppointmentId]);

  return {
    countdownByAppointmentId,
    getCountdownForAppointment,
    expiringSoonCount: countdownStates.filter((countdown) => countdown.urgency === "expiring").length,
    expiredCount: countdownStates.filter((countdown) => countdown.urgency === "expired").length,
  };
}
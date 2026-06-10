import { useCallback, useEffect, useMemo, useState } from "react";

export type GraceUrgency = "normal" | "expiring" | "expired";

export interface GraceCountdownState {
  deadline: Date;
  remainingMs: number;
  remainingSeconds: number;
  isExpired: boolean;
  urgency: GraceUrgency;
  label: string;
}

const EXPIRING_SOON_THRESHOLD_MS = 2 * 60 * 1000;

const toValidDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatGraceCountdown = (remainingMs: number): string => {
  const safeRemaining = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(safeRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
};

export const resolveGraceCountdown = (
  deadlineInput: Date | string | null | undefined,
  nowMs: number
): GraceCountdownState | null => {
  const deadline = toValidDate(deadlineInput);
  if (!deadline) return null;

  const remainingMs = Math.max(0, deadline.getTime() - nowMs);
  const isExpired = remainingMs <= 0;
  const urgency: GraceUrgency = isExpired
    ? "expired"
    : remainingMs <= EXPIRING_SOON_THRESHOLD_MS
      ? "expiring"
      : "normal";

  return {
    deadline,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isExpired,
    urgency,
    label: isExpired ? "Expired" : formatGraceCountdown(remainingMs),
  };
};

export function useGracePeriodTimer(tickIntervalMs = 1000) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, tickIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [tickIntervalMs]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const getCountdown = useCallback(
    (deadlineInput: Date | string | null | undefined) => resolveGraceCountdown(deadlineInput, nowMs),
    [nowMs]
  );

  return {
    now,
    nowMs,
    getCountdown,
  };
}
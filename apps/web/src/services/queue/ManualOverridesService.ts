import { QueueRepository } from './repositories/QueueRepository';
import { QueueActionType, AppointmentStatus, QueueEntry, QueueMode } from './models/QueueModels';
import { logger } from '../shared/logging/Logger';

const ACTIVE_MOVE_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.WAITING,
  AppointmentStatus.IN_PROGRESS,
]);

const DEFAULT_PRIORITY_SCORE = 100;
const PRIORITY_STEP = 10;
const MAX_SECONDS_IN_DAY = (24 * 60 * 60) - 1;
const FALLBACK_SLOT_TIME = '09:00:00';

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const toDateKey = (value: Date): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString().split('T')[0];
};

const parseTimeToSeconds = (timeValue?: string): number | null => {
  if (!timeValue) return null;

  const parts = timeValue.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] ?? '0');
  const seconds = Number(parts[2] ?? '0');

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return (hours * 3600) + (minutes * 60) + seconds;
};

const formatSecondsToTime = (seconds: number): string => {
  const clamped = clamp(Math.round(seconds), 0, MAX_SECONDS_IN_DAY);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getScoreForEntry = (entry: QueueEntry): number => {
  if (typeof entry.priorityScore === 'number' && Number.isFinite(entry.priorityScore)) {
    return entry.priorityScore;
  }
  // Fallback keeps higher-ranked entries with higher synthetic scores.
  return (DEFAULT_PRIORITY_SCORE * 10) - entry.queuePosition;
};

export class ManualOverridesService {
  constructor(private repository: QueueRepository) {}

  /**
   * Swaps two patients in the queue
   * In Fluid mode, swaps their priority scores.
    * In Slotted mode, swaps their start times to preserve deterministic order.
   */
  async swapPatients(
    appointmentId1: string,
    appointmentId2: string,
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      const appt1 = await this.repository.getQueueEntryById(appointmentId1);
      const appt2 = await this.repository.getQueueEntryById(appointmentId2);

      if (!appt1 || !appt2) {
        throw new Error('One or both appointments not found');
      }

      if (appt1.clinicId !== appt2.clinicId) {
        throw new Error('Cannot swap appointments from different clinics');
      }

      // Capture state for audit
      const state1 = {
        queuePosition: appt1.queuePosition,
        priorityScore: appt1.priorityScore,
        scheduledTime: appt1.scheduledTime,
      };
      const state2 = {
        queuePosition: appt2.queuePosition,
        priorityScore: appt2.priorityScore,
        scheduledTime: appt2.scheduledTime,
      };

      // Perform Swap
      // We swap Priority Scores (for Fluid) and Start Times (for Slotted)
      // to ensure they swap places regardless of mode.

      await this.repository.updateQueueEntry(appt1.id, {
        priorityScore: state2.priorityScore,
        scheduledTime: state2.scheduledTime,
      });

      try {
        await this.repository.updateQueueEntry(appt2.id, {
          priorityScore: state1.priorityScore,
          scheduledTime: state1.scheduledTime,
        });
      } catch (secondUpdateError) {
        // Rollback first update to prevent inconsistent state
        logger.warn('Second swap update failed, rolling back first update', {
          appointmentId1, appointmentId2,
        });
        await this.repository.updateQueueEntry(appt1.id, {
          priorityScore: state1.priorityScore,
          scheduledTime: state1.scheduledTime,
        });
        throw secondUpdateError;
      }

      // Log Overrides
      await this.repository.createQueueOverride(
        appt1.clinicId,
        appt1.id,
        QueueActionType.SWAP,
        performedBy,
        `Swapped with ${appt2.patient?.fullName || 'patient'}: ${reason}`,
        state1.queuePosition,
        state2.queuePosition, // Expected new position
        state1,
        state2
      );

      await this.repository.createQueueOverride(
        appt2.clinicId,
        appt2.id,
        QueueActionType.SWAP,
        performedBy,
        `Swapped with ${appt1.patient?.fullName || 'patient'}: ${reason}`,
        state2.queuePosition,
        state1.queuePosition, // Expected new position
        state2,
        state1
      );

      logger.info('Swapped patients successfully', { appointmentId1, appointmentId2, performedBy });

    } catch (error) {
      logger.error('Failed to swap patients', error as Error);
      throw error;
    }
  }

  /**
   * Boosts a patient's priority
   * Increases priority score to move them up the queue (Fluid mode).
   */
  async boostPriority(
    appointmentId: string,
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      const appt = await this.repository.getQueueEntryById(appointmentId);
      if (!appt) throw new Error('Appointment not found');

      const oldScore = appt.priorityScore || 100;
      const newScore = oldScore + 50; // Boost by 50 points

      const previousState = { priorityScore: oldScore, queuePosition: appt.queuePosition };

      await this.repository.updateQueueEntry(appointmentId, {
        priorityScore: newScore,
      });

      await this.repository.createQueueOverride(
        appt.clinicId,
        appt.id,
        QueueActionType.PRIORITY_BOOST,
        performedBy,
        reason,
        appt.queuePosition,
        undefined, // New position unknown until recalc
        previousState,
        { priorityScore: newScore }
      );

      logger.info('Boosted patient priority', { appointmentId, newScore });
    } catch (error) {
      logger.error('Failed to boost priority', error as Error);
      throw error;
    }
  }

  /**
   * Manually moves a patient to a specific position (approximate)
   * This is complex because we can't force queue_position directly if triggers exist.
   * We simulate it by adjusting priority score to be between neighbors.
   */
  async manualMove(
    appointmentId: string,
    targetPosition: number,
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      const appt = await this.repository.getQueueEntryById(appointmentId);
      if (!appt) {
        throw new Error('Appointment not found');
      }

      const normalizedTarget = Math.max(1, Math.floor(targetPosition));
      if (appt.queuePosition === normalizedTarget) {
        logger.info('manualMove skipped because appointment is already at target position', {
          appointmentId,
          targetPosition: normalizedTarget,
        });
        return;
      }

      const previousState = {
        queuePosition: appt.queuePosition,
        priorityScore: appt.priorityScore,
        scheduledTime: appt.scheduledTime,
      };

      let updatedEntry = await this.repository.updateQueueEntry(appointmentId, {
        queuePosition: normalizedTarget,
      });

      // Some environments recalculate queue_position via triggers.
      // If the direct move does not stick, rebalance based on the active queue mode.
      if (updatedEntry.queuePosition !== normalizedTarget) {
        logger.warn('Direct queuePosition update did not persist target; applying mode-aware fallback', {
          appointmentId,
          expectedPosition: normalizedTarget,
          actualPosition: updatedEntry.queuePosition,
        });

        updatedEntry = await this.moveWithFallbackRebalancing(appt, normalizedTarget);
      }

      await this.repository.createQueueOverride(
        appt.clinicId,
        appt.id,
        QueueActionType.REORDER,
        performedBy,
        reason,
        appt.queuePosition,
        normalizedTarget,
        previousState,
        {
          queuePosition: updatedEntry.queuePosition,
          priorityScore: updatedEntry.priorityScore,
          scheduledTime: updatedEntry.scheduledTime,
        }
      );

      logger.info('Manually moved patient in queue', {
        appointmentId,
        previousPosition: appt.queuePosition,
        targetPosition: normalizedTarget,
        finalPosition: updatedEntry.queuePosition,
        performedBy,
      });
    } catch (error) {
      logger.error('Failed to manually move patient', error as Error, {
        appointmentId,
        targetPosition,
        performedBy,
      });
      throw error;
    }
  }

  private async moveWithFallbackRebalancing(
    appointment: QueueEntry,
    targetPosition: number
  ): Promise<QueueEntry> {
    if (!appointment.staffId) {
      throw new Error('Manual move fallback requires an assigned staffId');
    }

    const targetDate = toDateKey(appointment.appointmentDate);
    const schedulePayload = await this.repository.getDailySchedule(appointment.staffId, targetDate);

    const activeQueue = schedulePayload.schedule
      .filter((entry) => ACTIVE_MOVE_STATUSES.has(entry.status))
      .sort((a, b) => a.queuePosition - b.queuePosition);

    const queueWithoutCurrent = activeQueue.filter((entry) => entry.id !== appointment.id);
    const insertionPosition = clamp(targetPosition, 1, queueWithoutCurrent.length + 1);

    if (
      schedulePayload.queue_mode === QueueMode.SLOTTED ||
      (schedulePayload.queue_mode === QueueMode.HYBRID && Boolean(appointment.scheduledTime))
    ) {
      const scheduledTime = this.resolveTargetScheduledTime(
        queueWithoutCurrent,
        insertionPosition,
        appointment.scheduledTime
      );

      return this.repository.updateQueueEntry(appointment.id, { scheduledTime });
    }

    const priorityScore = this.resolveTargetPriorityScore(
      queueWithoutCurrent,
      insertionPosition,
      appointment.priorityScore
    );

    return this.repository.updateQueueEntry(appointment.id, { priorityScore });
  }

  private resolveTargetPriorityScore(
    queueWithoutCurrent: QueueEntry[],
    insertionPosition: number,
    currentScore?: number
  ): number {
    if (queueWithoutCurrent.length === 0) {
      return Math.round(currentScore ?? DEFAULT_PRIORITY_SCORE);
    }

    if (insertionPosition <= 1) {
      return Math.round(getScoreForEntry(queueWithoutCurrent[0]) + PRIORITY_STEP);
    }

    if (insertionPosition > queueWithoutCurrent.length) {
      return Math.round(getScoreForEntry(queueWithoutCurrent[queueWithoutCurrent.length - 1]) - PRIORITY_STEP);
    }

    const previousEntry = queueWithoutCurrent[insertionPosition - 2];
    const nextEntry = queueWithoutCurrent[insertionPosition - 1];
    const previousScore = getScoreForEntry(previousEntry);
    const nextScore = getScoreForEntry(nextEntry);

    if (previousScore === nextScore) {
      return Math.round(previousScore + 1);
    }

    if (previousScore > nextScore) {
      const midpoint = previousScore - ((previousScore - nextScore) / 2);
      if (midpoint >= previousScore || midpoint <= nextScore) {
        return Math.round(nextScore + 1);
      }
      return Math.round(midpoint);
    }

    return Math.round(previousScore + 1);
  }

  private resolveTargetScheduledTime(
    queueWithoutCurrent: QueueEntry[],
    insertionPosition: number,
    currentScheduledTime?: string
  ): string {
    if (queueWithoutCurrent.length === 0) {
      return currentScheduledTime ?? FALLBACK_SLOT_TIME;
    }

    if (insertionPosition <= 1) {
      const nextSeconds = parseTimeToSeconds(queueWithoutCurrent[0].scheduledTime);
      if (nextSeconds === null) {
        return currentScheduledTime ?? FALLBACK_SLOT_TIME;
      }
      return formatSecondsToTime(clamp(nextSeconds - 60, 0, MAX_SECONDS_IN_DAY));
    }

    if (insertionPosition > queueWithoutCurrent.length) {
      const previousSeconds = parseTimeToSeconds(queueWithoutCurrent[queueWithoutCurrent.length - 1].scheduledTime);
      if (previousSeconds === null) {
        return currentScheduledTime ?? FALLBACK_SLOT_TIME;
      }
      return formatSecondsToTime(clamp(previousSeconds + 60, 0, MAX_SECONDS_IN_DAY));
    }

    const previousSeconds = parseTimeToSeconds(queueWithoutCurrent[insertionPosition - 2]?.scheduledTime);
    const nextSeconds = parseTimeToSeconds(queueWithoutCurrent[insertionPosition - 1]?.scheduledTime);

    if (previousSeconds !== null && nextSeconds !== null) {
      if (nextSeconds - previousSeconds >= 2) {
        return formatSecondsToTime(Math.floor((previousSeconds + nextSeconds) / 2));
      }

      return formatSecondsToTime(clamp(previousSeconds + 1, 0, MAX_SECONDS_IN_DAY));
    }

    if (previousSeconds !== null) {
      return formatSecondsToTime(clamp(previousSeconds + 60, 0, MAX_SECONDS_IN_DAY));
    }

    if (nextSeconds !== null) {
      return formatSecondsToTime(clamp(nextSeconds - 60, 0, MAX_SECONDS_IN_DAY));
    }

    return currentScheduledTime ?? FALLBACK_SLOT_TIME;
  }
}


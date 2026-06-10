/**
 * Queue Strategy Pattern
 * Defines how the "Next Patient" is selected based on the Clinic's Operating Mode.
 * 
 * Key Understanding:
 * - Slotted: Time-based mode (fixed appointment times, no shifting)
 *   - Allows early calls if patient is present (frees up their slot for walk-ins/waitlist)
 *   - Gap filling: Freed slots can be used for walk-ins/waitlist
 *   - NO shifting: Scheduled times remain fixed
 * - Fluid: Priority-based mode (completely different paradigm)
 *   - Dynamic reordering based on priority score
 *   - Aggressive shifting: Everyone moves up when disruptions occur
 * - Hybrid: Mixed mode (slotted lane + overflow lane)
 *   - Scheduled patients keep their time ordering
 *   - Overflow/walk-ins without a scheduled time are served from a secondary lane
 *   - If earliest scheduled patient is not due yet, overflow patients can be called
 * 
 * Gap Filling Priority (when slot becomes available in Slotted mode):
 * 1. Waitlist patient (if enabled) - They're READY and EXPECTING a call
 * 2. First scheduled patient who IS present (check sequentially)
 * 3. Walk-in (if available)
 */

import { QueueEntry, QueueMode, AppointmentStatus, WaitlistStatus } from '../models/QueueModels';

export interface IQueueStrategy {
  /**
   * Determines the next patient to be called.
   * @param schedule The full schedule for the day (waiting patients).
   * @param context Contextual information (current time, active staff).
   * @param waitlist Optional waitlist entries (if available)
   */
  getNextPatient(
    schedule: QueueEntry[], 
    context: QueueContext,
    waitlist?: WaitlistEntry[]
  ): Promise<NextPatientResult | null>;

  /**
   * Determines how a late arrival should be handled.
   * @param appointment The appointment that arrived late.
   * @param schedule The current schedule.
   */
  handleLateArrival(appointment: QueueEntry, schedule: QueueEntry[]): Promise<QueueAction>;
}

export interface QueueContext {
  currentTime: Date;
  clinicId: string;
  staffId?: string;
  allowWaitlist?: boolean; // Whether clinic allows waitlist
}

export interface QueueAction {
  action: 'insert' | 'waitlist' | 'reject' | 'nothing';
  targetPosition?: number;
  reason?: string;
}

export interface WaitlistEntry {
  id: string;
  clinicId: string;
  patientId?: string;
  requestedDate: Date;
  priorityScore: number;
  status: WaitlistStatus;
  createdAt: Date;
}

export interface NextPatientResult {
  patient: QueueEntry | WaitlistEntry;
  type: 'scheduled' | 'waitlist';
  reason: string;
  canCallEarly?: boolean; // For scheduled patients: can be called early
  requiresNotification?: boolean; // Whether to notify patient (for early calls)
}

/**
 * Slotted Strategy: Time is King (Time-Based Mode)
 * - Next patient is the earliest scheduled time with a present patient
 * - Allows early calls if patient is present (frees up their slot for walk-ins/waitlist)
 * - NO shifting: Scheduled times remain fixed
 * - Gap filling: Freed slots can be used for walk-ins/waitlist
 */
export class SlottedQueueStrategy implements IQueueStrategy {
  async getNextPatient(
    schedule: QueueEntry[], 
    context: QueueContext,
    waitlist?: WaitlistEntry[]
  ): Promise<NextPatientResult | null> {
    const now = context.currentTime;
    
    // PRIORITY 1: Check waitlist first (if enabled and has patients)
    // Waitlist patients are READY and EXPECTING a call - maximizes throughput
    if (context.allowWaitlist && waitlist && waitlist.length > 0) {
      const topWaitlist = waitlist[0]; // Highest priority
      
      // Check if there's an available slot (from no-show/cancellation)
      const availableSlot = this.findAvailableSlot(schedule, now);
      if (availableSlot) {
        return {
          patient: topWaitlist,
          type: 'waitlist',
          reason: 'Waitlist patient ready - maximizes throughput',
          requiresNotification: true // Immediate notification
        };
      }
    }
    
    // PRIORITY 2: Find first scheduled patient who IS present
    // Check sequentially: 11:00 → 11:15 → 11:30 → etc.
    const scheduledPatients = schedule
      .filter(p => p.status === AppointmentStatus.WAITING && !p.skipReason)
      .sort((a, b) => {
        const timeA = this.getScheduledTimestamp(a);
        const timeB = this.getScheduledTimestamp(b);
        return timeA - timeB;
      });
    
    for (const patient of scheduledPatients) {
      if (patient.isPresent) {
        // Found first present scheduled patient
        // They can be called early, freeing their slot
        return {
          patient: patient,
          type: 'scheduled',
          reason: 'First scheduled patient who is present',
          canCallEarly: true,
          requiresNotification: true // Notify them they can come early (optional)
        };
      }
    }
    
    // PRIORITY 3: No one is present
    // Return null (wait for scheduled time)
    return null;
  }

  /**
   * Find available slot (from no-show/cancellation)
   */
  private findAvailableSlot(schedule: QueueEntry[], currentTime: Date): QueueEntry | null {
    // Find slots that are in the past or current time but have no present patient
    const now = currentTime.getTime();
    
    for (const appointment of schedule) {
      if (appointment.status === AppointmentStatus.WAITING && !appointment.isPresent) {
        const slotTime = this.getScheduledTimestamp(appointment);
        // Slot is available if it's at or before current time and patient is not present
        if (slotTime <= now) {
          return appointment;
        }
      }
    }
    
    return null;
  }

      private getScheduledTimestamp(entry: QueueEntry): number {
        if (!entry.scheduledTime) return Infinity;

        const dateStr = entry.appointmentDate.toISOString().split('T')[0];
        const normalizedTime = entry.scheduledTime.length === 5
          ? `${entry.scheduledTime}:00`
          : entry.scheduledTime;

        const parsed = new Date(`${dateStr}T${normalizedTime}`);
        return Number.isNaN(parsed.getTime()) ? Infinity : parsed.getTime();
      }

  async handleLateArrival(appointment: QueueEntry, schedule: QueueEntry[]): Promise<QueueAction> {
    // Slotted mode keeps time ordering. If original slot is still open, return there.
    const activeStatuses = new Set([
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.WAITING,
      AppointmentStatus.IN_PROGRESS,
    ]);

    const originalSlotTaken = schedule.some(entry =>
      entry.id !== appointment.id &&
      activeStatuses.has(entry.status) &&
      entry.scheduledTime === appointment.scheduledTime
    );

    if (!originalSlotTaken && appointment.queuePosition > 0) {
      return {
        action: 'insert',
        targetPosition: appointment.queuePosition,
        reason: 'Original scheduled slot is still available',
      };
    }

    const maxPosition = schedule.reduce((max, entry) => Math.max(max, entry.queuePosition || 0), 0);

    return {
      action: 'insert',
      targetPosition: maxPosition + 1,
      reason: 'Original slot unavailable; reinsert at end of current queue',
    };
  }
}

/**
 * Fluid Strategy: Flow is King.
 * - Next patient is the one with the highest Priority Score who is present.
 * - Uses "Weighted Wait Time" logic (e.g., Wait Time * Priority).
 * - Aggressive shifting: Everyone moves up when disruptions occur.
 */
export class FluidQueueStrategy implements IQueueStrategy {
  async getNextPatient(
    schedule: QueueEntry[], 
    context: QueueContext,
    waitlist?: WaitlistEntry[]
  ): Promise<NextPatientResult | null> {
    const candidates = schedule.filter(
      (p) => p.status === AppointmentStatus.WAITING && p.isPresent && !p.skipReason
    );

    if (candidates.length === 0) return null;

    // Sort by Priority Score (descending), then Arrival/Check-in Time (ascending)
    const nextPatient = candidates.sort((a, b) => {
      // Higher priority score comes first
      const scoreA = a.priorityScore || 0;
      const scoreB = b.priorityScore || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;

      // Then use queue position (FIFO for same priority)
      return a.queuePosition - b.queuePosition;
    })[0];

    return {
      patient: nextPatient,
      type: 'scheduled',
      reason: 'Highest priority patient who is present',
    };
  }

  async handleLateArrival(appointment: QueueEntry, schedule: QueueEntry[]): Promise<QueueAction> {
    // Fluid mode applies a penalty by sending late arrivals to end-of-queue.
    const maxPosition = schedule.reduce((max, entry) => Math.max(max, entry.queuePosition || 0), 0);

    return {
      action: 'insert',
      targetPosition: maxPosition + 1,
      reason: 'Late arrival penalty applied in fluid mode (end-of-queue reinsertion)',
    };
  }
}

/**
 * Hybrid Strategy: Scheduled lane + Overflow lane.
 * - Prefer due scheduled patients.
 * - If the next scheduled patient is in the future, allow overflow lane throughput.
 */
export class HybridQueueStrategy implements IQueueStrategy {
  private readonly slottedStrategy = new SlottedQueueStrategy();
  private readonly fluidStrategy = new FluidQueueStrategy();

  async getNextPatient(
    schedule: QueueEntry[],
    context: QueueContext,
    waitlist?: WaitlistEntry[]
  ): Promise<NextPatientResult | null> {
    const waitingCandidates = schedule.filter(
      (entry) =>
        entry.status === AppointmentStatus.WAITING &&
        entry.isPresent &&
        !entry.skipReason
    );

    const scheduledLane = waitingCandidates
      .filter((entry) => Boolean(entry.scheduledTime))
      .sort((a, b) => {
        const timeA = this.getScheduledTimestamp(a);
        const timeB = this.getScheduledTimestamp(b);
        if (timeA !== timeB) {
          return timeA - timeB;
        }

        return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
      });

    const overflowLane = waitingCandidates
      .filter((entry) => !entry.scheduledTime)
      .sort((a, b) => {
        const scoreA = a.priorityScore || 0;
        const scoreB = b.priorityScore || 0;

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
      });

    const nextScheduled = scheduledLane[0] ?? null;
    const nextOverflow = overflowLane[0] ?? null;

    if (nextScheduled) {
      const scheduledTimestamp = this.getScheduledTimestamp(nextScheduled);
      const isDue = scheduledTimestamp <= context.currentTime.getTime();

      if (isDue || !nextOverflow) {
        return {
          patient: nextScheduled,
          type: 'scheduled',
          reason: isDue
            ? 'Next due scheduled patient in hybrid lane'
            : 'No overflow candidate; calling earliest scheduled patient early',
          canCallEarly: !isDue,
          requiresNotification: !isDue,
        };
      }
    }

    if (nextOverflow) {
      return {
        patient: nextOverflow,
        type: 'scheduled',
        reason: 'Overflow lane patient selected in hybrid mode',
      };
    }

    if (context.allowWaitlist && waitlist && waitlist.length > 0) {
      return {
        patient: waitlist[0],
        type: 'waitlist',
        reason: 'No present scheduled or overflow patient; using waitlist fallback',
        requiresNotification: true,
      };
    }

    return null;
  }

  async handleLateArrival(appointment: QueueEntry, schedule: QueueEntry[]): Promise<QueueAction> {
    if (appointment.scheduledTime) {
      return this.slottedStrategy.handleLateArrival(appointment, schedule);
    }

    return this.fluidStrategy.handleLateArrival(appointment, schedule);
  }

  private getScheduledTimestamp(entry: QueueEntry): number {
    if (!entry.scheduledTime) return Infinity;

    const dateStr = entry.appointmentDate.toISOString().split('T')[0];
    const normalizedTime = entry.scheduledTime.length === 5
      ? `${entry.scheduledTime}:00`
      : entry.scheduledTime;

    const parsed = new Date(`${dateStr}T${normalizedTime}`);
    return Number.isNaN(parsed.getTime()) ? Infinity : parsed.getTime();
  }
}

/**
 * Factory to get the correct strategy
 */
export class QueueStrategyFactory {
  static getStrategy(mode: QueueMode): IQueueStrategy {
    switch (mode) {
      case QueueMode.SLOTTED:
        return new SlottedQueueStrategy();
      case QueueMode.FLUID:
        return new FluidQueueStrategy();
      case QueueMode.HYBRID:
        return new HybridQueueStrategy();
      default:
        throw new Error(`Unsupported queue mode: ${mode}`);
    }
  }
}

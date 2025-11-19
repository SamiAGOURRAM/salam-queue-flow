/**
 * Queue Strategy Pattern
 * Defines how the "Next Patient" is selected based on the Clinic's Operating Mode.
 * 
 * Key Understanding:
 * - Fixed & Hybrid: Both are "slotted" modes (time-based, no shifting)
 * - Fixed: Basic early call + gap fill
 * - Hybrid: Enhanced with cascade notifications + auto waitlist promotion
 * - Fluid: Completely different (priority-based, aggressive shifting)
 * 
 * Gap Filling Priority (when slot becomes available):
 * 1. Waitlist patient (if enabled) - They're READY and EXPECTING a call
 * 2. First scheduled patient who IS present (check sequentially)
 * 3. Walk-in (if available)
 */

import { QueueEntry, QueueMode } from '../models/QueueModels';

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
  staffId: string;
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
  guestPatientId?: string;
  requestedDate: Date;
  priorityScore: number;
  status: 'waiting' | 'notified' | 'promoted' | 'expired' | 'cancelled';
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
 * Fixed Strategy: Time is King (Basic Slotted Mode)
 * - Next patient is the earliest scheduled time with a present patient
 * - Allows early calls if patient is present (frees up their slot for walk-ins/waitlist)
 * - NO shifting: Scheduled times remain fixed
 * - Gap filling: Freed slots can be used for walk-ins/waitlist
 */
export class FixedQueueStrategy implements IQueueStrategy {
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
          patient: topWaitlist as any, // Will be converted to appointment
          type: 'waitlist',
          reason: 'Waitlist patient ready - maximizes throughput',
          requiresNotification: true // Immediate notification
        };
      }
    }
    
    // PRIORITY 2: Find first scheduled patient who IS present
    // Check sequentially: 11:00 → 11:15 → 11:30 → etc.
    const scheduledPatients = schedule
      .filter(p => p.status === 'waiting' && !p.skipReason)
      .sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
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
      if (appointment.status === 'waiting' && !appointment.isPresent) {
        const slotTime = appointment.startTime ? new Date(appointment.startTime).getTime() : Infinity;
        // Slot is available if it's at or before current time and patient is not present
        if (slotTime <= now) {
          return appointment;
        }
      }
    }
    
    return null;
  }

  async handleLateArrival(appointment: QueueEntry, schedule: QueueEntry[]): Promise<QueueAction> {
    // Fixed Mode: Late arrivals can use original slot if available
    // Otherwise, wait for next available slot or add to waitlist with priority
    return {
      action: 'insert',
      reason: 'Late arrival in Fixed Mode - check for available slot or waitlist',
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
      (p) => p.status === 'waiting' && p.isPresent && !p.skipReason
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
    // Fluid Mode: Late arrivals are just inserted back into the flow, 
    // but with a penalty (lower priority score).
    return {
      action: 'insert',
      targetPosition: -1, // Append to current priority group
      reason: 'Late arrival in Fluid Mode - downgraded priority',
    };
  }
}

/**
 * Hybrid Strategy: Intelligent Fixed (Enhanced Slotted Mode)
 * - Same base logic as Fixed (time-based, no shifting)
 * - Enhanced features:
 *   - Cascade notifications to multiple future patients (they can come early)
 *   - Automatic waitlist promotion when no scheduled patients want to come early
 *   - Batch processing of multiple no-shows
 *   - Smarter late arrival handling with better slot reassignment
 */
export class HybridQueueStrategy implements IQueueStrategy {
  async getNextPatient(
    schedule: QueueEntry[], 
    context: QueueContext,
    waitlist?: WaitlistEntry[]
  ): Promise<NextPatientResult | null> {
    const now = context.currentTime;
    
    // PRIORITY 1: Check waitlist FIRST (more aggressive than Fixed)
    if (context.allowWaitlist && waitlist && waitlist.length > 0) {
      const topWaitlist = waitlist[0];
      const availableSlot = this.findAvailableSlot(schedule, now);
      if (availableSlot) {
        // Auto-promote waitlist (more aggressive than Fixed)
        return {
          patient: topWaitlist as any,
          type: 'waitlist',
          reason: 'Hybrid: Auto-promote waitlist for throughput',
          requiresNotification: true
        };
      }
    }
    
    // PRIORITY 2: Find first scheduled patient who IS present (same as Fixed)
    const scheduledPatients = schedule
      .filter(p => p.status === 'waiting' && !p.skipReason)
      .sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
        return timeA - timeB;
      });
    
    for (const patient of scheduledPatients) {
      if (patient.isPresent) {
        return {
          patient: patient,
          type: 'scheduled',
          reason: 'First scheduled patient who is present',
          canCallEarly: true,
          requiresNotification: true
        };
      }
    }
    
    // TODO: Enhanced features (to be implemented):
    // - Cascade notifications to multiple future patients
    // - Automatic waitlist promotion check
    // - Batch no-show processing

    return null;
  }

  /**
   * Find available slot (from no-show/cancellation)
   */
  private findAvailableSlot(schedule: QueueEntry[], currentTime: Date): QueueEntry | null {
    const now = currentTime.getTime();
    
    for (const appointment of schedule) {
      if (appointment.status === 'waiting' && !appointment.isPresent) {
        const slotTime = appointment.startTime ? new Date(appointment.startTime).getTime() : Infinity;
        if (slotTime <= now) {
          return appointment;
        }
      }
    }
    
    return null;
  }

  async handleLateArrival(appointment: QueueEntry, schedule: QueueEntry[]): Promise<QueueAction> {
    // Hybrid Mode: Enhanced late arrival handling
    // - Try original slot first
    // - Then next available slot
    // - Then waitlist with HIGH priority (they had original slot)
    return {
      action: 'insert',
      reason: 'Late arrival in Hybrid Mode - smart slot reassignment or waitlist with priority',
    };
  }
}

/**
 * Factory to get the correct strategy
 */
export class QueueStrategyFactory {
  static getStrategy(mode: QueueMode): IQueueStrategy {
    switch (mode) {
      case 'fixed':
        return new FixedQueueStrategy();
      case 'fluid':
        return new FluidQueueStrategy();
      case 'hybrid':
        return new HybridQueueStrategy();
      default:
        // Default to Fluid for backward compatibility
        return new FluidQueueStrategy();
    }
  }
}

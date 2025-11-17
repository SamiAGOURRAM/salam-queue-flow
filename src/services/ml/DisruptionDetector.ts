/**
 * Disruption Detector
 * 
 * Determines if an appointment has disruptions that require estimation.
 * Used by display logic to decide whether to show scheduled time or estimated time.
 */

import { QueueRepository } from '../queue/repositories/QueueRepository';
import { logger } from '../shared/logging/Logger';
import { supabase } from '@/integrations/supabase/client';
import type { QueueEntry } from '../queue/models/QueueModels';
import { AppointmentStatus } from '../queue/models/QueueModels';

export interface DisruptionInfo {
  hasDisruption: boolean;
  disruptionReasons: string[];
  shouldShowEstimation: boolean;
}

export class DisruptionDetector {
  private repository: QueueRepository;
  private readonly LATE_ARRIVAL_THRESHOLD_MINUTES = 5;
  private readonly DURATION_THRESHOLD_MINUTES = 10;

  constructor(repository?: QueueRepository) {
    this.repository = repository || new QueueRepository();
  }

  /**
   * Check if appointment has disruptions
   * This is used by display logic to decide what to show
   */
  async checkDisruption(appointmentId: string): Promise<DisruptionInfo> {
    try {
      const appointment = await this.repository.getQueueEntryById(appointmentId);
      if (!appointment) {
        return {
          hasDisruption: false,
          disruptionReasons: [],
          shouldShowEstimation: false,
        };
      }

      const reasons: string[] = [];

      // Check various disruption indicators
      if (this.isLateArrival(appointment)) {
        reasons.push('Patient arrived late');
      }

      if (appointment.markedAbsentAt && !appointment.returnedAt) {
        reasons.push('Patient was marked absent');
      }

      if (appointment.returnedAt) {
        reasons.push('Patient returned after being absent');
      }

      if (this.hasUnusualDuration(appointment)) {
        const duration = this.getDurationDifference(appointment);
        if (duration > 0) {
          reasons.push(`Previous appointments taking ${Math.round(duration)} min longer than expected`);
        } else {
          reasons.push(`Previous appointments taking ${Math.round(Math.abs(duration))} min less than expected`);
        }
      }

      if (appointment.skipCount > 0) {
        reasons.push('Patient was skipped in queue');
      }

      if (appointment.originalQueuePosition && appointment.originalQueuePosition !== appointment.queuePosition) {
        reasons.push('Queue position was manually changed');
      }

      // Note: We don't check previous patients here for privacy/security reasons.
      // Previous patient disruptions are detected server-side when staff actions occur
      // (e.g., when appointment completes, staff calls next patient, etc.)
      // This information is then propagated via events and stored in the appointment record.

      const hasDisruption = reasons.length > 0;
      const shouldShowEstimation = hasDisruption && appointment.predictedWaitTime !== null;

      return {
        hasDisruption,
        disruptionReasons: reasons,
        shouldShowEstimation,
      };
    } catch (error) {
      logger.error('Error checking disruption', error as Error, { appointmentId });
      return {
        hasDisruption: false,
        disruptionReasons: [],
        shouldShowEstimation: false,
      };
    }
  }

  /**
   * Check if patient arrived late
   */
  private isLateArrival(appointment: QueueEntry): boolean {
    if (!appointment.checkedInAt || !appointment.scheduledTime || !appointment.appointmentDate) {
      return false;
    }

    const scheduledDateTime = this.parseScheduledDateTime(appointment.appointmentDate, appointment.scheduledTime);
    const checkedInDateTime = appointment.checkedInAt;
    const latenessMinutes = (checkedInDateTime.getTime() - scheduledDateTime.getTime()) / 60000;

    return latenessMinutes > this.LATE_ARRIVAL_THRESHOLD_MINUTES;
  }

  /**
   * Check if appointment had unusual duration
   */
  private hasUnusualDuration(appointment: QueueEntry): boolean {
    if (!appointment.checkedInAt || !appointment.actualEndTime || !appointment.estimatedDurationMinutes) {
      return false;
    }

    // Service duration = time from check-in (entry) to completion
    const actualDuration = (appointment.actualEndTime.getTime() - appointment.checkedInAt.getTime()) / 60000;
    const difference = Math.abs(actualDuration - appointment.estimatedDurationMinutes);

    return difference > this.DURATION_THRESHOLD_MINUTES;
  }

  /**
   * Get duration difference (positive = longer, negative = shorter)
   */
  private getDurationDifference(appointment: QueueEntry): number {
    if (!appointment.checkedInAt || !appointment.actualEndTime || !appointment.estimatedDurationMinutes) {
      return 0;
    }

    // Service duration = time from check-in (entry) to completion
    const actualDuration = (appointment.actualEndTime.getTime() - appointment.checkedInAt.getTime()) / 60000;
    return actualDuration - appointment.estimatedDurationMinutes;
  }

  // Removed checkPreviousPatientsDisruption - this should be done server-side
  // when staff actions occur, not from patient's perspective for privacy/security

  /**
   * Parse scheduled date and time
   */
  private parseScheduledDateTime(appointmentDate: Date, scheduledTime: string): Date {
    const dateStr = appointmentDate.toISOString().split('T')[0];
    return new Date(`${dateStr}T${scheduledTime}`);
  }
}


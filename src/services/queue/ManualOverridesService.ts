import { QueueRepository } from './repositories/QueueRepository';
import { QueueActionType, AppointmentStatus, QueueEntry } from './models/QueueModels';
import { logger } from '../shared/logging/Logger';

export class ManualOverridesService {
  constructor(private repository: QueueRepository) {}

  /**
   * Swaps two patients in the queue
   * In Fluid mode, swaps their priority scores.
   * In Fixed mode, swaps their start times (if possible) or just logs the intent (as fixed mode is strict).
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
        startTime: appt1.startTime,
      };
      const state2 = {
        queuePosition: appt2.queuePosition,
        priorityScore: appt2.priorityScore,
        startTime: appt2.startTime,
      };

      // Perform Swap
      // We swap Priority Scores (for Fluid) and Start Times (for Fixed)
      // to ensure they swap places regardless of mode.
      
      await this.repository.updateQueueEntry(appt1.id, {
        priorityScore: state2.priorityScore,
        startTime: state2.startTime ? state2.startTime.toISOString() : undefined,
        // We don't manually set queuePosition because recalculate trigger will do it
      });

      await this.repository.updateQueueEntry(appt2.id, {
        priorityScore: state1.priorityScore,
        startTime: state1.startTime ? state1.startTime.toISOString() : undefined,
      });

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
    // TODO: Implement complex logic to find neighbors at targetPosition
    // and calculate a priorityScore that fits between them.
    // For now, we'll just log it as not implemented or do a simple boost/drop.
    logger.warn('manualMove is not fully implemented yet');
    throw new Error('Manual move not yet implemented');
  }
}


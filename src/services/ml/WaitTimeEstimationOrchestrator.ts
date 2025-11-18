/**
 * Wait Time Estimation Orchestrator
 * 
 * Event-driven service that ONLY recalculates wait times when disruptions occur.
 * 
 * Philosophy:
 * - Normal flow: Show scheduled time (no estimation needed)
 * - Disruption detected: Calculate and show estimated time
 * 
 * This avoids unnecessary computation and provides clearer UX.
 */

import { eventBus } from '../shared/events/EventBus';
import { logger } from '../shared/logging/Logger';
import { QueueEventType } from '../queue/events/QueueEvents';
import type {
  PatientCheckedInEvent,
  PatientMarkedAbsentEvent,
  PatientReturnedEvent,
  AppointmentStatusChangedEvent,
  QueuePositionChangedEvent,
  PatientAddedToQueueEvent,
  PatientCalledEvent,
} from '../queue/events/QueueEvents';
import { waitTimeEstimationService } from './WaitTimeEstimationService';
import { QueueRepository } from '../queue/repositories/QueueRepository';
import { QueueConfig } from '@/config/QueueConfig';
import {
  QueueEventType,
  QueueEventPayload,
  Disruption,
  DisruptionType,
  EstimationContext,
  AppointmentStatus,
} from '../queue/models/QueueModels';
import { supabase } from '@/integrations/supabase/client';

/**
 * Disruption types that trigger recalculation
 */
export enum DisruptionType {
  LATE_ARRIVAL = 'late_arrival',
  NO_SHOW = 'no_show',
  PATIENT_RETURNED = 'patient_returned',
  LONGER_THAN_EXPECTED = 'longer_than_expected',
  SHORTER_THAN_EXPECTED = 'shorter_than_expected',
  QUEUE_OVERRIDE = 'queue_override',
  EMERGENCY_INSERTED = 'emergency_inserted',
  DOCTOR_LATE = 'doctor_late',
  MULTIPLE_NO_SHOWS = 'multiple_no_shows',
  APPOINTMENT_RUNNING_OVER = 'appointment_running_over',
}

interface Disruption {
  type: DisruptionType;
  appointmentId: string;
  clinicId: string;
  reason: string;
  timestamp: Date;
}

export class WaitTimeEstimationOrchestrator {
  private repository: QueueRepository;
  private disruptionBuffer: Map<string, Disruption[]> = new Map(); // clinicId -> disruptions
  private recalculationDebounce: Map<string, NodeJS.Timeout> = new Map(); // clinicId -> timeout
  private unsubscribeFunctions: (() => void)[] = [];
  private periodicCheckInterval: NodeJS.Timeout | null = null;

  constructor(repository?: QueueRepository) {
    this.repository = repository || new QueueRepository();
  }

  /**
   * Initialize event subscriptions
   * Call this once at app startup
   * Safe to call multiple times - will only initialize once
   */
  initialize(): void {
    if (this.isInitialized) {
      logger.debug('Wait Time Estimation Orchestrator already initialized, skipping');
      return;
    }

    logger.info('Initializing Wait Time Estimation Orchestrator');

    // Staff actions (trigger recalculation for remaining patients)
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_CALLED, this.handlePatientCalled.bind(this))
    );
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.APPOINTMENT_STATUS_CHANGED, this.handleAppointmentStatusChanged.bind(this))
    );
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_MARKED_ABSENT, this.handlePatientMarkedAbsent.bind(this))
    );
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_RETURNED, this.handlePatientReturned.bind(this))
    );
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.QUEUE_POSITION_CHANGED, this.handleQueuePositionChanged.bind(this))
    );

    // Patient actions (only check for late arrival - doesn't affect others)
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_CHECKED_IN, this.handlePatientCheckedIn.bind(this))
    );

    // Queue structure disruptions
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_ADDED_TO_QUEUE, this.handlePatientAdded.bind(this))
    );

    // Start periodic check for running-over appointments
    this.startPeriodicCheck();

    this.isInitialized = true;
    logger.info('Wait Time Estimation Orchestrator initialized');
  }

  /**
   * Cleanup - unsubscribe from all events and stop periodic checks
   */
  cleanup(): void {
    if (!this.isInitialized) return;

    logger.info('Cleaning up Wait Time Estimation Orchestrator');

    // Unsubscribe from all events
    this.unsubscribeFunctions.forEach(unsub => unsub());
    this.unsubscribeFunctions = [];

    // Stop periodic check
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
      this.periodicCheckInterval = null;
    }

    // Clear debounce timers
    this.recalculationDebounce.forEach(timeout => clearTimeout(timeout));
    this.recalculationDebounce.clear();

    this.isInitialized = false;
  }

  /**
   * Schedules a recalculation for a given clinic, debouncing multiple calls.
   * @param clinicId The ID of the clinic for which to recalculate wait times.
   */
  private async scheduleRecalculation(clinicId: string): Promise<void> {
    // Clear any existing debounce timeout for this clinic
    if (this.recalculationDebounce.has(clinicId)) {
      clearTimeout(this.recalculationDebounce.get(clinicId));
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      await this.recalculateForClinic(clinicId);
      this.recalculationDebounce.delete(clinicId);
    }, QueueConfig.SYSTEM.RECALCULATION_DEBOUNCE_MS);

    this.recalculationDebounce.set(clinicId, timeout);
  }

  /**
   * Performs the actual wait time recalculation for a clinic.
   * This method is called by the debounced scheduler.
   * @param clinicId The ID of the clinic.
   */
  private async recalculateForClinic(clinicId: string): Promise<void> {
    logger.info(`Recalculating wait times for clinic ${clinicId}`);
    // Implement the actual recalculation logic here
    // This would involve fetching queue data, applying estimation logic,
    // and updating estimated wait times for patients.
    // For now, it's a placeholder.
    // await waitTimeEstimationService.calculateAndPublishWaitTimes(clinicId, this.disruptionBuffer.get(clinicId) || []);
    this.disruptionBuffer.delete(clinicId); // Clear disruptions after recalculation
  }

  /**
   * Records a disruption event for a clinic.
   * @param clinicId The ID of the clinic where the disruption occurred.
   * @param disruption The disruption event details.
   */
  private recordDisruption(clinicId: string, disruption: Disruption): void {
    if (!this.disruptionBuffer.has(clinicId)) {
      this.disruptionBuffer.set(clinicId, []);
    }
    this.disruptionBuffer.get(clinicId)?.push(disruption);
    logger.debug(`Disruption recorded for clinic ${clinicId}: ${disruption.type}`);
  }

  /**
   * Handle patient called - staff action
   * When staff calls a patient, recalculate wait times for remaining patients
   */
  private async handlePatientCalled(event: PatientCalledEvent): Promise<void> {
    try {
      logger.info('Patient called - recalculating wait times for remaining patients', {
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
      });

      // When a patient is called, the queue state changes
      // Recalculate wait times for all remaining waiting patients
      await this.scheduleRecalculation(event.clinicId);
    } catch (error) {
      logger.error('Error handling patient called', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Handle patient check-in - detect late arrival (patient action)
   * Only affects this patient, doesn't trigger recalculation for others
   */
  private async handlePatientCheckedIn(event: PatientCheckedInEvent): Promise<void> {
    try {
      const appointment = await this.repository.getQueueEntryById(event.appointmentId);
      if (!appointment) return;

      // Check if patient arrived late
      if (appointment.checkedInAt && appointment.scheduledTime && appointment.appointmentDate) {
        const scheduledDateTime = this.parseScheduledDateTime(appointment.appointmentDate, appointment.scheduledTime);
        const checkedInDateTime = appointment.checkedInAt;

        const latenessMinutes = (checkedInDateTime.getTime() - scheduledDateTime.getTime()) / 60000;

        if (latenessMinutes > this.LATE_ARRIVAL_THRESHOLD_MINUTES) {
          logger.info('Late arrival detected', {
            appointmentId: event.appointmentId,
            latenessMinutes,
          });

          this.recordDisruption(event.clinicId, {
            type: DisruptionType.LATE_ARRIVAL,
            appointmentId: event.appointmentId,
            clinicId: event.clinicId,
            reason: `Patient arrived ${Math.round(latenessMinutes)} minutes late`,
            timestamp: new Date(),
          });

          await this.scheduleRecalculation(event.clinicId);
        }
      }
    } catch (error) {
      logger.error('Error handling patient check-in', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Handle patient marked absent - always triggers recalculation
   */
  private async handlePatientMarkedAbsent(event: PatientMarkedAbsentEvent): Promise<void> {
    try {
      logger.info('Patient marked absent - triggering recalculation', {
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
      });

      this.recordDisruption(event.clinicId, {
        type: DisruptionType.NO_SHOW,
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
        reason: 'Patient marked as absent',
        timestamp: new Date(),
      });

      await this.scheduleRecalculation(event.clinicId);
    } catch (error) {
      logger.error('Error handling patient marked absent', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Handle patient returned - always triggers recalculation
   */
  private async handlePatientReturned(event: PatientReturnedEvent): Promise<void> {
    try {
      logger.info('Patient returned - triggering recalculation', {
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
      });

      this.recordDisruption(event.clinicId, {
        type: DisruptionType.PATIENT_RETURNED,
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
        reason: 'Patient returned after being absent',
        timestamp: new Date(),
      });

      await this.scheduleRecalculation(event.clinicId);
    } catch (error) {
      logger.error('Error handling patient returned', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Handle appointment status change - detect unusual duration
   * When an appointment completes, check if it took longer/shorter than expected
   * and recalculate wait times for all remaining patients in the queue
   */
  private async handleAppointmentStatusChanged(event: AppointmentStatusChangedEvent): Promise<void> {
    try {
      const payload = event.payload;

      // Only check when appointment is completed (staff action)
      if (payload.newStatus !== AppointmentStatus.COMPLETED) return;

      const appointment = await this.repository.getQueueEntryById(event.appointmentId);
      if (!appointment) return;

      let shouldRecalculate = false;
      let disruptionReason = '';

      // Check if duration was unusual
      if (appointment.checkedInAt && appointment.actualEndTime && appointment.estimatedDurationMinutes) {
        // Service duration = time from check-in (entry) to completion
        const actualDuration = (appointment.actualEndTime.getTime() - appointment.checkedInAt.getTime()) / 60000;
        const estimatedDuration = appointment.estimatedDurationMinutes;
        const difference = actualDuration - estimatedDuration;

        if (Math.abs(difference) > this.DURATION_THRESHOLD_MINUTES) {
          const disruptionType = difference > 0
            ? DisruptionType.LONGER_THAN_EXPECTED
            : DisruptionType.SHORTER_THAN_EXPECTED;

          logger.info('Unusual appointment duration detected', {
            appointmentId: event.appointmentId,
            actualDuration: Math.round(actualDuration),
            estimatedDuration,
            difference: Math.round(difference),
          });

          disruptionReason = `Appointment took ${Math.round(difference)} minutes ${difference > 0 ? 'longer' : 'less'} than expected`;
          shouldRecalculate = true;

          this.recordDisruption(event.clinicId, {
            type: disruptionType,
            appointmentId: event.appointmentId,
            clinicId: event.clinicId,
            reason: disruptionReason,
            timestamp: new Date(),
          });
        }
      }

      // Always recalculate when appointment completes (even if duration was normal)
      // This ensures remaining patients get updated wait times
      // The completion itself is a queue state change that affects everyone
      logger.info('Appointment completed - recalculating wait times for remaining patients', {
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
        reason: shouldRecalculate ? disruptionReason : 'Normal completion - updating queue',
      });

      await this.scheduleRecalculation(event.clinicId);
    } catch (error) {
      logger.error('Error handling appointment status change', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Handle queue position change - manual override
   */
  private async handleQueuePositionChanged(event: QueuePositionChangedEvent): Promise<void> {
    try {
      logger.info('Queue position changed - triggering recalculation', {
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
      });

      this.recordDisruption(event.clinicId, {
        type: DisruptionType.QUEUE_OVERRIDE,
        appointmentId: event.appointmentId,
        clinicId: event.clinicId,
        reason: 'Queue position manually changed',
        timestamp: new Date(),
      });

      await this.scheduleRecalculation(event.clinicId);
    } catch (error) {
      logger.error('Error handling queue position change', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Handle patient added - check if emergency/walk-in
   */
  private async handlePatientAdded(event: PatientAddedToQueueEvent): Promise<void> {
    try {
      const appointment = await this.repository.getQueueEntryById(event.appointmentId);
      if (!appointment) return;

      // Check if emergency or walk-in (disrupts normal flow)
      const isEmergency = appointment.appointmentType === 'emergency';
      const isWalkIn = (appointment as any).isWalkIn === true;

      if (isEmergency || isWalkIn) {
        logger.info('Emergency/walk-in patient added - triggering recalculation', {
          appointmentId: event.appointmentId,
          clinicId: event.clinicId,
          isEmergency,
          isWalkIn,
        });

        this.recordDisruption(event.clinicId, {
          type: DisruptionType.EMERGENCY_INSERTED,
          appointmentId: event.appointmentId,
          clinicId: event.clinicId,
          reason: isEmergency ? 'Emergency case inserted' : 'Walk-in patient added',
          timestamp: new Date(),
        });

        await this.scheduleRecalculation(event.clinicId);
      }
    } catch (error) {
      logger.error('Error handling patient added', error as Error, { eventId: event.eventId });
    }
  }

  /**
   * Periodic check for appointments running over time
   */
  private startPeriodicCheck(): void {
    // Clear any existing interval
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
    }

    // Check for running over appointments periodically
    this.periodicCheckInterval = setInterval(() => {
      this.checkRunningOverAppointments();
    }, QueueConfig.DEFAULTS.PERIODIC_CHECK_INTERVAL_MINUTES * 60 * 1000);
  }

  /**
   * Check for appointments that are running over their scheduled time
   */
  /**
   * Check for appointments that are running over their scheduled time
   */
  private async checkRunningOverAppointments(): Promise<void> {
    try {
      const now = new Date();
      const inProgressAppointments = await this.repository.getInProgressAppointments(now);

      for (const appointment of inProgressAppointments) {
        if (!appointment.checkedInAt || !appointment.startTime) continue;

        const checkedInDateTime = appointment.checkedInAt;
        const estimatedDuration = appointment.estimatedDurationMinutes || 30;
        // Expected end time = check-in time + estimated duration
        const expectedEndTime = new Date(checkedInDateTime.getTime() + estimatedDuration * 60000);

        // Check if appointment is still in progress (has checked_in_at but no actual_end_time)
        const isStillInProgress = appointment.checkedInAt && !appointment.actualEndTime;

        // If appointment is running over expected end time (and still in progress)
        if (isStillInProgress && now > expectedEndTime) {
          const overTimeMinutes = (now.getTime() - expectedEndTime.getTime()) / 60000;

          // Get clinic config or use default
          // Note: In a real implementation, we should fetch this from the repository cache
          // For now, we'll use the system default as the baseline, but ideally we pass the config in
          const threshold = QueueConfig.DEFAULTS.APPOINTMENT_RUN_OVER_THRESHOLD_MINUTES;

          if (overTimeMinutes > threshold) {
            logger.info('Appointment running over detected', {
              appointmentId: appointment.id,
              clinicId: appointment.clinicId,
              overTimeMinutes: Math.round(overTimeMinutes),
            });

            this.recordDisruption(appointment.clinicId, {
              type: DisruptionType.APPOINTMENT_RUNNING_OVER,
              appointmentId: appointment.id,
              clinicId: appointment.clinicId,
              reason: `Appointment running ${Math.round(overTimeMinutes)} minutes over expected time`,
              timestamp: now,
            });

            await this.scheduleRecalculation(appointment.clinicId);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking running over appointments', error as Error);
    }
  }

  /**
   * Recalculate wait times for all waiting patients in a clinic
   */
  private async recalculateForClinic(clinicId: string): Promise<void> {
    try {
      logger.info('Recalculating wait times for clinic', { clinicId });

      const now = new Date();
      const appointments = await this.repository.getWaitingAppointments(clinicId, now);

      if (appointments.length === 0) {
        logger.debug('No waiting appointments to recalculate', { clinicId });
        return;
      }

      const updates: { id: string;[key: string]: any }[] = [];

      // Recalculate for each appointment
      // We can run these in parallel as they are independent
      await Promise.all(appointments.map(async (appt) => {
        try {
          // Clear cache before recalculating to ensure fresh data
          waitTimeEstimationService.clearCache(appt.id);
          const estimation = await waitTimeEstimationService.estimateWaitTime(appt.id, { bypassCache: true });

          // Update appointment with new estimation
          const estimatedStartTime = new Date(Date.now() + estimation.waitTimeMinutes * 60000);

          updates.push({
            id: appt.id,
            predicted_wait_time: estimation.waitTimeMinutes,
            predicted_start_time: estimatedStartTime.toISOString(),
            prediction_mode: estimation.mode,
            prediction_confidence: estimation.confidence,
            last_prediction_update: new Date().toISOString(),
          });

          logger.debug('Recalculated wait time for appointment', {
            appointmentId: appt.id,
            waitTime: estimation.waitTimeMinutes,
            mode: estimation.mode,
          });
        } catch (error) {
          logger.warn('Failed to recalculate wait time for appointment', {
            appointmentId: appt.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }));

      // Batch update all appointments
      if (updates.length > 0) {
        await this.repository.batchUpdateAppointments(updates);
      }

      logger.info('Completed recalculation for clinic', {
        clinicId,
        appointmentsRecalculated: updates.length,
      });
    } catch (error) {
      logger.error('Error recalculating for clinic', error as Error, { clinicId });
    }
  }

  /**
   * Parse scheduled date and time into Date object
   */
  private parseScheduledDateTime(appointmentDate: Date, scheduledTime: string): Date {
    const dateStr = appointmentDate.toISOString().split('T')[0];
    return new Date(`${dateStr}T${scheduledTime}`);
  }

  /**
   * Get disruptions for a clinic (for debugging/analytics)
   */
  getDisruptions(clinicId: string): Disruption[] {
    return this.disruptionBuffer.get(clinicId) || [];
  }
}

// Export singleton instance
export const waitTimeEstimationOrchestrator = new WaitTimeEstimationOrchestrator();


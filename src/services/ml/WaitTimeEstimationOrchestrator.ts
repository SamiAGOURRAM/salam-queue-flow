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
import { AppointmentStatus } from '../queue/models/QueueModels';
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
  private readonly DEBOUNCE_MS = 2000; // Wait 2 seconds before recalculating (batch disruptions)
  private readonly LATE_ARRIVAL_THRESHOLD_MINUTES = 5;
  private readonly DURATION_THRESHOLD_MINUTES = 10;
  private isInitialized: boolean = false;
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
      if (appointment.actualStartTime && appointment.actualEndTime && appointment.estimatedDurationMinutes) {
        const actualDuration = (appointment.actualEndTime.getTime() - appointment.actualStartTime.getTime()) / 60000;
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

    // Check every 5 minutes
    this.periodicCheckInterval = setInterval(async () => {
      try {
        await this.checkRunningOverAppointments();
      } catch (error) {
        logger.error('Error in periodic check', error as Error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Check for appointments that are running over their scheduled time
   */
  private async checkRunningOverAppointments(): Promise<void> {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Get all in-progress appointments
      const { data: inProgressAppointments, error } = await supabase
        .from('appointments')
        .select('id, clinic_id, start_time, appointment_date, estimated_duration, actual_start_time')
        .eq('appointment_date', today)
        .eq('status', AppointmentStatus.IN_PROGRESS);

      if (error || !inProgressAppointments) return;

      for (const appointment of (inProgressAppointments as unknown) as Array<{
        id: string;
        clinic_id: string;
        start_time: string;
        appointment_date: string;
        estimated_duration: number | null;
        actual_start_time: string | null;
      }>) {
        if (!appointment.actual_start_time || !appointment.start_time) continue;

        // Use start_time (timestamp) instead of scheduled_time
        const scheduledDateTime = new Date(appointment.start_time);
        const startedDateTime = new Date(appointment.actual_start_time);
        const estimatedDuration = appointment.estimated_duration || 30;
        const expectedEndTime = new Date(startedDateTime.getTime() + estimatedDuration * 60000);

        // If appointment is running over expected end time
        if (now > expectedEndTime) {
          const overTimeMinutes = (now.getTime() - expectedEndTime.getTime()) / 60000;
          
          if (overTimeMinutes > this.DURATION_THRESHOLD_MINUTES) {
            logger.info('Appointment running over detected', {
              appointmentId: appointment.id,
              clinicId: appointment.clinic_id,
              overTimeMinutes: Math.round(overTimeMinutes),
            });

            this.recordDisruption(appointment.clinic_id, {
              type: DisruptionType.APPOINTMENT_RUNNING_OVER,
              appointmentId: appointment.id,
              clinicId: appointment.clinic_id,
              reason: `Appointment running ${Math.round(overTimeMinutes)} minutes over expected time`,
              timestamp: now,
            });

            await this.scheduleRecalculation(appointment.clinic_id);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking running over appointments', error as Error);
    }
  }

  /**
   * Record a disruption for a clinic
   */
  private recordDisruption(clinicId: string, disruption: Disruption): void {
    const disruptions = this.disruptionBuffer.get(clinicId) || [];
    disruptions.push(disruption);
    this.disruptionBuffer.set(clinicId, disruptions);

    // Keep only last 10 disruptions per clinic
    if (disruptions.length > 10) {
      disruptions.shift();
    }
  }

  /**
   * Schedule recalculation with debouncing
   * Batches multiple disruptions together
   */
  private async scheduleRecalculation(clinicId: string): Promise<void> {
    // Clear existing timeout
    const existingTimeout = this.recalculationDebounce.get(clinicId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      await this.recalculateForClinic(clinicId);
      this.recalculationDebounce.delete(clinicId);
    }, this.DEBOUNCE_MS);

    this.recalculationDebounce.set(clinicId, timeout);
  }

  /**
   * Recalculate wait times for all waiting patients in a clinic
   */
  private async recalculateForClinic(clinicId: string): Promise<void> {
    try {
      logger.info('Recalculating wait times for clinic', { clinicId });

      const today = new Date().toISOString().split('T')[0];

      // Get all waiting/scheduled appointments for today
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', today)
        .in('status', [AppointmentStatus.WAITING, AppointmentStatus.SCHEDULED])
        .eq('is_present', true);

      if (error || !appointments || appointments.length === 0) {
        logger.debug('No waiting appointments to recalculate', { clinicId });
        return;
      }

      // Recalculate for each appointment
      const recalculationPromises = appointments.map(async (appt) => {
        try {
          // Clear cache before recalculating to ensure fresh data
          waitTimeEstimationService.clearCache(appt.id);
          const estimation = await waitTimeEstimationService.estimateWaitTime(appt.id, { bypassCache: true });
          
          // Update appointment with new estimation
          const estimatedStartTime = new Date(Date.now() + estimation.waitTimeMinutes * 60000);
          
          await supabase
            .from('appointments')
            .update({
              predicted_wait_time: estimation.waitTimeMinutes,
              predicted_start_time: estimatedStartTime.toISOString(),
              prediction_mode: estimation.mode,
              prediction_confidence: estimation.confidence,
              last_prediction_update: new Date().toISOString(),
            })
            .eq('id', appt.id);

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
      });

      await Promise.all(recalculationPromises);

      logger.info('Completed recalculation for clinic', {
        clinicId,
        appointmentsRecalculated: appointments.length,
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


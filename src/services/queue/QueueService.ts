/**
 * Queue Service (Full Refactor for Time-Based, Multi-Mode Scheduling)
 * This is the authoritative entry point for all queue and schedule operations.
 * It preserves all business logic while adapting to the new data model.
 */

import { QueueRepository } from './repositories/QueueRepository';
import { eventBus } from '../shared/events/EventBus';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, BusinessRuleError, ConflictError, DatabaseError } from '../shared/errors';
import {
  QueueEntry,
  QueueFilters,
  QueueSummary,
  CreateQueueEntryDTO,
  UpdateQueueEntryDTO,
  MarkAbsentDTO,
  CallNextPatientDTO,
  ReorderQueueDTO,
  AppointmentStatus,
  QueueActionType,
  SkipReason,
  WaitTimePredictionRecord,
} from './models/QueueModels';
import { QueueEventFactory, QueueEventType } from './events/QueueEvents';

export class QueueService {
  private repository: QueueRepository;

  constructor(repository?: QueueRepository) {
    this.repository = repository || new QueueRepository();
  }

  // ============================================
  // PRIMARY SCHEDULING METHOD (NEW)
  // ============================================

  /**
   * Fetches the daily schedule for a staff member, including operating mode.
   * This is the new primary method for retrieving all schedule-related data.
   */
  async getDailySchedule(staffId: string, targetDate: string): Promise<{ operating_mode: string; schedule: QueueEntry[] }> {
    // Reduced verbosity - only log in debug mode
    logger.debug('Fetching daily schedule for staff', { staffId, targetDate });
    try {
      const scheduleData = await this.repository.getDailySchedule(staffId, targetDate);
      // DON'T apply wait time estimates during loading
      // Estimates should ONLY be calculated when disruptions occur (via WaitTimeEstimationOrchestrator)
      // The schedule already contains predicted_wait_time and predicted_start_time from the database
      // which were calculated during disruption events
      logger.debug(`Retrieved schedule for staff ${staffId} with mode ${scheduleData.operating_mode}`, { count: scheduleData.schedule.length });
      return {
        ...scheduleData,
        schedule: scheduleData.schedule,
      };
    } catch (error) {
      logger.error('Failed to fetch daily schedule', error as Error, { staffId, targetDate });
      throw error;
    }
  }
  
  /**
   * Get a specific queue entry by its ID. This remains essential.
   */
  async getQueueEntry(appointmentId: string): Promise<QueueEntry> {
    logger.debug('Fetching queue entry', { appointmentId });
    const entry = await this.repository.getQueueEntryById(appointmentId);
    if (!entry) {
        throw new NotFoundError(`Appointment with ID ${appointmentId} not found.`);
    }
    return entry;
  }

  /**
   * Get all appointments for a patient
   */
  async getPatientAppointments(patientId: string): Promise<QueueEntry[]> {
    try {
      logger.debug('Fetching patient appointments', { patientId });
      return await this.repository.getPatientAppointments(patientId);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching patient appointments', error as Error, { patientId });
      throw new DatabaseError('Unexpected error fetching patient appointments', error as Error);
    }
  }

  /**
   * Get booked slots for a clinic on a specific date
   * Returns array of appointment IDs and start times for active appointments
   */
  async getClinicBookedSlots(clinicId: string, date: string): Promise<Array<{ id: string; startTime: string }>> {
    try {
      logger.debug('Fetching clinic booked slots', { clinicId, date });
      return await this.repository.getClinicBookedSlots(clinicId, date);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching clinic booked slots', error as Error, { clinicId, date });
      throw new DatabaseError('Unexpected error fetching clinic booked slots', error as Error);
    }
  }

  // ====================================================================
  // THIS IS THE DEFINITIVE FIX
  // ====================================================================
  /**
   * Creates a new appointment using the robust, unified RPC-based workflow.
   */
  async createAppointment(dto: CreateQueueEntryDTO): Promise<QueueEntry> {
    logger.info('Creating new appointment (v2 Unified)', { dto });

    // 1. Basic validation
    if (!dto.startTime || !dto.endTime) {
      throw new ValidationError('Appointments must have a start and end time.');
    }

    // 2. RELAXED validation: Only check for "in the past" if it's NOT a walk-in.
    // This fixes the "Cannot create an appointment in the past" error for walk-ins.
    if (!dto.isWalkIn && (new Date(dto.startTime) < new Date())) {
      throw new ValidationError('Cannot schedule a booked appointment in the past.');
    }

    // 3. THE CRITICAL CHANGE: We now call the new RPC method in the repository.
    // This fixes the "null value in column appointment_date" error.
    const entry = await this.repository.createQueueEntryViaRpc(dto);

    // 4. Publish event and return (no changes here)
    const event = QueueEventFactory.createPatientAddedEvent(entry);
    await eventBus.publish(event);

    logger.info('Appointment created successfully via RPC', { appointmentId: entry.id, position: entry.queuePosition });
    return entry;
  }
  
  /**
   * Checks in a patient, marking them as present and waiting.
   */
  async checkInPatient(appointmentId: string): Promise<QueueEntry> {
    logger.info('Checking in patient', { appointmentId });
    
    const existingEntry = await this.getQueueEntry(appointmentId);

    if (existingEntry.status === AppointmentStatus.COMPLETED || existingEntry.status === AppointmentStatus.CANCELLED) {
      throw new BusinessRuleError('Cannot check in a completed or cancelled appointment.');
    }

    const entry = await this.repository.checkInPatient(appointmentId);
    
    const event = QueueEventFactory.createPatientCheckedInEvent(entry);
    await eventBus.publish(event);

    logger.info('Patient checked in successfully', { appointmentId });
    return entry;
  }

  /**
   * Calls the next patient in the queue. The logic now operates on a fetched schedule.
   */
  async callNextPatient(dto: CallNextPatientDTO): Promise<QueueEntry> {
    logger.info('Calling next patient', { dto });

    const scheduleData = await this.getDailySchedule(dto.staffId, new Date(dto.date).toISOString().split('T')[0]);
    
    const waitingPatients = scheduleData.schedule.filter(e => 
      (e.status === AppointmentStatus.WAITING || e.status === AppointmentStatus.SCHEDULED) && 
      e.skipReason !== SkipReason.PATIENT_ABSENT &&
      e.isPresent
    );

    if (waitingPatients.length === 0) {
      throw new NotFoundError('No patients present and waiting in queue');
    }

    // The schedule is already sorted by the database function (time, then position)
    const nextPatient = waitingPatients[0];

    // Set checked_in_at when staff calls "Call Next" (patient enters consultation room)
    // This replaces actual_start_time for simplicity
    const now = new Date().toISOString();
    const updatedEntry = await this.repository.updateQueueEntry(nextPatient.id, {
      status: AppointmentStatus.IN_PROGRESS,
      checkedInAt: now,
      isPresent: true, // Mark as present when called
    });

    await this.repository.createQueueOverride(dto.clinicId, nextPatient.id, QueueActionType.CALL_PRESENT, dto.performedBy, undefined, nextPatient.queuePosition, nextPatient.queuePosition);
    
    const event = QueueEventFactory.createPatientCalledEvent(updatedEntry, dto.performedBy);
    await eventBus.publish(event);

    logger.info('Next patient called successfully', { appointmentId: updatedEntry.id, position: updatedEntry.queuePosition });
    return updatedEntry;
  }

  /**
   * Marks a patient as absent. Logic is preserved.
   */
  async markPatientAbsent(dto: MarkAbsentDTO): Promise<QueueEntry> {
    logger.info('Marking patient absent', { dto });

    const entry = await this.getQueueEntry(dto.appointmentId);

    if (entry.status === AppointmentStatus.COMPLETED) throw new BusinessRuleError('Cannot mark completed appointment as absent');
    if (entry.markedAbsentAt && !entry.returnedAt) throw new ConflictError('Patient is already marked as absent');

    const updatedEntry = await this.repository.updateQueueEntry(entry.id, {
      isPresent: false,
      skipReason: SkipReason.PATIENT_ABSENT,
      markedAbsentAt: new Date().toISOString(),
    });

    await this.repository.createAbsentPatient(entry.id, entry.clinicId, entry.patientId, dto.performedBy, dto.reason, entry.isGuest, entry.guestPatientId);
    await this.repository.createQueueOverride(entry.clinicId, entry.id, QueueActionType.MARK_ABSENT, dto.performedBy, dto.reason, entry.queuePosition, undefined);

    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setMinutes(gracePeriodEndsAt.getMinutes() + (dto.gracePeriodMinutes || 15));
    const event = QueueEventFactory.createPatientMarkedAbsentEvent(updatedEntry, dto.performedBy, gracePeriodEndsAt);
    await eventBus.publish(event);

    return updatedEntry;
  }

  /**
   * Marks an absent patient as returned. Logic is preserved and adapted.
   */
  async markPatientReturned(appointmentId: string, performedBy: string): Promise<QueueEntry> {
    logger.info('Marking patient as returned', { appointmentId });

    const entry = await this.getQueueEntry(appointmentId);

    if (!entry.markedAbsentAt || entry.returnedAt) {
      throw new BusinessRuleError('Patient was not marked as absent or has already returned.');
    }

    const newPosition = await this.repository.getNextQueuePosition(entry.clinicId, new Date(entry.startTime!));

    const updatedEntry = await this.repository.updateQueueEntry(entry.id, {
      queuePosition: newPosition,
      isPresent: true,
      status: AppointmentStatus.WAITING,
      skipReason: null, // Clear the skip reason
      returnedAt: new Date().toISOString(),
    });

    await this.repository.markPatientReturned(appointmentId, newPosition);
    await this.repository.createQueueOverride(entry.clinicId, entry.id, QueueActionType.LATE_ARRIVAL, performedBy, 'Patient returned after being marked absent', entry.queuePosition, newPosition);

    const event = QueueEventFactory.createPatientReturnedEvent(updatedEntry, newPosition);
    await eventBus.publish(event);

    return updatedEntry;
  }

  /**
   * Completes an appointment. Logic is preserved.
   * Now also calculates and stores actual wait time for ML training.
   */
  async completeAppointment(appointmentId: string, performedBy: string): Promise<QueueEntry> {
    logger.info('Completing appointment', { appointmentId });

    const entry = await this.getQueueEntry(appointmentId);
    if (entry.status === AppointmentStatus.COMPLETED) throw new ConflictError('Appointment is already completed');

    const previousStatus = entry.status;
    const now = new Date();
    
    // Calculate actual wait time (LABEL for ML training)
    // Wait time = time from scheduled start to check-in (when patient entered)
    // Since checked_in_at is set when staff calls "Call Next", it represents entry time
    let actualWaitTime: number | null = null;
    
    logger.debug('Calculating wait time', {
      appointmentId,
      hasCheckedInAt: !!entry.checkedInAt,
      hasScheduledTime: !!entry.startTime,
      checkedInAt: entry.checkedInAt?.toISOString(),
      startTime: entry.startTime?.toISOString(),
    });

    if (entry.checkedInAt && entry.startTime) {
      // Wait time = time from scheduled start to actual entry (check-in)
      const waitTimeMs = entry.checkedInAt.getTime() - entry.startTime.getTime();
      actualWaitTime = Math.max(0, Math.round(waitTimeMs / 60000)); // Ensure non-negative
      logger.info('Calculated wait time from scheduled start to check-in', { 
        appointmentId, 
        actualWaitTime,
        waitTimeMs,
        startTime: entry.startTime.toISOString(),
        checkedInAt: entry.checkedInAt.toISOString()
      });
    } else if (entry.checkedInAt && entry.scheduledTime && entry.appointmentDate) {
      // Fallback: scheduled time to check-in (for backward compatibility)
      const dateStr = entry.appointmentDate.toISOString().split('T')[0];
      const scheduledDateTime = new Date(`${dateStr}T${entry.scheduledTime}`);
      const waitTimeMs = entry.checkedInAt.getTime() - scheduledDateTime.getTime();
      actualWaitTime = Math.max(0, Math.round(waitTimeMs / 60000)); // Ensure non-negative
      logger.info('Calculated wait time from scheduled time to check-in (fallback)', { 
        appointmentId, 
        actualWaitTime,
        waitTimeMs,
        scheduledDateTime: scheduledDateTime.toISOString(),
        checkedInAt: entry.checkedInAt.toISOString()
      });
    } else {
      logger.warn('Cannot calculate wait time - missing timing data', { 
        appointmentId,
        hasCheckedInAt: !!entry.checkedInAt,
        hasStartTime: !!entry.startTime,
        hasScheduledTime: !!entry.scheduledTime,
        checkedInAt: entry.checkedInAt?.toISOString(),
      });
    }

    // Calculate actual service duration
    // Service duration = time from check-in (entry) to completion
    let actualServiceDuration: number | null = null;
    if (entry.checkedInAt) {
      const durationMs = now.getTime() - entry.checkedInAt.getTime();
      actualServiceDuration = Math.max(0, Math.round(durationMs / 60000)); // Ensure non-negative
      logger.debug('Calculated service duration from check-in to completion', {
        appointmentId,
        actualServiceDuration,
        durationMs,
        checkedInAt: entry.checkedInAt.toISOString(),
        now: now.toISOString(),
      });
    } else {
      logger.warn('Cannot calculate service duration - missing checkedInAt', { appointmentId });
    }

    const updatedEntry = await this.repository.updateQueueEntry(appointmentId, {
      status: AppointmentStatus.COMPLETED,
      actualEndTime: now.toISOString(),
      actualDuration: actualServiceDuration,
    });

    // Store actual wait time for ML training (non-blocking - don't fail if this fails)
    if (actualWaitTime !== null) {
      logger.info('Storing actual wait time for ML training', {
        appointmentId,
        actualWaitTime,
        actualServiceDuration: actualServiceDuration ?? null,
      });
      try {
        await this.repository.recordActualWaitTime(appointmentId, {
          actualWaitTime,
          actualServiceDuration: actualServiceDuration ?? undefined,
        });
        logger.info('Successfully stored actual wait time', { appointmentId, actualWaitTime });
      } catch (error) {
        // Log but don't fail the completion
        logger.error('Failed to record actual wait time, but appointment completed', error as Error, { 
          appointmentId,
          actualWaitTime,
          actualServiceDuration,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      logger.warn('Skipping wait time storage - actualWaitTime is null', { appointmentId });
    }

    const event = QueueEventFactory.createAppointmentStatusChangedEvent(updatedEntry, previousStatus, performedBy);
    await eventBus.publish(event);

    return updatedEntry;
  }

  /**
   * Reorders the queue. Logic is preserved.
   */
  async reorderQueue(dto: ReorderQueueDTO): Promise<QueueEntry> {
    logger.info('Reordering queue', { dto });

    const entry = await this.getQueueEntry(dto.appointmentId);
    if (dto.newPosition < 1) throw new ValidationError('Queue position must be greater than 0');
    if (dto.newPosition === entry.queuePosition) return entry; // No change needed

    const previousPosition = entry.queuePosition;
    const updatedEntry = await this.repository.updateQueueEntry(entry.id, {
      queuePosition: dto.newPosition,
    });

    await this.repository.createQueueOverride(entry.clinicId, entry.id, QueueActionType.REORDER, dto.performedBy, dto.reason, previousPosition, dto.newPosition);

    const event = QueueEventFactory.createQueuePositionChangedEvent(updatedEntry, previousPosition, dto.performedBy, dto.reason);
    await eventBus.publish(event);

    return updatedEntry;
  }

  /**
   * Cancels an appointment
   * @param appointmentId - The appointment ID to cancel
   * @param cancelledBy - User ID who is cancelling (patient or staff)
   * @param reason - Optional cancellation reason
   */
  async cancelAppointment(appointmentId: string, cancelledBy: string, reason?: string): Promise<QueueEntry> {
    logger.info('Cancelling appointment', { appointmentId, cancelledBy, reason });

    const entry = await this.getQueueEntry(appointmentId);

    // Business rules: Can't cancel if already completed or cancelled
    if (entry.status === AppointmentStatus.COMPLETED) {
      throw new BusinessRuleError('Cannot cancel a completed appointment');
    }
    if (entry.status === AppointmentStatus.CANCELLED) {
      throw new BusinessRuleError('Appointment is already cancelled');
    }

    // Use RPC function to cancel (bypasses RLS)
    const updatedEntry = await this.repository.cancelAppointmentViaRpc(appointmentId, cancelledBy, reason);

    // Publish event
    const event = QueueEventFactory.createAppointmentStatusChangedEvent(updatedEntry, entry.status, cancelledBy);
    await eventBus.publish(event);

    logger.info('Appointment cancelled successfully', { appointmentId });
    return updatedEntry;
  }

  // ============================================
  // DEPRECATED & HELPER METHODS
  // ============================================

  /** @DEPRECATED */
  async getQueue(): Promise<QueueEntry[]> {
    logger.warn('QueueService.getQueue is deprecated. Use getDailySchedule.');
    return [];
  }

  /** @DEPRECATED */
  async getQueueSummary(): Promise<QueueSummary> {
    logger.warn('QueueService.getQueueSummary is deprecated. Summaries are now derived on the client.');
    return {} as QueueSummary;
  }

  /**
   * Apply wait time estimates using the estimation service
   * Service handles ML/rule-based/historical fallback automatically
   */
  private async applyWaitTimeEstimates(staffId: string, schedule: QueueEntry[]): Promise<QueueEntry[]> {
    if (!schedule.length) return schedule;

    try {
      // Use the estimation service (handles all complexity internally)
      const { waitTimeEstimationService } = await import('../ml/WaitTimeEstimationService');
      
      // Estimate for each appointment in parallel
      const estimationPromises = schedule.map(async (entry) => {
        try {
          const estimation = await waitTimeEstimationService.estimateWaitTime(entry.id);
          return { entry, estimation };
        } catch (error) {
          logger.warn('Failed to estimate wait time for appointment', {
            appointmentId: entry.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return { entry, estimation: null };
        }
      });

      const results = await Promise.all(estimationPromises);

      // Update schedule with predictions
      const updatedSchedule = results.map(({ entry, estimation }) => {
        if (!estimation) return entry;
        
        return {
          ...entry,
          estimatedWaitTime: estimation.waitTimeMinutes,
          etaSource: estimation.mode,
          etaUpdatedAt: new Date(),
          predictionMode: estimation.mode,
          predictionConfidence: estimation.confidence,
        };
      });

      // Store predictions in database
      const records: WaitTimePredictionRecord[] = results
        .filter(({ estimation }) => estimation !== null)
        .map(({ entry, estimation }) => ({
          appointmentId: entry.id,
          clinicId: entry.clinicId,
          estimatedMinutes: estimation!.waitTimeMinutes,
          lowerConfidence: estimation!.explanation?.confidenceInterval?.[0],
          upperConfidence: estimation!.explanation?.confidenceInterval?.[1],
          confidenceScore: estimation!.confidence,
          mode: estimation!.mode,
          modelVersion: estimation!.mode === 'ml' ? 'backend-ml-v1' : 'rule-based-v1',
          featureHash: undefined,
          features: estimation!.features,
        }));

      if (records.length > 0) {
        await this.repository.recordWaitTimePredictions(records);
      }

      return updatedSchedule;
    } catch (error) {
      logger.error('Failed to apply wait time estimates', error as Error, { staffId });
      // Return schedule without predictions on error
      return schedule;
    }
  }
}
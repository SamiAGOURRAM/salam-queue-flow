/**
 * Queue Service (Full Refactor for Time-Based, Multi-Mode Scheduling)
 * This is the authoritative entry point for all queue and schedule operations.
 * It preserves all business logic while adapting to the new data model.
 */

import { QueueRepository } from './repositories/QueueRepository';
import { eventBus } from '../shared/events/EventBus';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, BusinessRuleError, ConflictError } from '../shared/errors';
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
    logger.info('Fetching daily schedule for staff', { staffId, targetDate });
    try {
      const scheduleData = await this.repository.getDailySchedule(staffId, targetDate);
      logger.debug(`Retrieved schedule for staff ${staffId} with mode ${scheduleData.operating_mode}`, { count: scheduleData.schedule.length });
      return scheduleData;
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

    const updatedEntry = await this.repository.updateQueueEntry(nextPatient.id, {
      status: AppointmentStatus.IN_PROGRESS,
      actualStartTime: new Date().toISOString(),
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
   */
  async completeAppointment(appointmentId: string, performedBy: string): Promise<QueueEntry> {
    logger.info('Completing appointment', { appointmentId });

    const entry = await this.getQueueEntry(appointmentId);
    if (entry.status === AppointmentStatus.COMPLETED) throw new ConflictError('Appointment is already completed');

    const previousStatus = entry.status;
    const updatedEntry = await this.repository.updateQueueEntry(appointmentId, {
      status: AppointmentStatus.COMPLETED,
      actualEndTime: new Date().toISOString(),
    });

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
}
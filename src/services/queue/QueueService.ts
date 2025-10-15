/**
 * Queue Service
 * Orchestrates queue management business logic
 * This is the main entry point for all queue operations
 */

import { QueueRepository } from './repositories/QueueRepository';
import { eventBus } from '../shared/events/EventBus';
import { logger } from '../shared/logging/Logger';
import {
  NotFoundError,
  ValidationError,
  BusinessRuleError,
  ConflictError,
} from '../shared/errors';
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
import {
  QueueEventFactory,
  QueueEventType,
} from './events/QueueEvents';

export class QueueService {
  private repository: QueueRepository;

  constructor(repository?: QueueRepository) {
    this.repository = repository || new QueueRepository();
  }

  // ============================================
  // QUEUE RETRIEVAL
  // ============================================

  /**
   * Get the current queue for a clinic on a specific date
   */
  async getQueue(filters: QueueFilters): Promise<QueueEntry[]> {
    logger.info('Fetching queue', { filters });
    
    try {
      const queue = await this.repository.getQueueByDate(filters);
      logger.debug(`Retrieved ${queue.length} queue entries`, { clinicId: filters.clinicId });
      return queue;
    } catch (error) {
      logger.error('Failed to fetch queue', error as Error, { filters });
      throw error;
    }
  }

  /**
   * Get a specific queue entry
   */
  async getQueueEntry(appointmentId: string): Promise<QueueEntry> {
    logger.debug('Fetching queue entry', { appointmentId });
    return await this.repository.getQueueEntryById(appointmentId);
  }

  /**
   * Get queue summary statistics
   */
  async getQueueSummary(clinicId: string, date: Date): Promise<QueueSummary> {
    logger.info('Calculating queue summary', { clinicId, date });

    const queue = await this.repository.getQueueByDate({
      clinicId,
      date,
      includeCompleted: true,
      includeAbsent: true,
    });

    const summary: QueueSummary = {
      clinicId,
      date,
      totalAppointments: queue.length,
      waiting: queue.filter(e => e.status === AppointmentStatus.WAITING).length,
      inProgress: queue.filter(e => e.status === AppointmentStatus.IN_PROGRESS).length,
      completed: queue.filter(e => e.status === AppointmentStatus.COMPLETED).length,
      absent: queue.filter(e => e.markedAbsentAt && !e.returnedAt).length,
      noShow: queue.filter(e => e.status === AppointmentStatus.NO_SHOW).length,
      averageWaitTime: this.calculateAverageWaitTime(queue),
      currentQueueLength: queue.filter(e => 
        e.status === AppointmentStatus.WAITING || 
        e.status === AppointmentStatus.SCHEDULED
      ).length,
    };

    logger.debug('Queue summary calculated', { summary });
    return summary;
  }

  // ============================================
  // QUEUE ENTRY MANAGEMENT
  // ============================================

  /**
   * Add a patient to the queue
   */
  async addToQueue(dto: CreateQueueEntryDTO): Promise<QueueEntry> {
    logger.info('Adding patient to queue', { dto });

    // Validate appointment date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dto.appointmentDate < today) {
      throw new ValidationError('Cannot create appointments for past dates');
    }

    // Create queue entry with auto-assigned position
    const entry = await this.repository.createQueueEntry({
      ...dto,
      autoAssignPosition: true,
    });

    // Publish event
    const event = QueueEventFactory.createPatientAddedEvent(entry);
    await eventBus.publish(event);

    logger.info('Patient added to queue successfully', { 
      appointmentId: entry.id, 
      position: entry.queuePosition 
    });

    return entry;
  }

  /**
   * Check in a patient (mark as present and waiting)
   */
  async checkInPatient(appointmentId: string): Promise<QueueEntry> {
    logger.info('Checking in patient', { appointmentId });

    const existingEntry = await this.repository.getQueueEntryById(appointmentId);

    // Validate check-in is allowed
    if (existingEntry.status === AppointmentStatus.COMPLETED) {
      throw new BusinessRuleError('Cannot check in a completed appointment');
    }

    if (existingEntry.status === AppointmentStatus.CANCELLED) {
      throw new BusinessRuleError('Cannot check in a cancelled appointment');
    }

    // Check in patient
    const entry = await this.repository.checkInPatient(appointmentId);

    // Publish event
    const event = QueueEventFactory.createPatientCheckedInEvent(entry);
    await eventBus.publish(event);

    logger.info('Patient checked in successfully', { appointmentId });
    return entry;
  }

  // ============================================
  // QUEUE FLOW MANAGEMENT
  // ============================================

  /**
   * Call the next patient in the queue
   */
  async callNextPatient(dto: CallNextPatientDTO): Promise<QueueEntry> {
    logger.info('Calling next patient', { dto });

    // Get current queue
    const queue = await this.repository.getQueueByDate({
      clinicId: dto.clinicId,
      date: dto.date,
      status: [AppointmentStatus.WAITING, AppointmentStatus.SCHEDULED],
    });

    if (queue.length === 0) {
      throw new NotFoundError('No patients waiting in queue');
    }

    // Find next patient (should be sorted by queue_position already)
    let nextPatient = queue[0];

    // Skip absent patients if requested
    if (dto.skipAbsentPatients) {
      const presentPatient = queue.find(e => e.isPresent);
      if (presentPatient) {
        nextPatient = presentPatient;
      }
    }

    // Update status to in_progress
    const updatedEntry = await this.repository.updateQueueEntry(nextPatient.id, {
      status: AppointmentStatus.IN_PROGRESS,
    });

    // Create audit record
    await this.repository.createQueueOverride(
      dto.clinicId,
      nextPatient.id,
      QueueActionType.CALL_PRESENT,
      dto.performedBy,
      nextPatient.queuePosition,
      nextPatient.queuePosition
    );

    // Publish event
    const event = QueueEventFactory.createPatientCalledEvent(updatedEntry, dto.performedBy);
    await eventBus.publish(event);

    logger.info('Next patient called successfully', { 
      appointmentId: updatedEntry.id,
      position: updatedEntry.queuePosition 
    });

    return updatedEntry;
  }

  /**
   * Mark a patient as absent
   */
  async markPatientAbsent(dto: MarkAbsentDTO): Promise<QueueEntry> {
    logger.info('Marking patient absent', { dto });

    const entry = await this.repository.getQueueEntryById(dto.appointmentId);

    // Validate
    if (entry.status === AppointmentStatus.COMPLETED) {
      throw new BusinessRuleError('Cannot mark completed appointment as absent');
    }

    if (entry.markedAbsentAt && !entry.returnedAt) {
      throw new ConflictError('Patient is already marked as absent');
    }

    // Update appointment
    const updatedEntry = await this.repository.updateQueueEntry(entry.id, {
      isPresent: false,
      skipReason: SkipReason.PATIENT_ABSENT,
    });

    // Create absent patient record
    await this.repository.createAbsentPatient(
      entry.id,
      entry.clinicId,
      entry.patientId,
      dto.gracePeriodMinutes || 15
    );

    // Create audit record
    await this.repository.createQueueOverride(
      entry.clinicId,
      entry.id,
      QueueActionType.MARK_ABSENT,
      dto.performedBy,
      entry.queuePosition,
      undefined,
      dto.reason
    );

    // Calculate grace period
    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setMinutes(gracePeriodEndsAt.getMinutes() + (dto.gracePeriodMinutes || 15));

    // Publish event
    const event = QueueEventFactory.createPatientMarkedAbsentEvent(
      updatedEntry,
      dto.performedBy,
      gracePeriodEndsAt
    );
    await eventBus.publish(event);

    logger.info('Patient marked absent', { 
      appointmentId: entry.id,
      gracePeriodEndsAt 
    });

    return updatedEntry;
  }

  /**
   * Mark an absent patient as returned
   */
  async markPatientReturned(
    appointmentId: string,
    performedBy: string
  ): Promise<QueueEntry> {
    logger.info('Marking patient as returned', { appointmentId });

    const entry = await this.repository.getQueueEntryById(appointmentId);

    // Validate patient was marked absent
    if (!entry.markedAbsentAt || entry.returnedAt) {
      throw new BusinessRuleError('Patient was not marked as absent or already returned');
    }

    // Get next available position (end of queue)
    const newPosition = await this.repository.getNextQueuePosition(
      entry.clinicId,
      entry.appointmentDate
    );

    // Update appointment
    const updatedEntry = await this.repository.updateQueueEntry(entry.id, {
      queuePosition: newPosition,
      isPresent: true,
      status: AppointmentStatus.WAITING,
    });

    // Update absent patient record
    await this.repository.markPatientReturned(appointmentId, newPosition);

    // Create audit record
    await this.repository.createQueueOverride(
      entry.clinicId,
      entry.id,
      QueueActionType.LATE_ARRIVAL,
      performedBy,
      entry.queuePosition,
      newPosition,
      'Patient returned after being marked absent'
    );

    // Publish event
    const event = QueueEventFactory.createPatientReturnedEvent(updatedEntry, newPosition);
    await eventBus.publish(event);

    logger.info('Patient marked as returned', { 
      appointmentId,
      newPosition 
    });

    return updatedEntry;
  }

  /**
   * Complete an appointment
   */
  async completeAppointment(
    appointmentId: string,
    performedBy: string
  ): Promise<QueueEntry> {
    logger.info('Completing appointment', { appointmentId });

    const entry = await this.repository.getQueueEntryById(appointmentId);

    // Validate
    if (entry.status === AppointmentStatus.COMPLETED) {
      throw new ConflictError('Appointment is already completed');
    }

    // Update status
    const previousStatus = entry.status;
    const updatedEntry = await this.repository.updateQueueEntry(appointmentId, {
      status: AppointmentStatus.COMPLETED,
    });

    // Publish event
    const event = QueueEventFactory.createAppointmentStatusChangedEvent(
      updatedEntry,
      previousStatus,
      performedBy
    );
    await eventBus.publish(event);

    logger.info('Appointment completed', { appointmentId });
    return updatedEntry;
  }

  /**
   * Reorder the queue (manual override)
   */
  async reorderQueue(dto: ReorderQueueDTO): Promise<QueueEntry> {
    logger.info('Reordering queue', { dto });

    const entry = await this.repository.getQueueEntryById(dto.appointmentId);

    // Validate new position
    if (dto.newPosition < 1) {
      throw new ValidationError('Queue position must be greater than 0');
    }

    if (dto.newPosition === entry.queuePosition) {
      throw new ValidationError('New position is the same as current position');
    }

    const previousPosition = entry.queuePosition;

    // Update position
    const updatedEntry = await this.repository.updateQueueEntry(entry.id, {
      queuePosition: dto.newPosition,
    });

    // Create audit record
    await this.repository.createQueueOverride(
      entry.clinicId,
      entry.id,
      QueueActionType.REORDER,
      dto.performedBy,
      previousPosition,
      dto.newPosition,
      dto.reason
    );

    // Publish event
    const event = QueueEventFactory.createQueuePositionChangedEvent(
      updatedEntry,
      previousPosition,
      dto.performedBy,
      dto.reason
    );
    await eventBus.publish(event);

    logger.info('Queue reordered', { 
      appointmentId: entry.id,
      previousPosition,
      newPosition: dto.newPosition 
    });

    return updatedEntry;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Calculate average wait time from completed appointments
   */
  private calculateAverageWaitTime(queue: QueueEntry[]): number {
    const completed = queue.filter(
      e => e.status === AppointmentStatus.COMPLETED && 
           e.checkedInAt && 
           e.actualStartTime
    );

    if (completed.length === 0) return 0;

    const totalWaitMinutes = completed.reduce((sum, entry) => {
      if (!entry.checkedInAt || !entry.actualStartTime) return sum;
      const waitTime = (entry.actualStartTime.getTime() - entry.checkedInAt.getTime()) / (1000 * 60);
      return sum + waitTime;
    }, 0);

    return Math.round(totalWaitMinutes / completed.length);
  }
}

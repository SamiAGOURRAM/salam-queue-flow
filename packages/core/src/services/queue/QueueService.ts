/**
 * Queue Service - Business logic for queue management
 */

import type { IQueueRepository } from '../../ports/repositories/IQueueRepository.js';
import type { IEventBus } from '../../ports/eventBus.js';
import type { ILogger } from '../../ports/logger.js';
import {
  AppointmentStatus,
  QueueActionType,
  type QueueEntry,
  type DailyScheduleEntry,
  type CallNextPatientDTO,
  type ReorderQueueDTO,
} from '../../types.js';
import { NotFoundError, BusinessRuleError, ValidationError } from '../../errors.js';
import { BaseService } from '../BaseService.js';

export class QueueService extends BaseService {
  constructor(
    private readonly repository: IQueueRepository,
    private readonly eventBus: IEventBus,
    logger: ILogger
  ) {
    super(logger);
  }

  /**
   * Get daily schedule for a staff member
   */
  async getDailySchedule(staffId: string, targetDate: string): Promise<DailyScheduleEntry[]> {
    return this.executeWithLogging('getDailySchedule', {
      service: 'QueueService',
      staffId,
      targetDate,
    }, async () => {
      const schedule = await this.repository.getDailySchedule(staffId, targetDate);
      this.logger.info('Daily schedule fetched', { entryCount: schedule.length });
      return schedule;
    });
  }

  /**
   * Get queue entries for a clinic
   */
  async getQueueEntries(clinicId: string, date: string): Promise<QueueEntry[]> {
    return this.executeWithLogging('getQueueEntries', {
      service: 'QueueService',
      clinicId,
      date,
    }, async () => {
      const entries = await this.repository.getQueueEntries(clinicId, date);
      this.logger.info('Queue entries fetched', { entryCount: entries.length });
      return entries;
    });
  }

  /**
   * Get all queue entries for a patient (by patients.uuid — not auth userId).
   */
  async getQueueEntriesByPatient(patientId: string): Promise<QueueEntry[]> {
    return this.executeWithLogging('getQueueEntriesByPatient', {
      service: 'QueueService',
      userId: patientId,
    }, async () => {
      const entries = await this.repository.getQueueEntriesByPatient(patientId);
      this.logger.info('Patient queue entries fetched', { entryCount: entries.length });
      return entries;
    });
  }

  /**
   * Get a specific queue entry
   */
  async getQueueEntry(appointmentId: string): Promise<QueueEntry> {
    return this.executeWithLogging('getQueueEntry', {
      service: 'QueueService',
      appointmentId,
    }, async () => {
      const entry = await this.repository.getQueueEntry(appointmentId);
      if (!entry) {
        throw new NotFoundError('Appointment', appointmentId);
      }
      return entry;
    });
  }

  /**
   * Get queue position for a patient
   */
  async getQueuePosition(
    clinicId: string,
    patientId: string,
    date: string
  ): Promise<{ position: number; total: number; estimatedWait: number } | null> {
    return this.executeWithLogging('getQueuePosition', {
      service: 'QueueService',
      clinicId,
      userId: patientId,
      date,
    }, async () => {
      const position = await this.repository.getQueuePosition(clinicId, patientId, date);
      this.logger.info('Queue position fetched', position || { notFound: true });
      return position;
    });
  }

  /**
   * Check in a patient
   */
  async checkInPatient(appointmentId: string): Promise<QueueEntry> {
    return this.executeWithLogging('checkInPatient', {
      service: 'QueueService',
      appointmentId,
    }, async () => {
      this.logger.info('Checking in patient');

      // Verify appointment exists and is in correct state
      const existing = await this.repository.getQueueEntry(appointmentId);
      if (!existing) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      if (existing.status !== AppointmentStatus.SCHEDULED) {
        throw new BusinessRuleError(
          `Cannot check in: appointment is ${existing.status}`,
          'INVALID_STATUS_FOR_CHECKIN'
        );
      }

      const entry = await this.repository.checkInPatient(appointmentId);

      this.logger.info('Patient checked in successfully', {
        queuePosition: entry.queuePosition
      });

      return entry;
    });
  }

  /**
   * Call the next patient in the queue
   */
  async callNextPatient(dto: CallNextPatientDTO): Promise<QueueEntry> {
    return this.executeWithLogging('callNextPatient', {
      service: 'QueueService',
      clinicId: dto.clinicId,
      staffId: dto.staffId,
      date: dto.appointmentDate,
    }, async () => {
      this.logger.info('Calling next patient');

      const entry = await this.repository.callNextPatient(dto);

      this.logger.info('Next patient called', {
        appointmentId: entry.id,
        patientId: entry.patientId
      });

      return entry;
    });
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<QueueEntry> {
    return this.executeWithLogging('updateAppointmentStatus', {
      service: 'QueueService',
      appointmentId,
      status,
    }, async () => {
      this.logger.info('Updating appointment status');
      const entry = await this.repository.updateAppointmentStatus(appointmentId, status);
      this.logger.info('Appointment status updated');
      return entry;
    });
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    return this.executeVoid('cancelAppointment', {
      service: 'QueueService',
      appointmentId,
      reason,
    }, async () => {
      this.logger.info('Cancelling appointment');
      await this.repository.cancelAppointment(appointmentId, reason);
      this.logger.info('Appointment cancelled');
    });
  }

  /**
   * Subscribe to queue updates
   */
  subscribeToQueueUpdates(
    clinicId: string,
    date: string,
    callback: (payload: unknown) => void
  ): () => void {
    this.logger.debug('Setting up queue updates subscription', { clinicId, date });
    return this.repository.subscribeToQueueUpdates(clinicId, date, callback);
  }

  /**
   * Manually move a patient to a new queue position (staff action).
   *
   * SSOT for reorder business rules — shared by the web UI and (future) the AI
   * agent so both enforce identical staff-scoping, validation, and audit. The
   * `useCase` tag is an iii-style stable function id (`queue::reorder`): a
   * zero-runtime convention that makes each use-case named/discoverable in logs.
   */
  async reorderQueue(dto: ReorderQueueDTO): Promise<QueueEntry> {
    return this.executeWithLogging('reorderQueue', {
      service: 'QueueService',
      useCase: 'queue::reorder',
      appointmentId: dto.appointmentId,
    }, async () => {
      const entry = await this.repository.getQueueEntry(dto.appointmentId);
      if (!entry) {
        throw new NotFoundError('Appointment', dto.appointmentId);
      }
      this.assertEntryWithinStaffScope(entry, dto.allowedStaffIds);

      if (dto.newPosition < 1) {
        throw new ValidationError('Queue position must be greater than 0');
      }
      if (dto.newPosition === entry.queuePosition) {
        return entry; // No change needed — skip mutation, audit, and event.
      }

      const previousPosition = entry.queuePosition;
      const updated = await this.repository.updateQueuePosition(entry.id, dto.newPosition);

      await this.repository.createQueueOverride({
        clinicId: entry.clinicId,
        appointmentId: entry.id,
        action: QueueActionType.REORDER,
        performedBy: dto.performedBy,
        reason: dto.reason,
        previousPosition,
        newPosition: dto.newPosition,
      });

      await this.eventBus.publish({
        eventId: this.eventBus.generateEventId(),
        eventType: 'queue.position_changed',
        timestamp: new Date(),
        clinicId: entry.clinicId,
        userId: dto.performedBy,
        payload: {
          appointmentId: entry.id,
          previousPosition,
          newPosition: dto.newPosition,
          reason: dto.reason,
        },
      });

      this.logger.info('Queue reordered', {
        appointmentId: entry.id,
        previousPosition,
        newPosition: dto.newPosition,
      });
      return updated;
    });
  }

  private normalizeAllowedStaffIds(allowedStaffIds?: string[]): string[] {
    return Array.from(
      new Set(
        (allowedStaffIds || []).filter(
          (staffId): staffId is string => typeof staffId === 'string' && staffId.length > 0
        )
      )
    );
  }

  /** Enforce per-provider queue scope: a scoped caller may only act on their own staff's entries. */
  private assertEntryWithinStaffScope(entry: QueueEntry, allowedStaffIds?: string[]): void {
    const normalized = this.normalizeAllowedStaffIds(allowedStaffIds);
    if (normalized.length === 0) {
      return; // Unscoped (e.g. owner/clinic-wide) — no restriction.
    }
    if (!entry.staffId || !normalized.includes(entry.staffId)) {
      throw new BusinessRuleError(
        'You are not allowed to manage this provider queue.',
        'STAFF_SCOPE_VIOLATION'
      );
    }
  }
}


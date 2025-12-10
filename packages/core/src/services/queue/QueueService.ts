/**
 * Queue Service - Business logic for queue management
 */

import type { QueueRepository } from '../../repositories/queue/QueueRepository';
import type { IEventBus, DomainEvent } from '../../ports/eventBus';
import type { ILogger } from '../../ports/logger';
import type { 
  QueueEntry, 
  DailyScheduleEntry, 
  AppointmentStatus,
  CallNextPatientDTO 
} from '../../types';
import { NotFoundError, BusinessRuleError } from '../../errors';

// Domain Events
interface PatientCheckedInEvent extends DomainEvent {
  eventType: 'queue:patient_checked_in';
  payload: {
    appointmentId: string;
    clinicId: string;
    patientId: string;
    queuePosition: number;
  };
}

interface PatientCalledEvent extends DomainEvent {
  eventType: 'queue:patient_called';
  payload: {
    appointmentId: string;
    clinicId: string;
    patientId: string;
    staffId: string;
  };
}

export class QueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  /**
   * Get daily schedule for a staff member
   */
  async getDailySchedule(staffId: string, targetDate: string): Promise<DailyScheduleEntry[]> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'getDailySchedule',
      staffId
    });

    try {
      this.logger.debug('Fetching daily schedule', { targetDate });
      const schedule = await this.repository.getDailySchedule(staffId, targetDate);
      this.logger.info('Daily schedule fetched', { entryCount: schedule.length });
      return schedule;
    } catch (error) {
      this.logger.error('Failed to fetch daily schedule', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get queue entries for a clinic
   */
  async getQueueEntries(clinicId: string, date: string): Promise<QueueEntry[]> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'getQueueEntries',
      clinicId
    });

    try {
      this.logger.debug('Fetching queue entries', { date });
      const entries = await this.repository.getQueueEntries(clinicId, date);
      this.logger.info('Queue entries fetched', { entryCount: entries.length });
      return entries;
    } catch (error) {
      this.logger.error('Failed to fetch queue entries', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get a specific queue entry
   */
  async getQueueEntry(appointmentId: string): Promise<QueueEntry> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'getQueueEntry',
      appointmentId
    });

    try {
      const entry = await this.repository.getQueueEntry(appointmentId);
      if (!entry) {
        throw new NotFoundError('Appointment', appointmentId);
      }
      return entry;
    } catch (error) {
      this.logger.error('Failed to get queue entry', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get queue position for a patient
   */
  async getQueuePosition(
    clinicId: string,
    patientId: string,
    date: string
  ): Promise<{ position: number; total: number; estimatedWait: number } | null> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'getQueuePosition',
      clinicId,
      userId: patientId
    });

    try {
      this.logger.debug('Getting queue position', { date });
      const position = await this.repository.getQueuePosition(clinicId, patientId, date);
      this.logger.info('Queue position fetched', position || { notFound: true });
      return position;
    } catch (error) {
      this.logger.error('Failed to get queue position', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Check in a patient
   */
  async checkInPatient(appointmentId: string): Promise<QueueEntry> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'checkInPatient',
      appointmentId
    });

    try {
      this.logger.info('Checking in patient');

      // Verify appointment exists and is in correct state
      const existing = await this.repository.getQueueEntry(appointmentId);
      if (!existing) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      if (existing.status !== 'scheduled') {
        throw new BusinessRuleError(
          `Cannot check in: appointment is ${existing.status}`,
          'INVALID_STATUS_FOR_CHECKIN'
        );
      }

      const entry = await this.repository.checkInPatient(appointmentId);

      await this.eventBus.publish<PatientCheckedInEvent>({
        eventId: this.eventBus.generateEventId(),
        eventType: 'queue:patient_checked_in',
        timestamp: new Date(),
        userId: entry.patientId,
        clinicId: entry.clinicId,
        payload: {
          appointmentId: entry.id,
          clinicId: entry.clinicId,
          patientId: entry.patientId,
          queuePosition: entry.queuePosition || 0
        }
      });

      this.logger.info('Patient checked in successfully', {
        queuePosition: entry.queuePosition
      });

      return entry;
    } catch (error) {
      this.logger.error('Failed to check in patient', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Call the next patient in the queue
   */
  async callNextPatient(dto: CallNextPatientDTO): Promise<QueueEntry> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'callNextPatient',
      clinicId: dto.clinicId,
      staffId: dto.staffId
    });

    try {
      this.logger.info('Calling next patient', { date: dto.appointmentDate });

      const entry = await this.repository.callNextPatient(dto);

      await this.eventBus.publish<PatientCalledEvent>({
        eventId: this.eventBus.generateEventId(),
        eventType: 'queue:patient_called',
        timestamp: new Date(),
        userId: entry.patientId,
        clinicId: entry.clinicId,
        payload: {
          appointmentId: entry.id,
          clinicId: entry.clinicId,
          patientId: entry.patientId,
          staffId: dto.staffId
        }
      });

      this.logger.info('Next patient called', {
        appointmentId: entry.id,
        patientId: entry.patientId
      });

      return entry;
    } catch (error) {
      this.logger.error('Failed to call next patient', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<QueueEntry> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'updateAppointmentStatus',
      appointmentId
    });

    try {
      this.logger.info('Updating appointment status', { status });
      const entry = await this.repository.updateAppointmentStatus(appointmentId, status);
      this.logger.info('Appointment status updated');
      return entry;
    } catch (error) {
      this.logger.error('Failed to update appointment status', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    this.logger.setContext({
      service: 'QueueService',
      operation: 'cancelAppointment',
      appointmentId
    });

    try {
      this.logger.info('Cancelling appointment', { reason });
      await this.repository.cancelAppointment(appointmentId, reason);
      this.logger.info('Appointment cancelled');
    } catch (error) {
      this.logger.error('Failed to cancel appointment', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
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
}


import { WaitlistRepository } from './repositories/WaitlistRepository';
import { QueueService } from './QueueService';
import { logger } from '../shared/logging/Logger';
import { QueueConfig } from '@/config/QueueConfig';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import {
  WaitlistEntry,
  CreateQueueEntryDTO,
  AppointmentType,
  WaitlistStatus,
} from './models/QueueModels';

export class WaitlistService {
  private repository: WaitlistRepository;
  private queueService: QueueService;

  constructor(repository?: WaitlistRepository, queueService?: QueueService) {
    this.repository = repository || new WaitlistRepository();
    this.queueService = queueService || new QueueService();
  }

  /**
   * Add patient to waitlist
   */
  async addToWaitlist(
    clinicId: string,
    date: Date,
    patientId?: string,
    priorityScore: number = 0,
    notes?: string
  ): Promise<WaitlistEntry> {
    return this.repository.addToWaitlist(clinicId, date, patientId, priorityScore, notes);
  }

  /**
   * Get waitlist for a clinic on a specific date
   */
  async getClinicWaitlist(clinicId: string, date: Date): Promise<WaitlistEntry[]> {
    return this.repository.getWaitlist(clinicId, date);
  }

  /**
   * Promote a waitlist entry to an appointment
   * This is typically called by the Gap Manager or manually by staff
   */
  async promoteToAppointment(
    waitlistId: string,
    staffId: string,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    if (!staffId) {
      throw new ValidationError('Staff ID is required to promote a waitlist entry');
    }

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new ValidationError('Valid start and end times are required for waitlist promotion');
    }

    const waitlistEntry = await this.repository.getWaitlistEntryById(waitlistId);

    if (!waitlistEntry) {
      throw new NotFoundError('Waitlist entry', waitlistId);
    }

    if (
      waitlistEntry.status !== WaitlistStatus.WAITING &&
      waitlistEntry.status !== WaitlistStatus.NOTIFIED
    ) {
      throw new BusinessRuleError(
        `Waitlist entry cannot be promoted from status: ${waitlistEntry.status}`
      );
    }

    if (!waitlistEntry.patientId) {
      throw new ValidationError('Waitlist entry is missing a linked patient and cannot be promoted');
    }

    const effectiveStart = new Date(Math.max(startTime.getTime(), Date.now()));
    const effectiveEnd = endTime.getTime() > effectiveStart.getTime()
      ? endTime
      : new Date(
          effectiveStart.getTime() +
            QueueConfig.DEFAULTS.DEFAULT_APPOINTMENT_DURATION_MINUTES * 60_000
        );

    const createDto: CreateQueueEntryDTO = {
      clinicId: waitlistEntry.clinicId,
      patientId: waitlistEntry.patientId,
      staffId,
      appointmentType: AppointmentType.CONSULTATION,
      isWalkIn: true,
      startTime: effectiveStart.toISOString(),
      endTime: effectiveEnd.toISOString(),
      isGapFiller: true,
      promotedFromWaitlist: true,
    };

    const claimedEntry = await this.repository.claimForPromotion(waitlistEntry.id);
    if (!claimedEntry) {
      throw new ConflictError('Waitlist entry was already promoted by another process');
    }

    let promotedAppointmentId: string;

    try {
      const promotedAppointment = await this.queueService.createAppointment(createDto);
      promotedAppointmentId = promotedAppointment.id;
    } catch (error) {
      try {
        await this.repository.updateStatus(waitlistEntry.id, waitlistEntry.status);
      } catch (rollbackError) {
        logger.error(
          'Failed to rollback waitlist promotion claim after appointment creation error',
          rollbackError as Error,
          { waitlistId: waitlistEntry.id }
        );
      }

      throw error;
    }

    logger.info('Promoted waitlist entry to appointment', {
      waitlistId: waitlistEntry.id,
      appointmentId: promotedAppointmentId,
      clinicId: waitlistEntry.clinicId,
      startTime: createDto.startTime,
      endTime: createDto.endTime,
      staffId,
    });
  }
}

export const waitlistService = new WaitlistService();


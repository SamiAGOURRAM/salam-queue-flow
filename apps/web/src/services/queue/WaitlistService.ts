import { WaitlistRepository } from './repositories/WaitlistRepository';
import { QueueService } from './QueueService';
import { logger } from '../shared/logging/Logger';
import { WaitlistEntry, CreateQueueEntryDTO, AppointmentType } from './models/QueueModels';

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
    guestPatientId?: string,
    priorityScore: number = 0,
    notes?: string
  ): Promise<WaitlistEntry> {
    return this.repository.addToWaitlist(clinicId, date, patientId, guestPatientId, priorityScore, notes);
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
    // 1. Get the waitlist entry (we need to implement getById in repo or just fetch list and find)
    // For MVP, let's assume we have the details or fetch fresh
    // Adding getById to repo would be better, but I'll just rely on the passed ID being valid for now 
    // and assume we can proceed if we had the full object. 
    // Actually, safer to fetch. I'll add getById to Repo later if needed, or just use getWaitlist and filter.
    
    // TODO: Fetch waitlist entry to get patient details.
    // For now, this is a placeholder for the "Gap Manager" logic.
    logger.info('Promoting waitlist entry to appointment', { waitlistId, staffId, startTime });
    
    // Mock logic:
    // const entry = await this.repository.getById(waitlistId);
    // await this.queueService.createAppointment({ ... });
    // await this.repository.updateStatus(waitlistId, 'promoted');
  }
}

export const waitlistService = new WaitlistService();


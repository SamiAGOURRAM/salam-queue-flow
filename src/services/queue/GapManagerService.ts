import { QueueRepository } from './repositories/QueueRepository';
import { WaitlistService } from './WaitlistService';
import { QueueService } from './QueueService';
import { logger } from '../shared/logging/Logger';
import { Disruption, QueueEntry } from './models/QueueModels';

/**
 * Gap Manager Service
 * Monitors for gaps in the schedule (cancellations, no-shows, early finishes)
 * and fills them intelligently from the waitlist or early arrivals.
 */
export class GapManagerService {
  constructor(
    private queueRepository: QueueRepository,
    private waitlistService: WaitlistService,
    private queueService: QueueService
  ) {}

  /**
   * Handle a slot becoming available (Gap Detected)
   */
  async handleGap(
    clinicId: string,
    gapStartTime: Date,
    gapEndTime: Date,
    staffId: string
  ): Promise<void> {
    logger.info('Gap detected, attempting to fill', { clinicId, gapStartTime, staffId });

    // 1. Find "Early Birds" (Scheduled later but arrived early)
    // These are the best candidates as they are physically present.
    const todaysSchedule = await this.queueRepository.getDailySchedule(staffId, gapStartTime.toISOString().split('T')[0]);
    
    const earlyBirds = todaysSchedule.schedule.filter(appt => 
      appt.status === 'waiting' && 
      appt.isPresent && 
      appt.startTime && 
      new Date(appt.startTime) > gapStartTime // Scheduled for later
    );

    if (earlyBirds.length > 0) {
      // Sort by arrival time (FIFO) or priority
      const bestCandidate = earlyBirds[0];
      logger.info('Found early bird to fill gap', { candidateId: bestCandidate.id });
      
      // Promote early bird to this slot
      // Ideally we'd ask for confirmation, but for "Fluid" modes we might auto-fill
      // For now, we'll just log the recommendation or auto-swap if configured
      await this.fillGapWithAppointment(bestCandidate, gapStartTime);
      return;
    }

    // 2. If no early birds, check the Waitlist
    const waitlist = await this.waitlistService.getClinicWaitlist(clinicId, gapStartTime);
    
    if (waitlist.length > 0) {
      const bestWaiter = waitlist[0];
      logger.info('Found waitlist candidate', { candidateId: bestWaiter.id });
      
      // Promote waitlist entry
      await this.waitlistService.promoteToAppointment(
        bestWaiter.id,
        staffId,
        gapStartTime,
        gapEndTime
      );
      return;
    }

    logger.info('No candidates found to fill gap');
  }

  private async fillGapWithAppointment(appointment: QueueEntry, newStartTime: Date): Promise<void> {
    // Update the appointment to the new earlier time
    // This effectively "fills" the gap
    await this.queueRepository.updateQueueEntry(appointment.id, {
        startTime: newStartTime.toISOString(),
        isGapFiller: true,
        priorityScore: (appointment.priorityScore || 0) + 20 // Bonus for being a gap filler
    });
    
    logger.info('Filled gap with existing appointment', { appointmentId: appointment.id, newTime: newStartTime });
  }
}


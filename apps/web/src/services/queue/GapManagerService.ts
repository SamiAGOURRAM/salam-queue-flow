import { QueueRepository } from './repositories/QueueRepository';
import { WaitlistService } from './WaitlistService';
import { QueueService } from './QueueService';
import { logger } from '../shared/logging/Logger';
import { AppointmentStatus, QueueEntry } from './models/QueueModels';

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
      appt.status === AppointmentStatus.WAITING &&
      appt.isPresent && 
      this.getScheduledDateTime(appt) !== null &&
      this.getScheduledDateTime(appt)! > gapStartTime // Scheduled for later
    );

    if (earlyBirds.length > 0) {
      // Sort by priority score (descending), then by queue position (ascending) as tiebreaker
      earlyBirds.sort((a, b) => {
        const scoreA = a.priorityScore ?? 0;
        const scoreB = b.priorityScore ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.queuePosition - b.queuePosition;
      });
      const bestCandidate = earlyBirds[0];
      logger.info('Found early bird to fill gap', { candidateId: bestCandidate.id });

      const isConfirmed = this.confirmEarlyBirdPromotion(bestCandidate, gapStartTime);
      if (!isConfirmed) {
        logger.info('Skipped early bird promotion because confirmation was not granted', {
          candidateId: bestCandidate.id,
          clinicId,
          staffId,
        });
        return;
      }
      
      // Promote early bird to this slot
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
        scheduledTime: this.formatTimeHHmm(newStartTime),
        isGapFiller: true,
        priorityScore: (appointment.priorityScore || 0) + 20 // Bonus for being a gap filler
    });
    
    logger.info('Filled gap with existing appointment', { appointmentId: appointment.id, newTime: newStartTime });
  }

  private getScheduledDateTime(entry: QueueEntry): Date | null {
    if (!entry.scheduledTime) return null;

    const dateStr = entry.appointmentDate.toISOString().split('T')[0];
    const normalizedTime = entry.scheduledTime.length === 5
      ? `${entry.scheduledTime}:00`
      : entry.scheduledTime;
    const parsed = new Date(`${dateStr}T${normalizedTime}`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatTimeHHmm(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private confirmEarlyBirdPromotion(candidate: QueueEntry, gapStartTime: Date): boolean {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return false;
    }

    const patientName = candidate.patient?.fullName || 'this patient';
    const gapTime = this.formatTimeHHmm(gapStartTime);

    try {
      return window.confirm(`Promote ${patientName} to fill the ${gapTime} gap now?`);
    } catch (error) {
      logger.warn('Unable to display early bird confirmation prompt', {
        candidateId: candidate.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}


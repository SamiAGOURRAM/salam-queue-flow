/**
 * Booking Service - Business logic for appointment booking
 * 
 * This is the core booking service that can be used by:
 * - Web application (React)
 * - MCP Server (AI chatbot)
 * - REST API
 */

import type { IBookingRepository, ClinicDetails } from '../../ports/repositories/IBookingRepository.js';
import type { IEventBus } from '../../ports/eventBus.js';
import type { ILogger } from '../../ports/logger.js';
import type {
  BookingRequest,
  BookingResponse,
  AvailableSlotsResponse,
  QueueMode,
  AppointmentType,
  NextAvailableSlot
} from '../../types.js';
import { BaseService } from '../BaseService.js';

/** Event type published when an appointment is successfully booked. */
export const APPOINTMENT_BOOKED_EVENT = 'appointment.booked';

export class BookingService extends BaseService {
  constructor(
    private readonly repository: IBookingRepository,
    private readonly eventBus: IEventBus,
    logger: ILogger
  ) {
    super(logger);
  }

  /**
   * Book appointment with dual-mode support (free queue or time slots)
   */
  async bookAppointmentForMode(request: BookingRequest): Promise<BookingResponse> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'bookAppointmentForMode',
      clinicId: request.clinicId,
      userId: request.patientId
    });

    try {
      this.logger.info('Starting appointment booking (mode-aware)', {
        date: request.appointmentDate,
        time: request.scheduledTime || 'FREE_QUEUE',
        type: request.appointmentType
      });

      // Check availability (mode-aware, per-staff)
      const availability = await this.repository.checkAvailabilityForMode(
        request.clinicId,
        request.staffId,
        request.appointmentDate,
        request.scheduledTime
      );

      if (!availability.available) {
        this.logger.warn('Slot not available', {
          existingCount: availability.existingCount,
          capacity: availability.capacity
        });

        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }

      // Create the appointment using dual-mode function
      const result = await this.repository.createAppointmentForMode(request);

      if (result.success) {
        this.logger.info('Appointment created successfully', {
          appointmentId: result.appointmentId,
          queuePosition: result.queuePosition,
          mode: request.scheduledTime ? 'time_slot' : 'free_queue'
        });
        // Announce the booking so notification handlers (web today, MCP later)
        // can resolve the recipient and deliver a confirmation via INotifier.
        // Shared by UI + agent, so both notify identically (agent parity).
        await this.publishAppointmentBooked(request, result);
      } else {
        this.logger.error('Failed to create appointment', new Error(result.error || 'Unknown error'));
      }

      return result;
    } catch (error) {
      this.logger.error('Booking failed with exception', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Publish the `appointment.booked` domain event. Best-effort: a failure here
   * must never fail the booking, so errors are swallowed (logged only).
   */
  private async publishAppointmentBooked(request: BookingRequest, result: BookingResponse): Promise<void> {
    try {
      await this.eventBus.publish({
        eventId: this.eventBus.generateEventId(),
        eventType: APPOINTMENT_BOOKED_EVENT,
        timestamp: new Date(),
        clinicId: request.clinicId,
        userId: request.patientId,
        payload: {
          appointmentId: result.appointmentId,
          patientId: request.patientId,
          staffId: request.staffId,
          appointmentDate: request.appointmentDate,
          scheduledTime: request.scheduledTime ?? null,
          appointmentType: request.appointmentType,
          queuePosition: result.queuePosition,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to publish appointment.booked event (booking unaffected)', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get available slots with mode awareness
   */
  async getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType?: string,
    staffId?: string
  ): Promise<AvailableSlotsResponse> {
    return this.executeWithLogging('getAvailableSlotsForMode', {
      service: 'BookingService',
      clinicId,
      date,
      appointmentType,
    }, async () => {
      const slots = await this.repository.getAvailableSlotsForMode(clinicId, date, appointmentType, staffId);
      this.logger.info('Available slots fetched', {
        mode: slots.mode,
        totalSlots: slots.slots?.length || 0,
        availableCount: slots.slots?.filter(s => s.available).length || 0
      });
      return slots;
    });
  }

  /**
   * Find the next available slot for a clinic, scanning forward from `fromDate`.
   * Returns an ISO-ish string: `YYYY-MM-DDTHH:mm` for a concrete slotted slot, or
   * a date-only `YYYY-MM-DD` for a fluid/queue day that is accepting patients.
   * Returns `null` if nothing is available within `maxDays`.
   *
   * `maxDays` is a hard cap (the N+1 guard); `fromDate` is supplied by the caller
   * (kept out of core) so this stays deterministic and unit-testable.
   */
  async getNextAvailableSlot(
    clinicId: string,
    fromDate: string,
    staffId: string,
    maxDays = 14
  ): Promise<NextAvailableSlot | null> {
    return this.executeWithLogging('getNextAvailableSlot', {
      service: 'BookingService',
      clinicId,
    }, async () => {
      for (let i = 0; i < maxDays; i++) {
        const date = this.addDaysUtc(fromDate, i);
        // Call the repository directly to avoid nested log-context churn per day.
        const res = await this.repository.getAvailableSlotsForMode(clinicId, date, undefined, staffId);
        const slot = res.slots?.find(s => s.available);
        if (slot) return { kind: 'datetime', value: `${date}T${slot.time}` };
        // Fluid/queue day with capacity: bookable that day, no fixed time.
        if (res.available && (res.mode === 'fluid' || res.mode === null || res.mode === undefined)) {
          return { kind: 'day', value: date };
        }
      }
      return null;
    });
  }

  /** Add `days` to a `YYYY-MM-DD` string in UTC, returning `YYYY-MM-DD`. */
  private addDaysUtc(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Get queue mode for a specific date
   */
  async getQueueMode(clinicId: string, date: string): Promise<QueueMode> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'getQueueMode',
      clinicId
    });

    try {
      this.logger.debug('Fetching queue mode', { date });
      const mode = await this.repository.getQueueModeForDate(clinicId, date);
      this.logger.info('Queue mode fetched', { mode });
      return mode;
    } catch (error) {
      this.logger.error('Failed to fetch queue mode', error as Error);
      return null;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get clinic information for booking
   */
  async getClinicInfo(clinicId: string): Promise<{
    clinic: ClinicDetails;
    appointmentTypes: AppointmentType[];
  }> {
    return this.executeWithLogging('getClinicInfo', {
      service: 'BookingService',
      clinicId,
    }, async () => {
      const [clinic, appointmentTypes] = await Promise.all([
        this.repository.getClinicDetails(clinicId),
        this.repository.getAppointmentTypes(clinicId)
      ]);
      this.logger.info('Clinic info fetched successfully', {
        appointmentTypesCount: appointmentTypes.length
      });
      return { clinic, appointmentTypes };
    });
  }

  /**
   * Manually assign time slot to free queue appointment (staff only)
   */
  async manuallyAssignTimeSlot(
    appointmentId: string,
    scheduledTime: string,
    assignedBy: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'manuallyAssignTimeSlot',
      appointmentId
    });

    try {
      this.logger.info('Manually assigning time slot', { scheduledTime, assignedBy });
      const result = await this.repository.manuallyAssignTimeSlot(appointmentId, scheduledTime, assignedBy);
      this.logger.info('Time slot assigned successfully');
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to assign time slot', error as Error);
      return { success: false, error: (error as Error).message };
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Subscribe to slot updates
   */
  subscribeToSlotUpdates(clinicId: string, date: string, callback: () => void): () => void {
    this.logger.debug('Setting up slot updates subscription', { clinicId, date });
    return this.repository.subscribeToSlotUpdates(clinicId, date, callback);
  }

}


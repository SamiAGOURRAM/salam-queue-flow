/**
 * Booking Service - Business logic for appointment booking
 * 
 * This is the core booking service that can be used by:
 * - Web application (React)
 * - MCP Server (AI chatbot)
 * - REST API
 */

import type { BookingRepository } from '../../repositories/booking/BookingRepository';
import type { IEventBus, DomainEvent } from '../../ports/eventBus';
import type { ILogger } from '../../ports/logger';
import type {
  BookingRequest,
  BookingResponse,
  AvailableSlotsResponse,
  QueueMode,
  AppointmentType
} from '../../types';

// Domain Events
interface BookingCreatedEvent extends DomainEvent {
  eventType: 'booking:created';
  payload: {
    appointmentId: string;
    clinicId: string;
    patientId: string;
    date: string;
    time: string | null;
    appointmentType: string;
  };
}

interface BookingFailedEvent extends DomainEvent {
  eventType: 'booking:failed';
  payload: {
    clinicId: string;
    patientId: string;
    reason: string;
    date: string;
    time: string | null;
  };
}

export class BookingService {
  constructor(
    private readonly repository: BookingRepository,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  /**
   * Book an appointment with full validation
   */
  async bookAppointment(request: BookingRequest): Promise<BookingResponse> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'bookAppointment',
      clinicId: request.clinicId,
      userId: request.patientId
    });

    try {
      this.logger.info('Starting appointment booking', {
        date: request.appointmentDate,
        time: request.scheduledTime,
        type: request.appointmentType
      });

      // Check availability
      const availability = await this.repository.checkAvailability(
        request.clinicId,
        request.appointmentDate,
        request.scheduledTime!
      );

      if (!availability.available) {
        this.logger.warn('Slot not available', {
          existingCount: availability.existingCount,
          capacity: availability.capacity
        });

        await this.publishBookingFailed(request, 'Slot not available');

        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }

      // Create the appointment
      const result = await this.repository.createAppointment(request);

      if (result.success) {
        await this.publishBookingCreated(request, result.appointmentId!);
        this.logger.info('Appointment created successfully', {
          appointmentId: result.appointmentId,
          queuePosition: result.queuePosition
        });
      } else {
        this.logger.error('Failed to create appointment', new Error(result.error || 'Unknown error'));
      }

      return result;
    } catch (error) {
      this.logger.error('Booking failed with exception', error as Error);
      await this.publishBookingFailed(request, (error as Error).message);
      throw error;
    } finally {
      this.logger.clearContext();
    }
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

      // Check availability (mode-aware)
      const availability = await this.repository.checkAvailabilityForMode(
        request.clinicId,
        request.appointmentDate,
        request.scheduledTime
      );

      if (!availability.available) {
        this.logger.warn('Slot not available', {
          existingCount: availability.existingCount,
          capacity: availability.capacity
        });

        await this.publishBookingFailed(request, 'Slot not available');

        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }

      // Create the appointment using dual-mode function
      const result = await this.repository.createAppointmentForMode(request);

      if (result.success) {
        await this.publishBookingCreated(request, result.appointmentId!);
        this.logger.info('Appointment created successfully', {
          appointmentId: result.appointmentId,
          queuePosition: result.queuePosition,
          mode: request.scheduledTime ? 'time_slot' : 'free_queue'
        });
      } else {
        this.logger.error('Failed to create appointment', new Error(result.error || 'Unknown error'));
      }

      return result;
    } catch (error) {
      this.logger.error('Booking failed with exception', error as Error);
      await this.publishBookingFailed(request, (error as Error).message);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get available slots for a clinic on a specific date
   */
  async getAvailableSlots(
    clinicId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'getAvailableSlots',
      clinicId
    });

    try {
      this.logger.debug('Fetching available slots', { date, appointmentType });

      const slots = await this.repository.getAvailableSlots(clinicId, date, appointmentType);

      this.logger.info('Available slots fetched', {
        totalSlots: slots.slots?.length || 0,
        availableCount: slots.slots?.filter(s => s.available).length || 0
      });

      return slots;
    } catch (error) {
      this.logger.error('Failed to fetch available slots', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get available slots with mode awareness
   */
  async getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'getAvailableSlotsForMode',
      clinicId
    });

    try {
      this.logger.debug('Fetching available slots for mode', { date, appointmentType });

      const slots = await this.repository.getAvailableSlotsForMode(clinicId, date, appointmentType);

      this.logger.info('Available slots fetched', {
        mode: slots.mode,
        totalSlots: slots.slots?.length || 0,
        availableCount: slots.slots?.filter(s => s.available).length || 0
      });

      return slots;
    } catch (error) {
      this.logger.error('Failed to fetch available slots', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
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
    clinic: unknown;
    appointmentTypes: AppointmentType[];
  }> {
    this.logger.setContext({
      service: 'BookingService',
      operation: 'getClinicInfo',
      clinicId
    });

    try {
      this.logger.debug('Fetching clinic info');

      const [clinic, appointmentTypes] = await Promise.all([
        this.repository.getClinicDetails(clinicId),
        this.repository.getAppointmentTypes(clinicId)
      ]);

      this.logger.info('Clinic info fetched successfully', {
        appointmentTypesCount: appointmentTypes.length
      });

      return { clinic, appointmentTypes };
    } catch (error) {
      this.logger.error('Failed to fetch clinic info', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
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

  // Private helper methods

  private async publishBookingCreated(request: BookingRequest, appointmentId: string): Promise<void> {
    await this.eventBus.publish<BookingCreatedEvent>({
      eventId: this.eventBus.generateEventId(),
      eventType: 'booking:created',
      timestamp: new Date(),
      userId: request.patientId,
      clinicId: request.clinicId,
      payload: {
        appointmentId,
        clinicId: request.clinicId,
        patientId: request.patientId,
        date: request.appointmentDate,
        time: request.scheduledTime,
        appointmentType: request.appointmentType
      }
    });
  }

  private async publishBookingFailed(request: BookingRequest, reason: string): Promise<void> {
    await this.eventBus.publish<BookingFailedEvent>({
      eventId: this.eventBus.generateEventId(),
      eventType: 'booking:failed',
      timestamp: new Date(),
      userId: request.patientId,
      clinicId: request.clinicId,
      payload: {
        clinicId: request.clinicId,
        patientId: request.patientId,
        reason,
        date: request.appointmentDate,
        time: request.scheduledTime
      }
    });
  }
}


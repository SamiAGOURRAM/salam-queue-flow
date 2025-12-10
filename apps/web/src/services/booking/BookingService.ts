// src/services/booking/BookingService.ts
import { BookingRepository } from './BookingRepository';
import { BookingRequest, BookingResponse, AvailableSlotsResponse } from './types';
import { eventBus, EventBus, DomainEvent } from '@/services/shared/events/EventBus';
import { logger } from '@/services/shared/logging/Logger';

// Define booking domain events
interface BookingCreatedEvent extends DomainEvent {
  eventType: 'booking:created';
  payload: {
    appointmentId: string;
    clinicId: string;
    patientId: string;
    date: string;
    time: string;
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
    time: string;
  };
}

export class BookingService {
  private repository: BookingRepository;

  constructor() {
    this.repository = new BookingRepository();
    
    // Set logger context for this service
    logger.setContext({ service: 'BookingService' });
  }

  /**
   * Book an appointment with full validation
   */
  async bookAppointment(request: BookingRequest): Promise<BookingResponse> {
    try {
      // Add context for this operation
      logger.setContext({
        service: 'BookingService',
        operation: 'bookAppointment',
        clinicId: request.clinicId,
        userId: request.patientId
      });

      logger.info('Starting appointment booking', { 
        date: request.appointmentDate,
        time: request.scheduledTime,
        type: request.appointmentType
      });

      // Check availability one final time
      const availability = await this.repository.checkAvailability(
        request.clinicId,
        request.appointmentDate,
        request.scheduledTime
      );

      if (!availability.available) {
        logger.warn('Slot not available', {
          existingCount: availability.existingCount,
          capacity: availability.capacity
        });

        // Publish failure event
        await eventBus.publish<BookingFailedEvent>({
          eventId: EventBus.generateEventId(),
          eventType: 'booking:failed',
          timestamp: new Date(),
          userId: request.patientId,
          clinicId: request.clinicId,
          payload: {
            clinicId: request.clinicId,
            patientId: request.patientId,
            reason: 'Slot not available',
            date: request.appointmentDate,
            time: request.scheduledTime
          }
        });

        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }

      // Create the appointment
      const result = await this.repository.createAppointment(request);

      if (result.success) {
        // Publish success event
        await eventBus.publish<BookingCreatedEvent>({
          eventId: EventBus.generateEventId(),
          eventType: 'booking:created',
          timestamp: new Date(),
          userId: request.patientId,
          clinicId: request.clinicId,
          payload: {
            appointmentId: result.appointmentId!,
            clinicId: request.clinicId,
            patientId: request.patientId,
            date: request.appointmentDate,
            time: request.scheduledTime,
            appointmentType: request.appointmentType
          }
        });

        logger.info('Appointment created successfully', {
          appointmentId: result.appointmentId,
          queuePosition: result.queuePosition
        });
      } else {
        logger.error('Failed to create appointment', new Error(result.error || 'Unknown error'), {
          request
        });
      }

      return result;
    } catch (error) {
      logger.error('Booking failed with exception', error as Error, {
        request
      });

      // Publish failure event
      await eventBus.publish<BookingFailedEvent>({
        eventId: EventBus.generateEventId(),
        eventType: 'booking:failed',
        timestamp: new Date(),
        userId: request.patientId,
        clinicId: request.clinicId,
        payload: {
          clinicId: request.clinicId,
          patientId: request.patientId,
          reason: (error as Error).message,
          date: request.appointmentDate,
          time: request.scheduledTime
        }
      });

      throw error;
    } finally {
      // Clear the context after operation
      logger.clearContext();
    }
  }

  /**
   * Get available slots with caching
   */
  async getAvailableSlots(
    clinicId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    logger.setContext({ 
      service: 'BookingService',
      operation: 'getAvailableSlots',
      clinicId 
    });

    try {
      logger.debug('Fetching available slots', {
        date,
        appointmentType
      });

      const slots = await this.repository.getAvailableSlots(clinicId, date, appointmentType);
      
      logger.info('Available slots fetched', {
        totalSlots: slots.slots?.length || 0,
        availableCount: slots.slots?.filter(s => s.available).length || 0
      });

      return slots;
    } catch (error) {
      logger.error('Failed to fetch available slots', error as Error);
      throw error;
    } finally {
      logger.clearContext();
    }
  }

  /**
   * Get clinic information for booking
   */
  async getClinicInfo(clinicId: string) {
    logger.setContext({ 
      service: 'BookingService',
      operation: 'getClinicInfo',
      clinicId 
    });

    try {
      logger.debug('Fetching clinic info');

      const [clinic, appointmentTypes] = await Promise.all([
        this.repository.getClinicDetails(clinicId),
        this.repository.getAppointmentTypes(clinicId)
      ]);

      logger.info('Clinic info fetched successfully', {
        appointmentTypesCount: appointmentTypes.length
      });

      return {
        clinic,
        appointmentTypes
      };
    } catch (error) {
      logger.error('Failed to fetch clinic info', error as Error);
      throw error;
    } finally {
      logger.clearContext();
    }
  }
   /**
   * NEW: Get queue mode for a specific date
   */
   async getQueueMode(clinicId: string, date: string) {
    logger.setContext({ 
      service: 'BookingService',
      operation: 'getQueueMode',
      clinicId 
    });

    try {
      logger.debug('Fetching queue mode', { date });
      
      const mode = await this.repository.getQueueModeForDate(clinicId, date);
      
      logger.info('Queue mode fetched', { mode });
      
      return mode;
    } catch (error) {
      logger.error('Failed to fetch queue mode', error as Error);
      return null; // Fallback gracefully
    } finally {
      logger.clearContext();
    }
  }

  /**
   * NEW: Get available slots with mode awareness
   * Uses the dual-mode function that respects queue configuration
   */
  async getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    logger.setContext({ 
      service: 'BookingService',
      operation: 'getAvailableSlotsForMode',
      clinicId 
    });

    try {
      logger.debug('Fetching available slots for mode', {
        date,
        appointmentType
      });

      const slots = await this.repository.getAvailableSlotsForMode(clinicId, date, appointmentType);
      
      logger.info('Available slots fetched', {
        mode: slots.mode,
        totalSlots: slots.slots?.length || 0,
        availableCount: slots.slots?.filter(s => s.available).length || 0
      });

      return slots;
    } catch (error) {
      logger.error('Failed to fetch available slots', error as Error);
      throw error;
    } finally {
      logger.clearContext();
    }
  }

  /**
   * NEW: Book appointment with dual-mode support
   * Handles both free queue and time slots modes
   */
  async bookAppointmentForMode(request: BookingRequest): Promise<BookingResponse> {
    try {
      logger.setContext({
        service: 'BookingService',
        operation: 'bookAppointmentForMode',
        clinicId: request.clinicId,
        userId: request.patientId
      });

      logger.info('Starting appointment booking (mode-aware)', { 
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
        logger.warn('Slot not available', {
          existingCount: availability.existingCount,
          capacity: availability.capacity
        });

        await eventBus.publish<BookingFailedEvent>({
          eventId: EventBus.generateEventId(),
          eventType: 'booking:failed',
          timestamp: new Date(),
          userId: request.patientId,
          clinicId: request.clinicId,
          payload: {
            clinicId: request.clinicId,
            patientId: request.patientId,
            reason: 'Slot not available',
            date: request.appointmentDate,
            time: request.scheduledTime || 'FREE_QUEUE'
          }
        });

        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }

      // Create the appointment using dual-mode function
      const result = await this.repository.createAppointmentForMode(request);

      if (result.success) {
        await eventBus.publish<BookingCreatedEvent>({
          eventId: EventBus.generateEventId(),
          eventType: 'booking:created',
          timestamp: new Date(),
          userId: request.patientId,
          clinicId: request.clinicId,
          payload: {
            appointmentId: result.appointmentId!,
            clinicId: request.clinicId,
            patientId: request.patientId,
            date: request.appointmentDate,
            time: request.scheduledTime || 'FREE_QUEUE',
            appointmentType: request.appointmentType
          }
        });

        logger.info('Appointment created successfully', {
          appointmentId: result.appointmentId,
          queuePosition: result.queuePosition,
          mode: request.scheduledTime ? 'time_slot' : 'free_queue'
        });
      } else {
        logger.error('Failed to create appointment', new Error(result.error || 'Unknown error'), {
          request
        });
      }

      return result;
    } catch (error) {
      logger.error('Booking failed with exception', error as Error, {
        request
      });

      await eventBus.publish<BookingFailedEvent>({
        eventId: EventBus.generateEventId(),
        eventType: 'booking:failed',
        timestamp: new Date(),
        userId: request.patientId,
        clinicId: request.clinicId,
        payload: {
          clinicId: request.clinicId,
          patientId: request.patientId,
          reason: (error as Error).message,
          date: request.appointmentDate,
          time: request.scheduledTime || 'FREE_QUEUE'
        }
      });

      throw error;
    } finally {
      logger.clearContext();
    }
  }

  /**
   * NEW: Manually assign time to free queue appointment (staff only)
   */
  async manuallyAssignTimeSlot(
    appointmentId: string,
    scheduledTime: string,
    assignedBy: string
  ) {
    logger.setContext({
      service: 'BookingService',
      operation: 'manuallyAssignTimeSlot',
      appointmentId
    });

    try {
      logger.info('Manually assigning time slot', {
        scheduledTime,
        assignedBy
      });

      const result = await this.repository.manuallyAssignTimeSlot(
        appointmentId,
        scheduledTime,
        assignedBy
      );

      logger.info('Time slot assigned successfully');

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Failed to assign time slot', error as Error);
      return {
        success: false,
        error: (error as Error).message
      };
    } finally {
      logger.clearContext();
    }
  }

  /**
   * Subscribe to slot updates
   */
  subscribeToSlotUpdates(clinicId: string, date: string, callback: () => void) {
    logger.debug('Setting up slot updates subscription', {
      clinicId,
      date
    });
    
    return this.repository.subscribeToSlotUpdates(clinicId, date, callback);
  }
}

// Export singleton instance
export const bookingService = new BookingService();
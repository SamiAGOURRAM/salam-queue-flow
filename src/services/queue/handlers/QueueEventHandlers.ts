/**
 * Queue Event Handlers
 * Subscribe to queue events and trigger notifications
 */

import { eventBus } from '../../shared/events/EventBus';
import { logger } from '../../shared/logging/Logger';
import { NotificationService } from '../../notification/NotificationService';
import { NotificationChannel, NotificationType } from '../../notification/models/NotificationModels';
import {
  QueueEventType,
  PatientCalledEvent,
  PatientMarkedAbsentEvent,
  PatientAddedToQueueEvent,
} from '../events/QueueEvents';

const notificationService = new NotificationService();

/**
 * Initialize all queue event handlers
 */
export function initializeQueueEventHandlers() {
  logger.info('Initializing queue event handlers');

  // Handle patient called - send "YOUR_TURN" notification
  eventBus.subscribe<PatientCalledEvent>(
    QueueEventType.PATIENT_CALLED,
    async (event) => {
      try {
        logger.debug('Handling PATIENT_CALLED event', { eventId: event.eventId });

        // TODO: Get patient phone number from event or fetch from DB
        // For now, we'll skip if no phone number
        
        logger.info('Patient called notification would be sent here', {
          appointmentId: event.appointmentId,
          patientId: event.payload.patientId,
        });

        // await notificationService.send({
        //   clinicId: event.clinicId,
        //   patientId: event.payload.patientId,
        //   appointmentId: event.appointmentId,
        //   channel: NotificationChannel.SMS,
        //   type: NotificationType.YOUR_TURN,
        //   phoneNumber: patientPhoneNumber,
        //   templateVariables: {
        //     position: event.payload.queuePosition.toString(),
        //   },
        // });

      } catch (error) {
        logger.error('Failed to handle PATIENT_CALLED event', error as Error, {
          eventId: event.eventId,
        });
      }
    }
  );

  // Handle patient marked absent - send grace period notification
  eventBus.subscribe<PatientMarkedAbsentEvent>(
    QueueEventType.PATIENT_MARKED_ABSENT,
    async (event) => {
      try {
        logger.debug('Handling PATIENT_MARKED_ABSENT event', { eventId: event.eventId });

        logger.info('Patient absent notification would be sent here', {
          appointmentId: event.appointmentId,
          patientId: event.payload.patientId,
          gracePeriodEndsAt: event.payload.gracePeriodEndsAt,
        });

        // await notificationService.send({
        //   clinicId: event.clinicId,
        //   patientId: event.payload.patientId,
        //   appointmentId: event.appointmentId,
        //   channel: NotificationChannel.SMS,
        //   type: NotificationType.PATIENT_ABSENT,
        //   phoneNumber: patientPhoneNumber,
        //   templateVariables: {
        //     graceMinutes: '15',
        //   },
        // });

      } catch (error) {
        logger.error('Failed to handle PATIENT_MARKED_ABSENT event', error as Error, {
          eventId: event.eventId,
        });
      }
    }
  );

  // Handle patient added to queue - send confirmation
  eventBus.subscribe<PatientAddedToQueueEvent>(
    QueueEventType.PATIENT_ADDED_TO_QUEUE,
    async (event) => {
      try {
        logger.debug('Handling PATIENT_ADDED_TO_QUEUE event', { eventId: event.eventId });

        logger.info('Appointment confirmation notification would be sent here', {
          appointmentId: event.appointmentId,
          patientId: event.payload.patientId,
          queuePosition: event.payload.queuePosition,
        });

        // await notificationService.send({
        //   clinicId: event.clinicId,
        //   patientId: event.payload.patientId,
        //   appointmentId: event.appointmentId,
        //   channel: NotificationChannel.SMS,
        //   type: NotificationType.APPOINTMENT_CONFIRMED,
        //   phoneNumber: patientPhoneNumber,
        //   templateVariables: {
        //     clinicName: 'Your Clinic',
        //     date: event.payload.appointmentDate,
        //     time: event.payload.scheduledTime || 'TBD',
        //     position: event.payload.queuePosition.toString(),
        //   },
        // });

      } catch (error) {
        logger.error('Failed to handle PATIENT_ADDED_TO_QUEUE event', error as Error, {
          eventId: event.eventId,
        });
      }
    }
  );

  logger.info('Queue event handlers initialized successfully');
}

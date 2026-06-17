/**
 * Booking Notification Handler
 *
 * Subscribes to core's `appointment.booked` domain event (published by
 * @queuemed/core's BookingService for BOTH the web UI and the AI agent),
 * resolves the patient's reachable channel, and delivers a confirmation via the
 * INotifier port. This is the app-side consumer that closes the loop opened by
 * Phase C: core announces the booking, the web resolves recipient + delivers.
 *
 * Fire-and-forget: a notification never blocks or fails a booking.
 */
import { APPOINTMENT_BOOKED_EVENT, type DomainEvent, type NotifyChannel } from '@queuemed/core';
import { coreContainer } from '../../core/coreContainer';
import { ChannelRouter } from '../channels/ChannelRouter';
import { NotificationType } from '../models/NotificationModels';
import { logger } from '../../shared/logging/Logger';

const channelRouter = new ChannelRouter();

/**
 * Whether the SMS/notification provider is configured. Mirrors QueueEventHandlers:
 * when disabled, confirmations are skipped with a single warning rather than
 * attempting delivery and retrying into provider errors.
 */
function isSmsEnabled(): boolean {
  return import.meta.env.VITE_SMS_ENABLED === 'true';
}

/**
 * Resolve the recipient and deliver an APPOINTMENT_CONFIRMED notification.
 * Exported for testing; never throws (errors are logged).
 */
export async function handleAppointmentBooked(event: DomainEvent): Promise<void> {
  if (!isSmsEnabled()) {
    logger.warn('Skipping booking confirmation: VITE_SMS_ENABLED is not "true".', {
      eventId: event.eventId,
    });
    return;
  }

  const patientId = event.payload.patientId as string | undefined;
  const appointmentId = event.payload.appointmentId as string | undefined;
  if (!patientId) {
    logger.warn('appointment.booked event missing patientId; cannot send confirmation', {
      eventId: event.eventId,
    });
    return;
  }

  try {
    const route = await channelRouter.resolveForPatient(patientId);
    if (!route) {
      logger.warn('Skipping booking confirmation: patient has no reachable channel', { patientId });
      return;
    }

    await coreContainer.notifier.notify({
      clinicId: (event.clinicId as string) ?? '',
      patientId,
      appointmentId,
      channel: route.channel as NotifyChannel,
      type: NotificationType.APPOINTMENT_CONFIRMED,
      phoneNumber: route.phoneNumber,
      email: route.email,
      language: route.preferredLanguage,
      variables: {
        appointmentDate: (event.payload.appointmentDate as string) ?? '',
        scheduledTime: (event.payload.scheduledTime as string) ?? '',
        appointmentType: (event.payload.appointmentType as string) ?? '',
      },
    });

    logger.info('Booking confirmation sent', { patientId, appointmentId, channel: route.channel });
  } catch (error) {
    logger.error('Failed to send booking confirmation', error as Error, { patientId, appointmentId });
  }
}

/**
 * Subscribe the confirmation handler to core's shared event bus.
 * Call once at app startup (after the core container is created).
 */
export function initializeBookingNotificationHandler(): void {
  logger.info('Initializing booking notification handler');
  coreContainer.eventBus.subscribe(APPOINTMENT_BOOKED_EVENT, (event) => {
    // Fire-and-forget so booking latency never includes delivery.
    void handleAppointmentBooked(event);
  });
}

/**
 * Queue Event Handlers
 * Subscribe to queue events and trigger notifications
 */

import { supabase } from '@/integrations/supabase/client';
import { eventBus } from '../../shared/events/EventBus';
import { logger } from '../../shared/logging/Logger';
import { NotificationService } from '../../notification/NotificationService';
import { ChannelRouter } from '../../notification/channels/ChannelRouter';
import { NotificationDecisionEngine } from '../../notification/NotificationDecisionEngine';
import {
  AppointmentStatusChangedEvent,
  PatientAddedToQueueEvent,
  PatientCalledEvent,
  PatientMarkedAbsentEvent,
  QueueEventFactory,
  QueueDomainEvent,
  QueueEventType,
  QueuePositionChangedEvent,
  TurnApproachingEvent,
} from '../events/QueueEvents';

const DEFAULT_APPOINTMENT_DURATION_MINUTES = 15;

const clinicNameCache = new Map<string, string>();

async function resolveClinicName(clinicId: string): Promise<string> {
  const cached = clinicNameCache.get(clinicId);
  if (cached) return cached;

  try {
    const { data } = await supabase
      .from('clinics')
      .select('name')
      .eq('id', clinicId)
      .maybeSingle();

    const name = data?.name || clinicId;
    clinicNameCache.set(clinicId, name);
    return name;
  } catch {
    return clinicId;
  }
}

const notificationService = new NotificationService();
const channelRouter = new ChannelRouter();
const notificationDecisionEngine = new NotificationDecisionEngine();

/**
 * Whether the SMS/notification provider (Twilio) is configured.
 * Evaluated lazily so tests can use vi.stubEnv before the call.
 * Set VITE_SMS_ENABLED=true in .env when the provider is wired.
 * When disabled, queue notifications are skipped with a single warning
 * instead of attempting delivery and retrying into 5xx errors.
 */
function isSmsEnabled(): boolean {
  return import.meta.env.VITE_SMS_ENABLED === 'true';
}

async function handleQueueEventNotification(event: QueueDomainEvent): Promise<void> {
  const instructions = notificationDecisionEngine.buildInstructions(event);

  if (instructions.length === 0) {
    return;
  }

  if (!isSmsEnabled()) {
    logger.warn(
      'Skipping queue notifications: VITE_SMS_ENABLED is not set to true. ' +
      'Set it in .env when the Twilio provider is wired.',
      {
        eventId: event.eventId,
        eventType: event.eventType,
        instructionCount: instructions.length,
      }
    );
    return;
  }

  const deliveries = instructions.map(async instruction => {
    try {
      const route = await channelRouter.resolveForPatient(instruction.patientId);

      if (!route) {
        logger.warn('Skipping notification because patient has no reachable contact channel', {
          eventId: event.eventId,
          eventType: event.eventType,
          patientId: instruction.patientId,
        });
        return;
      }

      const clinicName = await resolveClinicName(event.clinicId);
      const templateVariables = {
        clinicName,
        bookingUrl: '',
        ...instruction.templateVariables,
      };

      await notificationService.send({
        clinicId: event.clinicId,
        patientId: instruction.patientId,
        appointmentId: instruction.appointmentId ?? event.appointmentId,
        channel: route.channel,
        type: instruction.type,
        phoneNumber: route.phoneNumber,
        email: route.email,
        language: route.preferredLanguage,
        templateVariables,
      });

      logger.info('Queue event notification sent', {
        eventId: event.eventId,
        eventType: event.eventType,
        patientId: instruction.patientId,
        channel: route.channel,
        notificationType: instruction.type,
      });
    } catch (error) {
      logger.error('Queue event notification delivery failed for instruction', error as Error, {
        eventId: event.eventId,
        eventType: event.eventType,
        patientId: instruction.patientId,
        notificationType: instruction.type,
      });
    }
  });

  await Promise.allSettled(deliveries);
}

/**
 * Fire notification delivery in the background.
 * The event bus and caller will NOT wait for SMS/email/WhatsApp delivery to complete.
 * Errors are caught and logged internally — no unhandled rejections.
 */
function fireNotification(event: QueueDomainEvent): void {
  handleQueueEventNotification(event).catch((error) => {
    logger.error('Background queue notification failed', error as Error, {
      eventId: event.eventId,
      eventType: event.eventType,
    });
  });
}

/**
 * Initialize all queue event handlers
 */
export function initializeQueueEventHandlers() {
  logger.info('Initializing queue event handlers');

  // Handle patient called - send "YOUR_TURN" notification (fire-and-forget)
  eventBus.subscribe<PatientCalledEvent>(
    QueueEventType.PATIENT_CALLED,
    (event) => {
      logger.debug('Handling PATIENT_CALLED event', { eventId: event.eventId });
      fireNotification(event);
    }
  );

  // Handle patient marked absent - send grace period notification (fire-and-forget)
  eventBus.subscribe<PatientMarkedAbsentEvent>(
    QueueEventType.PATIENT_MARKED_ABSENT,
    (event) => {
      logger.debug('Handling PATIENT_MARKED_ABSENT event', { eventId: event.eventId });
      fireNotification(event);
    }
  );

  // Handle patient added to queue - send confirmation (fire-and-forget)
  eventBus.subscribe<PatientAddedToQueueEvent>(
    QueueEventType.PATIENT_ADDED_TO_QUEUE,
    (event) => {
      logger.debug('Handling PATIENT_ADDED_TO_QUEUE event', { eventId: event.eventId });
      fireNotification(event);
    }
  );

  // Queue-position changed: notification is fire-and-forget, but the downstream
  // TurnApproaching event publish stays synchronous for correct event ordering.
  eventBus.subscribe<QueuePositionChangedEvent>(
    QueueEventType.QUEUE_POSITION_CHANGED,
    async (event) => {
      try {
        logger.debug('Handling QUEUE_POSITION_CHANGED event', { eventId: event.eventId });
        fireNotification(event);

        const crossedApproachingThreshold =
          event.payload.previousPosition > 2 && event.payload.newPosition <= 2;

        if (crossedApproachingThreshold) {
          const turnApproachingEvent = QueueEventFactory.createTurnApproachingEvent({
            clinicId: event.clinicId,
            appointmentId: event.appointmentId,
            patientId: event.payload.patientId,
            previousPosition: event.payload.previousPosition,
            newPosition: event.payload.newPosition,
            changedBy: event.payload.changedBy,
            estimatedWaitMinutes: Math.max(1, event.payload.newPosition * DEFAULT_APPOINTMENT_DURATION_MINUTES),
          });

          await eventBus.publish(turnApproachingEvent);
        }
      } catch (error) {
        logger.error('Failed to handle QUEUE_POSITION_CHANGED event', error as Error, {
          eventId: event.eventId,
        });
      }
    }
  );

  // Handle appointment status changed (fire-and-forget)
  eventBus.subscribe<AppointmentStatusChangedEvent>(
    QueueEventType.APPOINTMENT_STATUS_CHANGED,
    (event) => {
      logger.debug('Handling APPOINTMENT_STATUS_CHANGED event', { eventId: event.eventId });
      fireNotification(event);
    }
  );

  // Handle turn approaching (fire-and-forget)
  eventBus.subscribe<TurnApproachingEvent>(
    QueueEventType.TURN_APPROACHING,
    (event) => {
      logger.debug('Handling TURN_APPROACHING event', { eventId: event.eventId });
      fireNotification(event);
    }
  );

  logger.info('Queue event handlers initialized successfully');
}

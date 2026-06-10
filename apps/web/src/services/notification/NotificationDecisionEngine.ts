/**
 * Notification Decision Engine
 * Determines which queue domain events should produce patient notifications.
 */

import { logger } from '../shared/logging/Logger';
import { AppointmentStatus } from '../queue/models/QueueModels';
import {
  AppointmentStatusChangedEvent,
  PatientAddedToQueueEvent,
  PatientCalledEvent,
  PatientMarkedAbsentEvent,
  QueueDomainEvent,
  QueueEventType,
  QueuePositionChangedEvent,
  TurnApproachingEvent,
} from '../queue/events/QueueEvents';
import { NotificationType } from './models/NotificationModels';

export interface NotificationInstruction {
  patientId: string;
  appointmentId?: string;
  type: NotificationType;
  templateVariables: Record<string, string>;
}

export class NotificationDecisionEngine {
  buildInstructions(event: QueueDomainEvent): NotificationInstruction[] {
    switch (event.eventType) {
      case QueueEventType.PATIENT_ADDED_TO_QUEUE:
        return [this.buildAddedToQueueInstruction(event as PatientAddedToQueueEvent)];

      case QueueEventType.PATIENT_CALLED:
        return [this.buildPatientCalledInstruction(event as PatientCalledEvent)];

      case QueueEventType.PATIENT_MARKED_ABSENT:
        return [this.buildMarkedAbsentInstruction(event as PatientMarkedAbsentEvent)];

      case QueueEventType.QUEUE_POSITION_CHANGED:
        return this.buildPositionChangedInstructions(event as QueuePositionChangedEvent);

      case QueueEventType.TURN_APPROACHING:
        return [this.buildTurnApproachingInstruction(event as TurnApproachingEvent)];

      case QueueEventType.APPOINTMENT_STATUS_CHANGED:
        return this.buildStatusChangedInstructions(event as AppointmentStatusChangedEvent);

      default:
        logger.debug('No notification rule matched for queue event', {
          eventType: event.eventType,
          eventId: event.eventId,
        });
        return [];
    }
  }

  private buildAddedToQueueInstruction(event: PatientAddedToQueueEvent): NotificationInstruction {
    const payload = event.payload;

    return {
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      type: NotificationType.APPOINTMENT_CONFIRMED,
      templateVariables: {
        date: this.formatDate(payload.appointmentDate),
        time: payload.scheduledTime ?? 'TBD',
        position: payload.queuePosition.toString(),
      },
    };
  }

  private buildPatientCalledInstruction(event: PatientCalledEvent): NotificationInstruction {
    const payload = event.payload;

    return {
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      type: NotificationType.YOUR_TURN,
      templateVariables: {
        position: payload.queuePosition.toString(),
      },
    };
  }

  private buildMarkedAbsentInstruction(event: PatientMarkedAbsentEvent): NotificationInstruction {
    const payload = event.payload;

    return {
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      type: NotificationType.PATIENT_ABSENT,
      templateVariables: {
        graceMinutes: this.estimateGraceMinutes(payload.gracePeriodEndsAt).toString(),
      },
    };
  }

  private buildPositionChangedInstructions(event: QueuePositionChangedEvent): NotificationInstruction[] {
    const payload = event.payload;

    // Only notify when the patient effectively moved closer and is near the front.
    if (payload.newPosition >= payload.previousPosition || payload.newPosition > 3) {
      return [];
    }

    // Near-front transitions are handled by TURN_APPROACHING to avoid duplicate alerts.
    if (payload.previousPosition > 2 && payload.newPosition <= 2) {
      return [];
    }

    return [
      {
        patientId: payload.patientId,
        appointmentId: payload.appointmentId,
        type: NotificationType.POSITION_UPDATE,
        templateVariables: {
          position: payload.newPosition.toString(),
          previousPosition: payload.previousPosition.toString(),
        },
      },
    ];
  }

  private buildTurnApproachingInstruction(event: TurnApproachingEvent): NotificationInstruction {
    const payload = event.payload;

    return {
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      type: NotificationType.ALMOST_YOUR_TURN,
      templateVariables: {
        position: payload.newPosition.toString(),
        previousPosition: payload.previousPosition.toString(),
        estimatedWaitMinutes: payload.estimatedWaitMinutes?.toString() ?? '5',
      },
    };
  }

  private buildStatusChangedInstructions(event: AppointmentStatusChangedEvent): NotificationInstruction[] {
    const payload = event.payload;

    switch (payload.newStatus) {
      case AppointmentStatus.CANCELLED:
        return [
          {
            patientId: payload.patientId,
            appointmentId: payload.appointmentId,
            type: NotificationType.APPOINTMENT_CANCELLED,
            templateVariables: {},
          },
        ];

      case AppointmentStatus.RESCHEDULED:
        return [
          {
            patientId: payload.patientId,
            appointmentId: payload.appointmentId,
            type: NotificationType.APPOINTMENT_DELAYED,
            templateVariables: {},
          },
        ];

      case AppointmentStatus.NO_SHOW:
        return [
          {
            patientId: payload.patientId,
            appointmentId: payload.appointmentId,
            type: NotificationType.PATIENT_ABSENT,
            templateVariables: {
              graceMinutes: '0',
            },
          },
        ];

      default:
        return [];
    }
  }

  private estimateGraceMinutes(gracePeriodEndsAt?: string): number {
    if (!gracePeriodEndsAt) {
      return 15;
    }

    const deadline = new Date(gracePeriodEndsAt).getTime();
    if (Number.isNaN(deadline)) {
      return 15;
    }

    const minutes = Math.ceil((deadline - Date.now()) / (60 * 1000));
    return Math.max(minutes, 1);
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('fr-MA').format(date);
  }
}

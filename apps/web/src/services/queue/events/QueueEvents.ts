/**
 * Queue Domain Events
 * Events published when queue state changes
 */

import { DomainEvent, EventBus } from '../../shared/events/EventBus';
import { AppointmentStatus, QueueEntry, SkipReason } from '../models/QueueModels';

// ============================================
// EVENT TYPES
// ============================================

export enum QueueEventType {
  PATIENT_ADDED_TO_QUEUE = 'queue.patient.added',
  PATIENT_CALLED = 'queue.patient.called',
  PATIENT_MARKED_ABSENT = 'queue.patient.marked_absent',
  PATIENT_RETURNED = 'queue.patient.returned',
  PATIENT_CHECKED_IN = 'queue.patient.checked_in',
  QUEUE_POSITION_CHANGED = 'queue.position.changed',
  APPOINTMENT_STATUS_CHANGED = 'queue.appointment.status_changed',
  QUEUE_REORDERED = 'queue.reordered',
  PATIENT_SKIPPED = 'queue.patient.skipped',
  TURN_APPROACHING = 'queue.turn.approaching',
  SLOT_FREED = 'queue.slot.freed',
  GRACE_PERIOD_EXPIRED = 'queue.grace.expired',
  GRACE_PERIOD_ENDING = 'queue.grace.ending',
  WAITLIST_OFFER_SENT = 'queue.waitlist.offer.sent',
  WAITLIST_OFFER_ACCEPTED = 'queue.waitlist.offer.accepted',
  WAITLIST_OFFER_DECLINED = 'queue.waitlist.offer.declined',
  WAITLIST_OFFER_EXPIRED = 'queue.waitlist.offer.expired',
}

// ============================================
// BASE QUEUE EVENT
// ============================================

export interface QueueDomainEvent extends DomainEvent {
  clinicId: string;
  appointmentId: string;
}

// ============================================
// SPECIFIC EVENTS
// ============================================

/**
 * Patient Added to Queue Event
 */
export interface PatientAddedToQueueEvent extends QueueDomainEvent {
  eventType: QueueEventType.PATIENT_ADDED_TO_QUEUE;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    queuePosition: number;
    appointmentDate: string;
    scheduledTime?: string;
  };
}

/**
 * Patient Called Event
 * Triggered when a patient is called to the consultation room
 */
export interface PatientCalledEvent extends QueueDomainEvent {
  eventType: QueueEventType.PATIENT_CALLED;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    queuePosition: number;
    calledBy: string;
    calledAt: string;
  };
}

/**
 * Patient Marked Absent Event
 */
export interface PatientMarkedAbsentEvent extends QueueDomainEvent {
  eventType: QueueEventType.PATIENT_MARKED_ABSENT;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    markedBy: string;
    markedAt: string;
    gracePeriodEndsAt?: string;
    previousPosition: number;
  };
}

/**
 * Patient Returned Event
 * Triggered when an absent patient returns
 */
export interface PatientReturnedEvent extends QueueDomainEvent {
  eventType: QueueEventType.PATIENT_RETURNED;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    newPosition: number;
    returnedAt: string;
  };
}

/**
 * Patient Checked In Event
 */
export interface PatientCheckedInEvent extends QueueDomainEvent {
  eventType: QueueEventType.PATIENT_CHECKED_IN;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    checkedInAt: string;
    queuePosition: number;
  };
}

/**
 * Queue Position Changed Event
 */
export interface QueuePositionChangedEvent extends QueueDomainEvent {
  eventType: QueueEventType.QUEUE_POSITION_CHANGED;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    previousPosition: number;
    newPosition: number;
    changedBy: string;
    reason?: string;
  };
}

/**
 * Appointment Status Changed Event
 */
export interface AppointmentStatusChangedEvent extends QueueDomainEvent {
  eventType: QueueEventType.APPOINTMENT_STATUS_CHANGED;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    previousStatus: AppointmentStatus;
    newStatus: AppointmentStatus;
    changedBy?: string;
    changedAt: string;
  };
}

/**
 * Queue Reordered Event
 * Triggered when multiple queue positions are changed at once
 */
export interface QueueReorderedEvent extends QueueDomainEvent {
  eventType: QueueEventType.QUEUE_REORDERED;
  payload: {
    clinicId: string;
    appointmentId: string;
    affectedAppointments: Array<{
      appointmentId: string;
      previousPosition: number;
      newPosition: number;
    }>;
    performedBy: string;
    reason?: string;
  };
}

/**
 * Patient Skipped Event
 * Triggered when a patient is skipped in the queue
 */
export interface PatientSkippedEvent extends QueueDomainEvent {
  eventType: QueueEventType.PATIENT_SKIPPED;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    skipReason: SkipReason;
    skipCount: number;
    skippedBy: string;
  };
}

/**
 * Turn Approaching Event
 * Triggered when a patient crosses into the front-of-queue threshold.
 */
export interface TurnApproachingEvent extends QueueDomainEvent {
  eventType: QueueEventType.TURN_APPROACHING;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    previousPosition: number;
    newPosition: number;
    estimatedWaitMinutes?: number;
  };
}

/**
 * Slot Freed Event
 * Triggered when a gap opens due to cancellation, no-show, or early completion.
 */
export interface SlotFreedEvent extends QueueDomainEvent {
  eventType: QueueEventType.SLOT_FREED;
  payload: {
    appointmentId: string;
    clinicId: string;
    staffId?: string;
    gapStartTime: string;
    gapEndTime: string;
    reason?: string;
  };
}

/**
 * Grace Period Expired Event
 */
export interface GracePeriodExpiredEvent extends QueueDomainEvent {
  eventType: QueueEventType.GRACE_PERIOD_EXPIRED;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    gracePeriodEndedAt: string;
  };
}

/**
 * Grace Period Ending Event
 * Triggered shortly before the grace period expires (e.g. 5 min before).
 */
export interface GracePeriodEndingEvent extends QueueDomainEvent {
  eventType: QueueEventType.GRACE_PERIOD_ENDING;
  payload: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    gracePeriodEndsAt: string;
    remainingMinutes: number;
  };
}

/**
 * Waitlist Offer Events
 */
export interface WaitlistOfferSentEvent extends QueueDomainEvent {
  eventType: QueueEventType.WAITLIST_OFFER_SENT;
  payload: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
    offeredSlotStart: string;
    offeredSlotEnd: string;
    expiresAt: string;
  };
}

export interface WaitlistOfferAcceptedEvent extends QueueDomainEvent {
  eventType: QueueEventType.WAITLIST_OFFER_ACCEPTED;
  payload: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
    respondedAt: string;
  };
}

export interface WaitlistOfferDeclinedEvent extends QueueDomainEvent {
  eventType: QueueEventType.WAITLIST_OFFER_DECLINED;
  payload: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
    declinedAt: string;
  };
}

export interface WaitlistOfferExpiredEvent extends QueueDomainEvent {
  eventType: QueueEventType.WAITLIST_OFFER_EXPIRED;
  payload: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
    expiredAt: string;
  };
}

// ============================================
// EVENT FACTORY FUNCTIONS
// ============================================

export class QueueEventFactory {
  static createPatientAddedEvent(
    entry: QueueEntry,
    userId?: string
  ): PatientAddedToQueueEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.PATIENT_ADDED_TO_QUEUE,
      timestamp: new Date(),
      userId,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        queuePosition: entry.queuePosition,
        appointmentDate: entry.appointmentDate.toISOString(),
        scheduledTime: entry.scheduledTime,
      },
    };
  }

  static createPatientCalledEvent(
    entry: QueueEntry,
    calledBy: string
  ): PatientCalledEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.PATIENT_CALLED,
      timestamp: new Date(),
      userId: calledBy,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        queuePosition: entry.queuePosition,
        calledBy,
        calledAt: new Date().toISOString(),
      },
    };
  }

  static createPatientMarkedAbsentEvent(
    entry: QueueEntry,
    markedBy: string,
    gracePeriodEndsAt?: Date
  ): PatientMarkedAbsentEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.PATIENT_MARKED_ABSENT,
      timestamp: new Date(),
      userId: markedBy,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        markedBy,
        markedAt: new Date().toISOString(),
        gracePeriodEndsAt: gracePeriodEndsAt?.toISOString(),
        previousPosition: entry.queuePosition,
      },
    };
  }

  static createPatientReturnedEvent(
    entry: QueueEntry,
    newPosition: number
  ): PatientReturnedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.PATIENT_RETURNED,
      timestamp: new Date(),
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        newPosition,
        returnedAt: new Date().toISOString(),
      },
    };
  }

  static createPatientCheckedInEvent(entry: QueueEntry): PatientCheckedInEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.PATIENT_CHECKED_IN,
      timestamp: new Date(),
      userId: entry.patientId,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        checkedInAt: new Date().toISOString(),
        queuePosition: entry.queuePosition,
      },
    };
  }

  static createQueuePositionChangedEvent(
    entry: QueueEntry,
    previousPosition: number,
    changedBy: string,
    reason?: string
  ): QueuePositionChangedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.QUEUE_POSITION_CHANGED,
      timestamp: new Date(),
      userId: changedBy,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        previousPosition,
        newPosition: entry.queuePosition,
        changedBy,
        reason,
      },
    };
  }

  static createTurnApproachingEvent(params: {
    clinicId: string;
    appointmentId: string;
    patientId: string;
    previousPosition: number;
    newPosition: number;
    changedBy?: string;
    estimatedWaitMinutes?: number;
  }): TurnApproachingEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.TURN_APPROACHING,
      timestamp: new Date(),
      userId: params.changedBy,
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        previousPosition: params.previousPosition,
        newPosition: params.newPosition,
        estimatedWaitMinutes: params.estimatedWaitMinutes,
      },
    };
  }

  static createAppointmentStatusChangedEvent(
    entry: QueueEntry,
    previousStatus: AppointmentStatus,
    changedBy?: string
  ): AppointmentStatusChangedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.APPOINTMENT_STATUS_CHANGED,
      timestamp: new Date(),
      userId: changedBy,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        previousStatus,
        newStatus: entry.status,
        changedBy,
        changedAt: new Date().toISOString(),
      },
    };
  }

  static createPatientSkippedEvent(
    entry: QueueEntry,
    skipReason: SkipReason,
    skippedBy: string
  ): PatientSkippedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.PATIENT_SKIPPED,
      timestamp: new Date(),
      userId: skippedBy,
      clinicId: entry.clinicId,
      appointmentId: entry.id,
      payload: {
        appointmentId: entry.id,
        patientId: entry.patientId,
        clinicId: entry.clinicId,
        skipReason,
        skipCount: entry.skipCount,
        skippedBy,
      },
    };
  }

  static createSlotFreedEvent(params: {
    appointmentId: string;
    clinicId: string;
    staffId?: string;
    gapStartTime: string;
    gapEndTime: string;
    reason?: string;
  }): SlotFreedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.SLOT_FREED,
      timestamp: new Date(),
      userId: params.staffId,
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        appointmentId: params.appointmentId,
        clinicId: params.clinicId,
        staffId: params.staffId,
        gapStartTime: params.gapStartTime,
        gapEndTime: params.gapEndTime,
        reason: params.reason,
      },
    };
  }

  static createGracePeriodExpiredEvent(params: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    gracePeriodEndedAt: string;
  }): GracePeriodExpiredEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.GRACE_PERIOD_EXPIRED,
      timestamp: new Date(),
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        gracePeriodEndedAt: params.gracePeriodEndedAt,
      },
    };
  }

  static createGracePeriodEndingEvent(params: {
    appointmentId: string;
    patientId: string;
    clinicId: string;
    gracePeriodEndsAt: string;
    remainingMinutes: number;
  }): GracePeriodEndingEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.GRACE_PERIOD_ENDING,
      timestamp: new Date(),
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        gracePeriodEndsAt: params.gracePeriodEndsAt,
        remainingMinutes: params.remainingMinutes,
      },
    };
  }

  static createWaitlistOfferSentEvent(params: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
    offeredSlotStart: string;
    offeredSlotEnd: string;
    expiresAt: string;
  }): WaitlistOfferSentEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.WAITLIST_OFFER_SENT,
      timestamp: new Date(),
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        waitlistId: params.waitlistId,
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        offeredSlotStart: params.offeredSlotStart,
        offeredSlotEnd: params.offeredSlotEnd,
        expiresAt: params.expiresAt,
      },
    };
  }

  static createWaitlistOfferAcceptedEvent(params: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
  }): WaitlistOfferAcceptedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.WAITLIST_OFFER_ACCEPTED,
      timestamp: new Date(),
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        waitlistId: params.waitlistId,
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        respondedAt: new Date().toISOString(),
      },
    };
  }

  static createWaitlistOfferDeclinedEvent(params: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
  }): WaitlistOfferDeclinedEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.WAITLIST_OFFER_DECLINED,
      timestamp: new Date(),
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        waitlistId: params.waitlistId,
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        declinedAt: new Date().toISOString(),
      },
    };
  }

  static createWaitlistOfferExpiredEvent(params: {
    waitlistId: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
  }): WaitlistOfferExpiredEvent {
    return {
      eventId: EventBus.generateEventId(),
      eventType: QueueEventType.WAITLIST_OFFER_EXPIRED,
      timestamp: new Date(),
      clinicId: params.clinicId,
      appointmentId: params.appointmentId,
      payload: {
        waitlistId: params.waitlistId,
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        clinicId: params.clinicId,
        expiredAt: new Date().toISOString(),
      },
    };
  }
}

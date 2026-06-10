import { describe, expect, it, vi } from 'vitest';
import { NotificationDecisionEngine } from './NotificationDecisionEngine';
import {
  QueueEventType,
  type QueuePositionChangedEvent,
  type TurnApproachingEvent,
} from '../queue/events/QueueEvents';
import { NotificationType } from './models/NotificationModels';

describe('NotificationDecisionEngine', () => {
  it('returns position update when patient moves closer but not into turn-approaching threshold', () => {
    const engine = new NotificationDecisionEngine();

    const event: QueuePositionChangedEvent = {
      eventId: 'evt-position-1',
      eventType: QueueEventType.QUEUE_POSITION_CHANGED,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-1',
      payload: {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        previousPosition: 5,
        newPosition: 3,
        changedBy: 'staff-1',
      },
    };

    const instructions = engine.buildInstructions(event);

    expect(instructions).toHaveLength(1);
    expect(instructions[0].type).toBe(NotificationType.POSITION_UPDATE);
    expect(instructions[0].templateVariables.position).toBe('3');
  });

  it('suppresses near-front position update when turn-approaching event should handle alert', () => {
    const engine = new NotificationDecisionEngine();

    const event: QueuePositionChangedEvent = {
      eventId: 'evt-position-2',
      eventType: QueueEventType.QUEUE_POSITION_CHANGED,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-2',
      payload: {
        appointmentId: 'appointment-2',
        patientId: 'patient-2',
        clinicId: 'clinic-1',
        previousPosition: 4,
        newPosition: 2,
        changedBy: 'staff-1',
      },
    };

    const instructions = engine.buildInstructions(event);

    expect(instructions).toHaveLength(0);
  });

  it('creates almost-your-turn notification from TURN_APPROACHING event', () => {
    const engine = new NotificationDecisionEngine();
    vi.useFakeTimers();

    const event: TurnApproachingEvent = {
      eventId: 'evt-turn-1',
      eventType: QueueEventType.TURN_APPROACHING,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-3',
      payload: {
        appointmentId: 'appointment-3',
        patientId: 'patient-3',
        clinicId: 'clinic-1',
        previousPosition: 5,
        newPosition: 2,
        estimatedWaitMinutes: 10,
      },
    };

    const instructions = engine.buildInstructions(event);

    expect(instructions).toHaveLength(1);
    expect(instructions[0].type).toBe(NotificationType.ALMOST_YOUR_TURN);
    expect(instructions[0].templateVariables.position).toBe('2');
    expect(instructions[0].templateVariables.estimatedWaitMinutes).toBe('10');

    vi.useRealTimers();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../shared/logging/Logger';

vi.mock('../../shared/logging/Logger');
import { eventBus } from '../../shared/events/EventBus';
import { NotificationService } from '../../notification/NotificationService';
import { ChannelRouter } from '../../notification/channels/ChannelRouter';
import { NotificationType } from '../../notification/models/NotificationModels';
import { NotificationDecisionEngine } from '../../notification/NotificationDecisionEngine';
import { QueueEventType, type QueuePositionChangedEvent } from '../events/QueueEvents';
import { initializeQueueEventHandlers } from './QueueEventHandlers';

vi.mock('../../shared/events/EventBus');
vi.mock('../../notification/NotificationService');
vi.mock('../../notification/channels/ChannelRouter');
vi.mock('../../notification/NotificationDecisionEngine');

describe('QueueEventHandlers', () => {
  let subscriptions: Map<string, (event: any) => Promise<void> | void>;

  /** Flush pending microtasks (Promise callbacks, async function continuations). */
  async function flushMicrotasks(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    vi.stubEnv('VITE_SMS_ENABLED', 'true');
    subscriptions = new Map();

    vi.mocked(eventBus.subscribe).mockImplementation((eventType: string, handler: any) => {
      subscriptions.set(eventType, handler);
      return vi.fn();
    });

    vi.mocked(ChannelRouter.prototype.resolveForPatient).mockResolvedValue({
      channel: 'sms' as any,
      phoneNumber: '+212600000000',
      preferredLanguage: 'fr',
    });

    vi.mocked(eventBus.publish).mockResolvedValue(undefined);
    vi.mocked(NotificationService.prototype.send).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('continues sending notifications when one instruction fails', async () => {
    initializeQueueEventHandlers();

    const handler = subscriptions.get(QueueEventType.QUEUE_POSITION_CHANGED);
    expect(handler).toBeDefined();

    vi.mocked(NotificationDecisionEngine.prototype.buildInstructions).mockReturnValue([
      {
        patientId: 'patient-1',
        appointmentId: 'appointment-1',
        type: NotificationType.ALMOST_YOUR_TURN,
        templateVariables: { position: '2' },
      },
      {
        patientId: 'patient-1',
        appointmentId: 'appointment-1',
        type: NotificationType.POSITION_UPDATE,
        templateVariables: { position: '2', previousPosition: '4' },
      },
    ]);

    vi.mocked(NotificationService.prototype.send)
      .mockRejectedValueOnce(new Error('first send fails'))
      .mockResolvedValueOnce({} as any);

    const event: QueuePositionChangedEvent = {
      eventId: 'evt-1',
      eventType: QueueEventType.QUEUE_POSITION_CHANGED,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-1',
      payload: {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        previousPosition: 4,
        newPosition: 2,
        changedBy: 'staff-1',
      },
    };

    await handler?.(event);
    // Notifications fire in the background — flush microtasks so the mock assertions
    // below see the completed send calls.
    await flushMicrotasks();

    expect(NotificationService.prototype.send).toHaveBeenCalledTimes(2);
    expect(NotificationService.prototype.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        patientId: 'patient-1',
        type: NotificationType.ALMOST_YOUR_TURN,
      })
    );
    expect(NotificationService.prototype.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        patientId: 'patient-1',
        type: NotificationType.POSITION_UPDATE,
      })
    );
  });

  it('publishes TURN_APPROACHING event when queue position crosses front threshold', async () => {
    initializeQueueEventHandlers();

    const handler = subscriptions.get(QueueEventType.QUEUE_POSITION_CHANGED);
    expect(handler).toBeDefined();

    vi.mocked(NotificationDecisionEngine.prototype.buildInstructions).mockReturnValue([]);

    const event: QueuePositionChangedEvent = {
      eventId: 'evt-2',
      eventType: QueueEventType.QUEUE_POSITION_CHANGED,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-2',
      payload: {
        appointmentId: 'appointment-2',
        patientId: 'patient-2',
        clinicId: 'clinic-1',
        previousPosition: 5,
        newPosition: 2,
        changedBy: 'staff-2',
      },
    };

    await handler?.(event);

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: QueueEventType.TURN_APPROACHING,
        clinicId: 'clinic-1',
        appointmentId: 'appointment-2',
        payload: expect.objectContaining({
          patientId: 'patient-2',
          previousPosition: 5,
          newPosition: 2,
        }),
      })
    );
  });
});

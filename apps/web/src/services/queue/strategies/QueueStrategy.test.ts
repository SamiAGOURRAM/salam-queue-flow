import { describe, expect, it } from 'vitest';
import { AppointmentStatus, QueueMode } from '../models/QueueModels';
import { createMockQueueEntry } from '../../../test/utils/testHelpers';
import {
  FluidQueueStrategy,
  HybridQueueStrategy,
  QueueStrategyFactory,
  SlottedQueueStrategy,
} from './QueueStrategy';

describe('QueueStrategy late-arrival handling', () => {
  it('returns original position in slotted mode when original slot is available', async () => {
    const strategy = new SlottedQueueStrategy();

    const appointment = createMockQueueEntry({
      id: 'late-1',
      scheduledTime: '10:30',
      queuePosition: 3,
      status: AppointmentStatus.WAITING,
    });

    const schedule = [
      createMockQueueEntry({ id: 'a-1', scheduledTime: '10:00', queuePosition: 1 }),
      createMockQueueEntry({ id: 'a-2', scheduledTime: '10:15', queuePosition: 2 }),
    ];

    const action = await strategy.handleLateArrival(appointment, schedule);

    expect(action.action).toBe('insert');
    expect(action.targetPosition).toBe(3);
    expect(action.reason).toContain('Original scheduled slot');
  });

  it('re-inserts at end in slotted mode when original slot is occupied', async () => {
    const strategy = new SlottedQueueStrategy();

    const appointment = createMockQueueEntry({
      id: 'late-2',
      scheduledTime: '10:30',
      queuePosition: 3,
      status: AppointmentStatus.WAITING,
    });

    const schedule = [
      createMockQueueEntry({ id: 'a-1', scheduledTime: '10:00', queuePosition: 1 }),
      createMockQueueEntry({ id: 'a-2', scheduledTime: '10:15', queuePosition: 2 }),
      createMockQueueEntry({
        id: 'occupier',
        scheduledTime: '10:30',
        queuePosition: 4,
        status: AppointmentStatus.WAITING,
      }),
    ];

    const action = await strategy.handleLateArrival(appointment, schedule);

    expect(action.action).toBe('insert');
    expect(action.targetPosition).toBe(5);
    expect(action.reason).toContain('unavailable');
  });

  it('applies fluid mode late-arrival penalty by sending patient to end', async () => {
    const strategy = new FluidQueueStrategy();

    const appointment = createMockQueueEntry({
      id: 'late-fluid-1',
      queuePosition: 2,
      status: AppointmentStatus.WAITING,
    });

    const schedule = [
      createMockQueueEntry({ id: 'f-1', queuePosition: 1 }),
      createMockQueueEntry({ id: 'f-2', queuePosition: 2 }),
      createMockQueueEntry({ id: 'f-3', queuePosition: 3 }),
    ];

    const action = await strategy.handleLateArrival(appointment, schedule);

    expect(action.action).toBe('insert');
    expect(action.targetPosition).toBe(4);
    expect(action.reason).toContain('penalty');
  });

  it('returns strategy instances from factory by queue mode', () => {
    expect(QueueStrategyFactory.getStrategy(QueueMode.SLOTTED)).toBeInstanceOf(SlottedQueueStrategy);
    expect(QueueStrategyFactory.getStrategy(QueueMode.FLUID)).toBeInstanceOf(FluidQueueStrategy);
    expect(QueueStrategyFactory.getStrategy(QueueMode.HYBRID)).toBeInstanceOf(HybridQueueStrategy);
  });

  it('prefers overflow lane in hybrid mode when next slot is in the future', async () => {
    const strategy = new HybridQueueStrategy();
    const appointmentDate = new Date('2026-04-20T00:00:00.000Z');

    const schedule = [
      createMockQueueEntry({
        id: 'scheduled-future',
        appointmentDate,
        scheduledTime: '18:30',
        queuePosition: 1,
        isPresent: true,
        status: AppointmentStatus.WAITING,
      }),
      createMockQueueEntry({
        id: 'overflow-now',
        appointmentDate,
        scheduledTime: undefined,
        queuePosition: 2,
        isPresent: true,
        status: AppointmentStatus.WAITING,
        priorityScore: 5,
      }),
    ];

    const next = await strategy.getNextPatient(schedule, {
      clinicId: 'clinic-1',
      currentTime: new Date('2026-04-20T09:00:00.000Z'),
    });

    expect(next?.patient.id).toBe('overflow-now');
    expect(next?.reason).toContain('Overflow lane');
  });

  it('delegates hybrid late-arrival handling by lane type', async () => {
    const strategy = new HybridQueueStrategy();

    const scheduledLateArrival = createMockQueueEntry({
      id: 'hybrid-scheduled',
      scheduledTime: '10:45',
      queuePosition: 2,
      status: AppointmentStatus.WAITING,
    });

    const overflowLateArrival = createMockQueueEntry({
      id: 'hybrid-overflow',
      scheduledTime: undefined,
      queuePosition: 2,
      status: AppointmentStatus.WAITING,
    });

    const schedule = [
      createMockQueueEntry({ id: 'lane-1', queuePosition: 1 }),
      createMockQueueEntry({ id: 'lane-2', queuePosition: 2 }),
      createMockQueueEntry({ id: 'lane-3', queuePosition: 3 }),
    ];

    const scheduledAction = await strategy.handleLateArrival(scheduledLateArrival, schedule);
    const overflowAction = await strategy.handleLateArrival(overflowLateArrival, schedule);

    expect(scheduledAction.targetPosition).toBeGreaterThan(0);
    expect(scheduledAction.reason).toContain('slot');

    expect(overflowAction.targetPosition).toBe(4);
    expect(overflowAction.reason).toContain('fluid mode');
  });
});

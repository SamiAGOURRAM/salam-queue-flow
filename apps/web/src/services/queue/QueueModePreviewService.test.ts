import { describe, expect, it } from 'vitest';
import { QueueMode, AppointmentStatus } from './models/QueueModels';
import { createMockQueueEntry } from '@/test/utils/testHelpers';
import { previewQueueModeTransition } from './QueueModePreviewService';

describe('QueueModePreviewService', () => {
  it('projects slotted mode by chronological scheduled time', () => {
    const appointmentDate = new Date('2026-04-20T00:00:00.000Z');

    const schedule = [
      createMockQueueEntry({
        id: 'late-slot',
        appointmentDate,
        queuePosition: 1,
        scheduledTime: '11:00',
        status: AppointmentStatus.WAITING,
      }),
      createMockQueueEntry({
        id: 'early-slot',
        appointmentDate,
        queuePosition: 2,
        scheduledTime: '09:00',
        status: AppointmentStatus.WAITING,
      }),
    ];

    const preview = previewQueueModeTransition(schedule, QueueMode.SLOTTED, new Date('2026-04-20T08:00:00.000Z'));

    expect(preview.projectedOrder[0]?.appointmentId).toBe('early-slot');
    expect(preview.projectedOrder[1]?.appointmentId).toBe('late-slot');
    expect(preview.movedCount).toBe(2);
  });

  it('projects fluid mode by descending priority score', () => {
    const schedule = [
      createMockQueueEntry({
        id: 'normal-priority',
        queuePosition: 1,
        status: AppointmentStatus.WAITING,
        priorityScore: 1,
        scheduledTime: undefined,
      }),
      createMockQueueEntry({
        id: 'high-priority',
        queuePosition: 2,
        status: AppointmentStatus.WAITING,
        priorityScore: 8,
        scheduledTime: undefined,
      }),
    ];

    const preview = previewQueueModeTransition(schedule, QueueMode.FLUID);

    expect(preview.projectedOrder[0]?.appointmentId).toBe('high-priority');
    expect(preview.projectedOrder[1]?.appointmentId).toBe('normal-priority');
    expect(preview.movedCount).toBe(2);
  });

  it('projects hybrid mode with due slots first, overflow second, future slots last', () => {
    const appointmentDate = new Date('2026-04-20T00:00:00.000Z');

    const schedule = [
      createMockQueueEntry({
        id: 'future-slot',
        appointmentDate,
        queuePosition: 1,
        scheduledTime: '16:00',
        status: AppointmentStatus.WAITING,
        isPresent: true,
      }),
      createMockQueueEntry({
        id: 'overflow-lane',
        appointmentDate,
        queuePosition: 2,
        scheduledTime: undefined,
        status: AppointmentStatus.WAITING,
        isPresent: true,
        priorityScore: 6,
      }),
      createMockQueueEntry({
        id: 'due-slot',
        appointmentDate,
        queuePosition: 3,
        scheduledTime: '09:00',
        status: AppointmentStatus.WAITING,
        isPresent: true,
      }),
    ];

    const preview = previewQueueModeTransition(schedule, QueueMode.HYBRID, new Date('2026-04-20T10:00:00.000Z'));

    expect(preview.projectedOrder.map((entry) => entry.appointmentId)).toEqual([
      'due-slot',
      'overflow-lane',
      'future-slot',
    ]);
    expect(preview.movedCount).toBe(2);
  });
});

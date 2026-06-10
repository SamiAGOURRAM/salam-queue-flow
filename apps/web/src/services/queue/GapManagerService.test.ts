import { describe, expect, it, vi } from 'vitest';
import { GapManagerService } from './GapManagerService';
import { QueueRepository } from './repositories/QueueRepository';
import { QueueService } from './QueueService';
import { WaitlistService } from './WaitlistService';
import { AppointmentStatus, QueueMode, type WaitlistEntry, WaitlistStatus } from './models/QueueModels';
import { createMockQueueEntry } from '../../test/utils/testHelpers';

describe('GapManagerService', () => {
  it('fills gap with early bird using explicit HH:mm formatting', async () => {
    const earlyBird = createMockQueueEntry({
      id: 'appointment-early-bird',
      clinicId: 'clinic-1',
      status: AppointmentStatus.WAITING,
      isPresent: true,
      scheduledTime: '23:59',
      appointmentDate: new Date('2026-01-01T00:00:00.000Z'),
      priorityScore: 40,
    });

    const getDailySchedule = vi.fn().mockResolvedValue({
      queue_mode: QueueMode.SLOTTED,
      schedule: [earlyBird],
    });

    const updateQueueEntry = vi.fn().mockResolvedValue({
      ...earlyBird,
      scheduledTime: '10:05',
      isGapFiller: true,
      priorityScore: 60,
    });

    const queueRepository: Partial<QueueRepository> = {
      getDailySchedule,
      updateQueueEntry,
    };

    const waitlistService: Partial<WaitlistService> = {
      getClinicWaitlist: vi.fn().mockResolvedValue([]),
      promoteToAppointment: vi.fn().mockResolvedValue(undefined),
    };

    const service = new GapManagerService(
      queueRepository as QueueRepository,
      waitlistService as WaitlistService,
      {} as QueueService
    );

    const gapStartTime = new Date('2026-01-01T10:05:33.000Z');
    const gapEndTime = new Date('2026-01-01T10:25:33.000Z');
    const expectedTime = `${gapStartTime.getHours().toString().padStart(2, '0')}:${gapStartTime
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await service.handleGap('clinic-1', gapStartTime, gapEndTime, 'staff-1');

    confirmSpy.mockRestore();

    expect(updateQueueEntry).toHaveBeenCalledWith(
      'appointment-early-bird',
      expect.objectContaining({
        scheduledTime: expectedTime,
        isGapFiller: true,
        priorityScore: 60,
      })
    );

    expect(waitlistService.promoteToAppointment).not.toHaveBeenCalled();
  });

  it('does not auto-promote early bird when confirmation is declined', async () => {
    const earlyBird = createMockQueueEntry({
      id: 'appointment-early-bird',
      clinicId: 'clinic-1',
      status: AppointmentStatus.WAITING,
      isPresent: true,
      scheduledTime: '23:59',
      appointmentDate: new Date('2026-01-01T00:00:00.000Z'),
      priorityScore: 40,
    });

    const updateQueueEntry = vi.fn().mockResolvedValue({
      ...earlyBird,
      scheduledTime: '10:05',
      isGapFiller: true,
      priorityScore: 60,
    });

    const queueRepository: Partial<QueueRepository> = {
      getDailySchedule: vi.fn().mockResolvedValue({
        queue_mode: QueueMode.SLOTTED,
        schedule: [earlyBird],
      }),
      updateQueueEntry,
    };

    const waitlistService: Partial<WaitlistService> = {
      getClinicWaitlist: vi.fn().mockResolvedValue([]),
      promoteToAppointment: vi.fn().mockResolvedValue(undefined),
    };

    const service = new GapManagerService(
      queueRepository as QueueRepository,
      waitlistService as WaitlistService,
      {} as QueueService
    );

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await service.handleGap(
      'clinic-1',
      new Date('2026-01-01T10:05:00.000Z'),
      new Date('2026-01-01T10:25:00.000Z'),
      'staff-1'
    );

    confirmSpy.mockRestore();

    expect(updateQueueEntry).not.toHaveBeenCalled();
    expect(waitlistService.promoteToAppointment).not.toHaveBeenCalled();
  });

  it('promotes from waitlist when no early bird is available', async () => {
    const waitingNotPresent = createMockQueueEntry({
      id: 'appointment-waiting',
      clinicId: 'clinic-1',
      status: AppointmentStatus.WAITING,
      isPresent: false,
      scheduledTime: '09:30',
      appointmentDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    const waitlistCandidate: WaitlistEntry = {
      id: 'waitlist-1',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      requestedDate: new Date('2026-01-01T00:00:00.000Z'),
      requestedTimeRangeStart: undefined,
      requestedTimeRangeEnd: undefined,
      priorityScore: 100,
      status: WaitlistStatus.WAITING,
      createdAt: new Date('2026-01-01T08:00:00.000Z'),
      updatedAt: new Date('2026-01-01T08:00:00.000Z'),
      notes: undefined,
    };

    const queueRepository: Partial<QueueRepository> = {
      getDailySchedule: vi.fn().mockResolvedValue({
        queue_mode: QueueMode.SLOTTED,
        schedule: [waitingNotPresent],
      }),
      updateQueueEntry: vi.fn(),
    };

    const waitlistService: Partial<WaitlistService> = {
      getClinicWaitlist: vi.fn().mockResolvedValue([waitlistCandidate]),
      promoteToAppointment: vi.fn().mockResolvedValue(undefined),
    };

    const service = new GapManagerService(
      queueRepository as QueueRepository,
      waitlistService as WaitlistService,
      {} as QueueService
    );

    const gapStartTime = new Date('2026-01-01T10:05:00.000Z');
    const gapEndTime = new Date('2026-01-01T10:25:00.000Z');

    await service.handleGap('clinic-1', gapStartTime, gapEndTime, 'staff-1');

    expect(waitlistService.promoteToAppointment).toHaveBeenCalledWith(
      'waitlist-1',
      'staff-1',
      gapStartTime,
      gapEndTime
    );
  });
});

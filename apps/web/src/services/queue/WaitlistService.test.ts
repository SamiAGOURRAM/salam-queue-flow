import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueConfig } from '@/config/QueueConfig';
import { WaitlistService } from './WaitlistService';
import { WaitlistRepository } from './repositories/WaitlistRepository';
import { QueueService } from './QueueService';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { WaitlistStatus, type WaitlistEntry } from './models/QueueModels';
import { createMockQueueEntry } from '../../test/utils/testHelpers';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let getWaitlistEntryById: ReturnType<typeof vi.fn>;
  let claimForPromotion: ReturnType<typeof vi.fn>;
  let updateStatus: ReturnType<typeof vi.fn>;
  let createAppointment: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    getWaitlistEntryById = vi.fn();
  claimForPromotion = vi.fn();
    updateStatus = vi.fn().mockResolvedValue(undefined);
    createAppointment = vi.fn().mockResolvedValue(createMockQueueEntry({ id: 'new-appointment-1' }));

    const repository = {
      getWaitlistEntryById,
      claimForPromotion,
      updateStatus,
    } as Partial<WaitlistRepository>;

    const queueService = {
      createAppointment,
    } as Partial<QueueService>;

    service = new WaitlistService(repository as WaitlistRepository, queueService as QueueService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates an appointment and marks the waitlist entry as promoted', async () => {
    const entry: WaitlistEntry = {
      id: 'waitlist-1',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      requestedDate: new Date('2026-01-01T00:00:00.000Z'),
      requestedTimeRangeStart: undefined,
      requestedTimeRangeEnd: undefined,
      priorityScore: 100,
      status: WaitlistStatus.WAITING,
      createdAt: new Date('2026-01-01T09:00:00.000Z'),
      updatedAt: new Date('2026-01-01T09:00:00.000Z'),
      notes: 'priority patient',
    };

    getWaitlistEntryById.mockResolvedValue(entry);
    claimForPromotion.mockResolvedValue({
      ...entry,
      status: WaitlistStatus.PROMOTED,
    });

    const staleStart = new Date('2026-01-01T09:30:00.000Z');
    const invalidEnd = new Date('2026-01-01T09:29:00.000Z');

    await service.promoteToAppointment(entry.id, 'staff-1', staleStart, invalidEnd);

    expect(createAppointment).toHaveBeenCalledTimes(1);
    const dto = createAppointment.mock.calls[0][0];
    expect(dto.clinicId).toBe('clinic-1');
    expect(dto.patientId).toBe('patient-1');
    expect(dto.staffId).toBe('staff-1');
    expect(dto.isWalkIn).toBe(true);
    expect(dto.isGapFiller).toBe(true);
    expect(dto.promotedFromWaitlist).toBe(true);
    expect(new Date(dto.startTime).toISOString()).toBe(new Date('2026-01-01T10:00:00.000Z').toISOString());

    const expectedDurationMs = QueueConfig.DEFAULTS.DEFAULT_APPOINTMENT_DURATION_MINUTES * 60_000;
    expect(new Date(dto.endTime).getTime() - new Date(dto.startTime).getTime()).toBe(expectedDurationMs);

    expect(claimForPromotion).toHaveBeenCalledWith('waitlist-1');
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('throws not found error when waitlist entry does not exist', async () => {
    getWaitlistEntryById.mockResolvedValue(null);

    await expect(
      service.promoteToAppointment('missing-waitlist', 'staff-1', new Date(), new Date(Date.now() + 60_000))
    ).rejects.toThrow(NotFoundError);

    expect(createAppointment).not.toHaveBeenCalled();
    expect(claimForPromotion).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('throws validation error when waitlist entry has no linked patient', async () => {
    const entryWithoutPatient: WaitlistEntry = {
      id: 'waitlist-2',
      clinicId: 'clinic-1',
      patientId: undefined,
      requestedDate: new Date('2026-01-01T00:00:00.000Z'),
      requestedTimeRangeStart: undefined,
      requestedTimeRangeEnd: undefined,
      priorityScore: 100,
      status: WaitlistStatus.WAITING,
      createdAt: new Date('2026-01-01T09:00:00.000Z'),
      updatedAt: new Date('2026-01-01T09:00:00.000Z'),
      notes: undefined,
    };

    getWaitlistEntryById.mockResolvedValue(entryWithoutPatient);

    await expect(
      service.promoteToAppointment(entryWithoutPatient.id, 'staff-1', new Date(), new Date(Date.now() + 60_000))
    ).rejects.toThrow(ValidationError);

    expect(createAppointment).not.toHaveBeenCalled();
    expect(claimForPromotion).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('throws business rule error when waitlist entry is already finalized', async () => {
    const finalizedEntry: WaitlistEntry = {
      id: 'waitlist-3',
      clinicId: 'clinic-1',
      patientId: 'patient-3',
      requestedDate: new Date('2026-01-01T00:00:00.000Z'),
      requestedTimeRangeStart: undefined,
      requestedTimeRangeEnd: undefined,
      priorityScore: 10,
      status: WaitlistStatus.PROMOTED,
      createdAt: new Date('2026-01-01T09:00:00.000Z'),
      updatedAt: new Date('2026-01-01T09:00:00.000Z'),
      notes: undefined,
    };

    getWaitlistEntryById.mockResolvedValue(finalizedEntry);

    await expect(
      service.promoteToAppointment(finalizedEntry.id, 'staff-1', new Date(), new Date(Date.now() + 60_000))
    ).rejects.toThrow(BusinessRuleError);

    expect(createAppointment).not.toHaveBeenCalled();
    expect(claimForPromotion).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('throws conflict error when promotion claim fails due to concurrent claim', async () => {
    const entry: WaitlistEntry = {
      id: 'waitlist-4',
      clinicId: 'clinic-1',
      patientId: 'patient-4',
      requestedDate: new Date('2026-01-01T00:00:00.000Z'),
      requestedTimeRangeStart: undefined,
      requestedTimeRangeEnd: undefined,
      priorityScore: 15,
      status: WaitlistStatus.WAITING,
      createdAt: new Date('2026-01-01T09:00:00.000Z'),
      updatedAt: new Date('2026-01-01T09:00:00.000Z'),
      notes: undefined,
    };

    getWaitlistEntryById.mockResolvedValue(entry);
    claimForPromotion.mockResolvedValue(null);

    await expect(
      service.promoteToAppointment(entry.id, 'staff-1', new Date(), new Date(Date.now() + 60_000))
    ).rejects.toThrow(ConflictError);

    expect(createAppointment).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });
});

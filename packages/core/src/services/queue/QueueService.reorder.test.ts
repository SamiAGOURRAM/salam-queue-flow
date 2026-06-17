/**
 * QueueService.reorderQueue — unit tests
 *
 * Exercises the ported reorder business rules against a fake repository and a
 * NoOp event bus (no network, no Supabase). This is the SSOT both the web UI
 * and the (future) AI agent run, so the rules are tested once, here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from './QueueService.js';
import { NoOpEventBus } from '../../ports/eventBus.js';
import { ConsoleLogger } from '../../ports/logger.js';
import { AppointmentStatus, QueueActionType, type QueueEntry } from '../../types.js';
import { NotFoundError, ValidationError, BusinessRuleError } from '../../errors.js';
import type { IQueueRepository } from '../../ports/repositories/IQueueRepository.js';

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'apt-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    staffId: 'staff-1',
    appointmentDate: '2026-06-17',
    status: AppointmentStatus.WAITING,
    queuePosition: 3,
    appointmentType: 'consultation',
    ...overrides,
  };
}

function makeRepo(entry: QueueEntry | null) {
  return {
    getQueueEntry: vi.fn().mockResolvedValue(entry),
    updateQueuePosition: vi.fn().mockImplementation(async (id: string, newPosition: number) =>
      makeEntry({ id, queuePosition: newPosition })
    ),
    createQueueOverride: vi.fn().mockResolvedValue(undefined),
  } as unknown as IQueueRepository & {
    getQueueEntry: ReturnType<typeof vi.fn>;
    updateQueuePosition: ReturnType<typeof vi.fn>;
    createQueueOverride: ReturnType<typeof vi.fn>;
  };
}

describe('QueueService.reorderQueue', () => {
  const logger = new ConsoleLogger();
  beforeEach(() => vi.clearAllMocks());

  it('moves the entry, records a REORDER override, and returns the updated entry', async () => {
    const repo = makeRepo(makeEntry({ queuePosition: 3 }));
    const service = new QueueService(repo, new NoOpEventBus(), logger);

    const result = await service.reorderQueue({
      appointmentId: 'apt-1',
      newPosition: 1,
      performedBy: 'staff-1',
      reason: 'urgent',
    });

    expect(result.queuePosition).toBe(1);
    expect(repo.updateQueuePosition).toHaveBeenCalledWith('apt-1', 1);
    expect(repo.createQueueOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        action: QueueActionType.REORDER,
        previousPosition: 3,
        newPosition: 1,
        performedBy: 'staff-1',
      })
    );
  });

  it('is a no-op (no mutation, no override) when the position is unchanged', async () => {
    const repo = makeRepo(makeEntry({ queuePosition: 2 }));
    const service = new QueueService(repo, new NoOpEventBus(), logger);

    const result = await service.reorderQueue({
      appointmentId: 'apt-1',
      newPosition: 2,
      performedBy: 'staff-1',
      reason: 'no change',
    });

    expect(result.queuePosition).toBe(2);
    expect(repo.updateQueuePosition).not.toHaveBeenCalled();
    expect(repo.createQueueOverride).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the appointment does not exist', async () => {
    const repo = makeRepo(null);
    const service = new QueueService(repo, new NoOpEventBus(), logger);

    await expect(
      service.reorderQueue({ appointmentId: 'missing', newPosition: 1, performedBy: 's', reason: 'x' })
    ).rejects.toThrow(NotFoundError);
    expect(repo.updateQueuePosition).not.toHaveBeenCalled();
  });

  it('rejects a position below 1', async () => {
    const repo = makeRepo(makeEntry());
    const service = new QueueService(repo, new NoOpEventBus(), logger);

    await expect(
      service.reorderQueue({ appointmentId: 'apt-1', newPosition: 0, performedBy: 's', reason: 'x' })
    ).rejects.toThrow(ValidationError);
    expect(repo.updateQueuePosition).not.toHaveBeenCalled();
  });

  it('enforces per-provider staff scope', async () => {
    const repo = makeRepo(makeEntry({ staffId: 'staff-1' }));
    const service = new QueueService(repo, new NoOpEventBus(), logger);

    await expect(
      service.reorderQueue({
        appointmentId: 'apt-1',
        newPosition: 1,
        performedBy: 'staff-2',
        reason: 'x',
        allowedStaffIds: ['staff-2'], // caller may only manage staff-2's queue
      })
    ).rejects.toThrow(BusinessRuleError);
    expect(repo.updateQueuePosition).not.toHaveBeenCalled();
  });

  it('allows the action when the entry is within the caller’s staff scope', async () => {
    const repo = makeRepo(makeEntry({ staffId: 'staff-1', queuePosition: 4 }));
    const service = new QueueService(repo, new NoOpEventBus(), logger);

    const result = await service.reorderQueue({
      appointmentId: 'apt-1',
      newPosition: 1,
      performedBy: 'staff-1',
      reason: 'urgent',
      allowedStaffIds: ['staff-1'],
    });

    expect(result.queuePosition).toBe(1);
    expect(repo.updateQueuePosition).toHaveBeenCalledWith('apt-1', 1);
  });
});

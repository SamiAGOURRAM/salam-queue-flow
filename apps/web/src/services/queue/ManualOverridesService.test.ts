import { describe, expect, it, vi } from 'vitest';
import { ManualOverridesService } from './ManualOverridesService';
import {
  AppointmentStatus,
  AppointmentType,
  QueueActionType,
  QueueEntry,
  QueueMode,
} from './models/QueueModels';
import { QueueRepository } from './repositories/QueueRepository';

const createEntry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: 'appointment-1',
  clinicId: 'clinic-1',
  patientId: 'patient-1',
  staffId: 'staff-1',
  appointmentDate: new Date('2026-04-07T00:00:00.000Z'),
  queuePosition: 3,
  status: AppointmentStatus.WAITING,
  appointmentType: AppointmentType.CONSULTATION,
  isPresent: true,
  skipCount: 0,
  createdAt: new Date('2026-04-07T08:00:00.000Z'),
  updatedAt: new Date('2026-04-07T08:00:00.000Z'),
  ...overrides,
});

const createRepositoryMock = () => ({
  getQueueEntryById: vi.fn(),
  updateQueueEntry: vi.fn(),
  createQueueOverride: vi.fn(),
  getDailySchedule: vi.fn(),
});

describe('ManualOverridesService.manualMove', () => {
  it('moves directly by queuePosition when direct update sticks', async () => {
    const repository = createRepositoryMock();
    const service = new ManualOverridesService(repository as unknown as QueueRepository);

    const original = createEntry({ queuePosition: 5 });
    const moved = createEntry({ queuePosition: 2, id: original.id });

    repository.getQueueEntryById.mockResolvedValue(original);
    repository.updateQueueEntry.mockResolvedValue(moved);
    repository.createQueueOverride.mockResolvedValue({ id: 'override-1' });

    await service.manualMove(original.id, 2, 'Manual reorder', 'staff-user-1');

    expect(repository.updateQueueEntry).toHaveBeenCalledWith(original.id, {
      queuePosition: 2,
    });
    expect(repository.createQueueOverride).toHaveBeenCalledWith(
      original.clinicId,
      original.id,
      QueueActionType.REORDER,
      'staff-user-1',
      'Manual reorder',
      5,
      2,
      expect.objectContaining({ queuePosition: 5 }),
      expect.objectContaining({ queuePosition: 2 })
    );
  });

  it('falls back to fluid-mode priority balancing when direct move is overridden', async () => {
    const repository = createRepositoryMock();
    const service = new ManualOverridesService(repository as unknown as QueueRepository);

    const original = createEntry({ id: 'appointment-2', queuePosition: 5, priorityScore: 40 });
    const directUpdateIgnored = createEntry({ id: original.id, queuePosition: 5, priorityScore: 40 });
    const fallbackUpdated = createEntry({ id: original.id, queuePosition: 2, priorityScore: 95 });

    repository.getQueueEntryById.mockResolvedValue(original);
    repository.updateQueueEntry
      .mockResolvedValueOnce(directUpdateIgnored)
      .mockResolvedValueOnce(fallbackUpdated);
    repository.getDailySchedule.mockResolvedValue({
      queue_mode: QueueMode.FLUID,
      schedule: [
        createEntry({ id: 'appointment-a', queuePosition: 1, priorityScore: 120 }),
        createEntry({ id: 'appointment-b', queuePosition: 2, priorityScore: 100 }),
        original,
      ],
    });
    repository.createQueueOverride.mockResolvedValue({ id: 'override-2' });

    await service.manualMove(original.id, 2, 'Fallback reorder', 'staff-user-2');

    expect(repository.updateQueueEntry).toHaveBeenCalledTimes(2);
    expect(repository.updateQueueEntry).toHaveBeenNthCalledWith(1, original.id, {
      queuePosition: 2,
    });
    expect(repository.updateQueueEntry).toHaveBeenNthCalledWith(
      2,
      original.id,
      expect.objectContaining({ priorityScore: expect.any(Number) })
    );
    expect(repository.getDailySchedule).toHaveBeenCalledWith('staff-1', '2026-04-07');
    expect(repository.createQueueOverride).toHaveBeenCalledWith(
      original.clinicId,
      original.id,
      QueueActionType.REORDER,
      'staff-user-2',
      'Fallback reorder',
      5,
      2,
      expect.any(Object),
      expect.objectContaining({ queuePosition: 2 })
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '../shared/events/EventBus';
import { NoShowDetectorService } from './NoShowDetectorService';
import { QueueRepository } from './repositories/QueueRepository';
import { QueueService } from './QueueService';
import { WaitlistService } from './WaitlistService';
import { QueueEventType } from './events/QueueEvents';
import {
  AppointmentStatus,
  QueueMode,
  WaitlistStatus,
  type WaitlistEntry,
} from './models/QueueModels';
import { createMockQueueEntry } from '../../test/utils/testHelpers';

describe('No-show to gap-fill waitlist flow', () => {
  let service: NoShowDetectorService;
  let eventHandlers: Map<string, (event: any) => Promise<void> | void>;

  let getAbsentPatients: ReturnType<typeof vi.fn>;
  let getPendingGraceExpiries: ReturnType<typeof vi.fn>;
  let getDailySchedule: ReturnType<typeof vi.fn>;
  let autoMarkNoShow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    eventHandlers = new Map();
    vi.mocked(eventBus.subscribe).mockImplementation((eventType: string, handler: any) => {
      eventHandlers.set(eventType, handler);
      return vi.fn();
    });

    getAbsentPatients = vi.fn().mockResolvedValue([]);
    getPendingGraceExpiries = vi.fn().mockResolvedValue([]);
    getDailySchedule = vi.fn().mockResolvedValue({
      queue_mode: QueueMode.FLUID,
      schedule: [],
    });

    autoMarkNoShow = vi.fn().mockResolvedValue(
      createMockQueueEntry({
        id: 'appointment-1',
        clinicId: 'clinic-1',
        staffId: 'staff-1',
        status: AppointmentStatus.NO_SHOW,
        estimatedDurationMinutes: 20,
      })
    );

    const waitlistCandidate: WaitlistEntry = {
      id: 'waitlist-1',
      clinicId: 'clinic-1',
      patientId: 'patient-waitlist-1',
      requestedDate: new Date('2026-01-01T00:00:00.000Z'),
      requestedTimeRangeStart: undefined,
      requestedTimeRangeEnd: undefined,
      priorityScore: 99,
      status: WaitlistStatus.WAITING,
      createdAt: new Date('2026-01-01T08:00:00.000Z'),
      updatedAt: new Date('2026-01-01T08:00:00.000Z'),
      notes: undefined,
    };

    vi.spyOn(WaitlistService.prototype, 'getClinicWaitlist').mockResolvedValue([waitlistCandidate]);
    vi.spyOn(WaitlistService.prototype, 'promoteToAppointment').mockResolvedValue(undefined);

    const mockRepository: Partial<QueueRepository> = {
      getAbsentPatients,
      getPendingGraceExpiries,
      getDailySchedule,
    };

    const mockQueueService: Partial<QueueService> = {
      autoMarkNoShow,
    };

    service = new NoShowDetectorService(
      mockRepository as QueueRepository,
      mockQueueService as QueueService
    );
  });

  afterEach(() => {
    service?.cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function emitEvent(eventType: QueueEventType, event: any): Promise<void> {
    const handler = eventHandlers.get(eventType);
    expect(handler).toBeDefined();
    await handler?.(event);
  }

  it('promotes a waitlist candidate after no-show creates a gap', async () => {
    service.initialize('clinic-1', 'fallback-staff');

    await emitEvent(QueueEventType.PATIENT_MARKED_ABSENT, {
      eventId: 'evt-absent-no-show-flow',
      eventType: QueueEventType.PATIENT_MARKED_ABSENT,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-1',
      payload: {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        markedBy: 'staff-1',
        markedAt: new Date().toISOString(),
        previousPosition: 1,
        gracePeriodEndsAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    await vi.advanceTimersByTimeAsync(60_001);

    expect(autoMarkNoShow).toHaveBeenCalledWith('appointment-1');
    expect(getDailySchedule).toHaveBeenCalledWith('staff-1', '2026-01-01');
    expect(WaitlistService.prototype.getClinicWaitlist).toHaveBeenCalledWith(
      'clinic-1',
      expect.any(Date)
    );
    expect(WaitlistService.prototype.promoteToAppointment).toHaveBeenCalledWith(
      'waitlist-1',
      'staff-1',
      expect.any(Date),
      expect.any(Date)
    );
  });
});

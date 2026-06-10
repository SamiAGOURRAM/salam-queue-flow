import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '../shared/events/EventBus';
import { NoShowDetectorService } from './NoShowDetectorService';
import { QueueRepository } from './repositories/QueueRepository';
import { QueueService } from './QueueService';
import { GapManagerService } from './GapManagerService';
import { QueueEventType } from './events/QueueEvents';
import { AppointmentStatus, type AbsentPatient } from './models/QueueModels';
import { createMockQueueEntry } from '../../test/utils/testHelpers';

describe('NoShowDetectorService', () => {
  let service: NoShowDetectorService;
  let getAbsentPatients: ReturnType<typeof vi.fn>;
  let getPendingGraceExpiries: ReturnType<typeof vi.fn>;
  let autoMarkNoShow: ReturnType<typeof vi.fn>;
  let handleGapSpy: ReturnType<typeof vi.spyOn>;
  let eventHandlers: Map<string, (event: any) => Promise<void> | void>;

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
    autoMarkNoShow = vi.fn().mockResolvedValue(null);

    handleGapSpy = vi.spyOn(GapManagerService.prototype, 'handleGap').mockResolvedValue();

    const mockRepository: Partial<QueueRepository> = {
      getAbsentPatients,
      getPendingGraceExpiries,
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

  it('schedules no-show handling when absent event grace expires', async () => {
    const noShowEntry = createMockQueueEntry({
      id: 'appointment-1',
      clinicId: 'clinic-1',
      staffId: 'staff-1',
      status: AppointmentStatus.NO_SHOW,
      estimatedDurationMinutes: 20,
    });

    autoMarkNoShow.mockResolvedValue(noShowEntry);

    service.initialize('clinic-1', 'fallback-staff');

    await emitEvent(QueueEventType.PATIENT_MARKED_ABSENT, {
      eventId: 'evt-absent-1',
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
        gracePeriodEndsAt: new Date(Date.now() + 2 * 60_000).toISOString(),
      },
    });

    await vi.advanceTimersByTimeAsync(2 * 60_000 + 1);

    expect(autoMarkNoShow).toHaveBeenCalledWith('appointment-1');
    expect(handleGapSpy).toHaveBeenCalledWith(
      'clinic-1',
      expect.any(Date),
      expect.any(Date),
      'staff-1'
    );
  });

  it('clears no-show timer when patient returns before grace expiry', async () => {
    autoMarkNoShow.mockResolvedValue(
      createMockQueueEntry({
        id: 'appointment-2',
        clinicId: 'clinic-1',
        status: AppointmentStatus.NO_SHOW,
      })
    );

    service.initialize('clinic-1', 'fallback-staff');

    await emitEvent(QueueEventType.PATIENT_MARKED_ABSENT, {
      eventId: 'evt-absent-2',
      eventType: QueueEventType.PATIENT_MARKED_ABSENT,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-2',
      payload: {
        appointmentId: 'appointment-2',
        patientId: 'patient-2',
        clinicId: 'clinic-1',
        markedBy: 'staff-1',
        markedAt: new Date().toISOString(),
        previousPosition: 2,
        gracePeriodEndsAt: new Date(Date.now() + 3 * 60_000).toISOString(),
      },
    });

    await emitEvent(QueueEventType.PATIENT_RETURNED, {
      eventId: 'evt-returned-1',
      eventType: QueueEventType.PATIENT_RETURNED,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-2',
      payload: {
        appointmentId: 'appointment-2',
        patientId: 'patient-2',
        clinicId: 'clinic-1',
        newPosition: 4,
        returnedAt: new Date().toISOString(),
      },
    });

    await vi.advanceTimersByTimeAsync(3 * 60_000 + 1);

    expect(autoMarkNoShow).not.toHaveBeenCalledWith('appointment-2');
  });

  it('clears no-show timer when appointment reaches a terminal status', async () => {
    service.initialize('clinic-1', 'fallback-staff');

    await emitEvent(QueueEventType.PATIENT_MARKED_ABSENT, {
      eventId: 'evt-absent-3',
      eventType: QueueEventType.PATIENT_MARKED_ABSENT,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-3',
      payload: {
        appointmentId: 'appointment-3',
        patientId: 'patient-3',
        clinicId: 'clinic-1',
        markedBy: 'staff-1',
        markedAt: new Date().toISOString(),
        previousPosition: 3,
        gracePeriodEndsAt: new Date(Date.now() + 3 * 60_000).toISOString(),
      },
    });

    await emitEvent(QueueEventType.APPOINTMENT_STATUS_CHANGED, {
      eventId: 'evt-status-1',
      eventType: QueueEventType.APPOINTMENT_STATUS_CHANGED,
      timestamp: new Date(),
      clinicId: 'clinic-1',
      appointmentId: 'appointment-3',
      payload: {
        appointmentId: 'appointment-3',
        patientId: 'patient-3',
        clinicId: 'clinic-1',
        previousStatus: AppointmentStatus.WAITING,
        newStatus: AppointmentStatus.NO_SHOW,
        changedBy: 'system',
        changedAt: new Date().toISOString(),
      },
    });

    await vi.advanceTimersByTimeAsync(3 * 60_000 + 1);

    expect(autoMarkNoShow).not.toHaveBeenCalledWith('appointment-3');
  });

  it('processes periodic grace-expired absences and handles gap fill with fallback staff', async () => {
    const expiredAbsence: AbsentPatient = {
      id: 'absence-1',
      appointmentId: 'appointment-expired',
      clinicId: 'clinic-1',
      patientId: 'patient-expired',
      markedAbsentAt: new Date(Date.now() - 20 * 60_000),
      returnedAt: undefined,
      newPosition: undefined,
      notificationSent: true,
      gracePeriodEndsAt: new Date(Date.now() - 1 * 60_000),
      autoCancelled: false,
      createdAt: new Date(Date.now() - 20 * 60_000),
      updatedAt: new Date(Date.now() - 2 * 60_000),
    };

    getPendingGraceExpiries
      .mockResolvedValueOnce([expiredAbsence])
      .mockResolvedValue([]);

    autoMarkNoShow.mockResolvedValue(
      createMockQueueEntry({
        id: 'appointment-expired',
        clinicId: 'clinic-1',
        staffId: undefined,
        status: AppointmentStatus.NO_SHOW,
        estimatedDurationMinutes: 15,
      })
    );

    service.initialize('clinic-1', 'fallback-staff');

    await vi.advanceTimersByTimeAsync(1);

    expect(getPendingGraceExpiries).toHaveBeenCalledWith(expect.any(Date), 'clinic-1');
    expect(autoMarkNoShow).toHaveBeenCalledWith('appointment-expired');
    expect(handleGapSpy).toHaveBeenCalledWith(
      'clinic-1',
      expect.any(Date),
      expect.any(Date),
      'fallback-staff'
    );
  });
});

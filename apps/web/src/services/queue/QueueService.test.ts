/**
 * QueueService Tests
 * Comprehensive tests for queue management business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from './QueueService';
import { QueueRepository } from './repositories/QueueRepository';
import { eventBus } from '../shared/events/EventBus';
import { logger } from '../shared/logging/Logger';
import {
  NotFoundError,
  ValidationError,
  BusinessRuleError,
  ConflictError,
} from '../shared/errors';
import {
  AppointmentStatus,
  QueueActionType,
  SkipReason,
  type QueueEntry,
  type CreateQueueEntryDTO,
  type MarkAbsentDTO,
  type CallNextPatientDTO,
  type ReorderQueueDTO,
} from './models/QueueModels';
import { createMockQueueEntry } from '../../test/utils/testHelpers';

// Mock dependencies
vi.mock('../shared/events/EventBus');
vi.mock('../shared/logging/Logger');
vi.mock('../ml/MlApiClient', () => ({
  mlApiClient: {
    predictWaitTimesBatch: vi.fn(),
  },
}));

describe('QueueService', () => {
  let service: QueueService;
  let mockRepository: Partial<QueueRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = {
      getDailySchedule: vi.fn(),
      getQueueEntryById: vi.fn(),
      createQueueEntryViaRpc: vi.fn(),
      updateQueueEntry: vi.fn(),
      checkInPatient: vi.fn(),
      markAbsent: vi.fn(),
      markPatientReturned: vi.fn(),
      createAbsentPatient: vi.fn(),
      createQueueOverride: vi.fn(),
      getNextQueuePosition: vi.fn(),
      getClinicEstimationConfigByStaffId: vi.fn(),
      recordActualWaitTime: vi.fn(),
      recordWaitTimePredictions: vi.fn(),
    };
    service = new QueueService(mockRepository as QueueRepository);
  });

  describe('getDailySchedule', () => {
    it('should fetch and enrich schedule with wait time estimates', async () => {
      const staffId = 'staff-123';
      const targetDate = '2025-01-15';
      const mockSchedule = [
        createMockQueueEntry({ id: 'app-1', staffId, status: AppointmentStatus.SCHEDULED }),
        createMockQueueEntry({ id: 'app-2', staffId, status: AppointmentStatus.WAITING }),
      ];

      mockRepository.getDailySchedule = vi.fn().mockResolvedValue({
        operating_mode: 'clinic_wide',
        schedule: mockSchedule,
      });
      mockRepository.getClinicEstimationConfigByStaffId = vi.fn().mockResolvedValue({
        mlEnabled: false,
      });

      const result = await service.getDailySchedule(staffId, targetDate);

      expect(result.operating_mode).toBe('clinic_wide');
      expect(result.schedule).toHaveLength(2);
      expect(mockRepository.getDailySchedule).toHaveBeenCalledWith(staffId, targetDate);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle errors when fetching schedule', async () => {
      const staffId = 'staff-123';
      const targetDate = '2025-01-15';
      const error = new Error('Database error');

      mockRepository.getDailySchedule = vi.fn().mockRejectedValue(error);

      await expect(service.getDailySchedule(staffId, targetDate)).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getQueueEntry', () => {
    it('should return queue entry when found', async () => {
      const appointmentId = 'app-123';
      const mockEntry = createMockQueueEntry({ id: appointmentId });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      const result = await service.getQueueEntry(appointmentId);

      expect(result).toEqual(mockEntry);
      expect(mockRepository.getQueueEntryById).toHaveBeenCalledWith(appointmentId);
    });

    it('should throw NotFoundError when entry not found', async () => {
      const appointmentId = 'app-123';

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(null);

      await expect(service.getQueueEntry(appointmentId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('createAppointment', () => {
    it('should create appointment successfully', async () => {
      const dto: CreateQueueEntryDTO = {
        clinicId: 'clinic-123',
        patientId: 'patient-123',
        staffId: 'staff-123',
        startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        endTime: new Date(Date.now() + 3900000).toISOString(), // 1h 5min from now
        appointmentType: 'consultation',
        isWalkIn: false,
      };

      const mockEntry = createMockQueueEntry({
        id: 'app-123',
        clinicId: dto.clinicId,
        patientId: dto.patientId,
        staffId: dto.staffId,
      });

      mockRepository.createQueueEntryViaRpc = vi.fn().mockResolvedValue(mockEntry);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createAppointment(dto);

      expect(result).toEqual(mockEntry);
      expect(mockRepository.createQueueEntryViaRpc).toHaveBeenCalledWith(dto);
      expect(eventBus.publish).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError when startTime is missing', async () => {
      const dto: CreateQueueEntryDTO = {
        clinicId: 'clinic-123',
        patientId: 'patient-123',
        startTime: '',
        endTime: new Date().toISOString(),
        appointmentType: 'consultation',
      };

      await expect(service.createAppointment(dto)).rejects.toThrow(ValidationError);
      expect(mockRepository.createQueueEntryViaRpc).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when endTime is missing', async () => {
      const dto: CreateQueueEntryDTO = {
        clinicId: 'clinic-123',
        patientId: 'patient-123',
        startTime: new Date().toISOString(),
        endTime: '',
        appointmentType: 'consultation',
      };

      await expect(service.createAppointment(dto)).rejects.toThrow(ValidationError);
    });

    it('should allow walk-in appointments in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      const dto: CreateQueueEntryDTO = {
        clinicId: 'clinic-123',
        patientId: 'patient-123',
        startTime: pastDate.toISOString(),
        endTime: new Date(pastDate.getTime() + 1800000).toISOString(),
        appointmentType: 'consultation',
        isWalkIn: true,
      };

      const mockEntry = createMockQueueEntry({ id: 'app-123' });
      mockRepository.createQueueEntryViaRpc = vi.fn().mockResolvedValue(mockEntry);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createAppointment(dto);

      expect(result).toEqual(mockEntry);
      expect(mockRepository.createQueueEntryViaRpc).toHaveBeenCalled();
    });

    it('should throw ValidationError for non-walk-in appointments in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000);
      const dto: CreateQueueEntryDTO = {
        clinicId: 'clinic-123',
        patientId: 'patient-123',
        startTime: pastDate.toISOString(),
        endTime: new Date(pastDate.getTime() + 1800000).toISOString(),
        appointmentType: 'consultation',
        isWalkIn: false,
      };

      await expect(service.createAppointment(dto)).rejects.toThrow(ValidationError);
    });
  });

  describe('checkInPatient', () => {
    it('should check in patient successfully', async () => {
      const appointmentId = 'app-123';
      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        status: AppointmentStatus.SCHEDULED,
      });
      const updatedEntry = createMockQueueEntry({
        id: appointmentId,
        status: AppointmentStatus.WAITING,
        checkedInAt: new Date(),
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);
      mockRepository.checkInPatient = vi.fn().mockResolvedValue(updatedEntry);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.checkInPatient(appointmentId);

      expect(result).toEqual(updatedEntry);
      expect(mockRepository.checkInPatient).toHaveBeenCalledWith(appointmentId);
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw BusinessRuleError for completed appointment', async () => {
      const appointmentId = 'app-123';
      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        status: AppointmentStatus.COMPLETED,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.checkInPatient(appointmentId)).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for cancelled appointment', async () => {
      const appointmentId = 'app-123';
      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        status: AppointmentStatus.CANCELLED,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.checkInPatient(appointmentId)).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('callNextPatient', () => {
    it('should call next waiting patient', async () => {
      const dto: CallNextPatientDTO = {
        staffId: 'staff-123',
        clinicId: 'clinic-123',
        date: new Date().toISOString(),
        performedBy: 'user-123',
      };

      const waitingPatient = createMockQueueEntry({
        id: 'app-1',
        staffId: dto.staffId,
        status: AppointmentStatus.WAITING,
        isPresent: true,
        queuePosition: 1,
      });

      mockRepository.getDailySchedule = vi.fn().mockResolvedValue({
        operating_mode: 'staff_specific',
        schedule: [waitingPatient],
      });
      mockRepository.getClinicEstimationConfigByStaffId = vi.fn().mockResolvedValue({
        mlEnabled: false,
      });
      mockRepository.updateQueueEntry = vi.fn().mockResolvedValue({
        ...waitingPatient,
        status: AppointmentStatus.IN_PROGRESS,
        checkedInAt: new Date(),
      });
      mockRepository.createQueueOverride = vi.fn().mockResolvedValue(undefined);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.callNextPatient(dto);

      expect(result.status).toBe(AppointmentStatus.IN_PROGRESS);
      expect(mockRepository.updateQueueEntry).toHaveBeenCalled();
      expect(mockRepository.createQueueOverride).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw NotFoundError when no patients are waiting', async () => {
      const dto: CallNextPatientDTO = {
        staffId: 'staff-123',
        clinicId: 'clinic-123',
        date: new Date().toISOString(),
        performedBy: 'user-123',
      };

      mockRepository.getDailySchedule = vi.fn().mockResolvedValue({
        operating_mode: 'staff_specific',
        schedule: [],
      });
      mockRepository.getClinicEstimationConfigByStaffId = vi.fn().mockResolvedValue({
        mlEnabled: false,
      });

      await expect(service.callNextPatient(dto)).rejects.toThrow(NotFoundError);
    });
  });

  describe('markPatientAbsent', () => {
    it('should mark patient as absent successfully', async () => {
      const dto: MarkAbsentDTO = {
        appointmentId: 'app-123',
        performedBy: 'user-123',
        reason: 'Patient not responding',
        gracePeriodMinutes: 15,
      };

      const mockEntry = createMockQueueEntry({
        id: dto.appointmentId,
        status: AppointmentStatus.WAITING,
        isPresent: true,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);
      mockRepository.updateQueueEntry = vi.fn().mockResolvedValue({
        ...mockEntry,
        isPresent: false,
        skipReason: SkipReason.PATIENT_ABSENT,
        markedAbsentAt: new Date(),
      });
      mockRepository.createAbsentPatient = vi.fn().mockResolvedValue(undefined);
      mockRepository.createQueueOverride = vi.fn().mockResolvedValue(undefined);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.markPatientAbsent(dto);

      expect(result.isPresent).toBe(false);
      expect(mockRepository.createAbsentPatient).toHaveBeenCalled();
      expect(mockRepository.createQueueOverride).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw BusinessRuleError for completed appointment', async () => {
      const dto: MarkAbsentDTO = {
        appointmentId: 'app-123',
        performedBy: 'user-123',
      };

      const mockEntry = createMockQueueEntry({
        id: dto.appointmentId,
        status: AppointmentStatus.COMPLETED,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.markPatientAbsent(dto)).rejects.toThrow(BusinessRuleError);
    });

    it('should throw ConflictError if already marked absent', async () => {
      const dto: MarkAbsentDTO = {
        appointmentId: 'app-123',
        performedBy: 'user-123',
      };

      const mockEntry = createMockQueueEntry({
        id: dto.appointmentId,
        markedAbsentAt: new Date(),
        returnedAt: undefined,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.markPatientAbsent(dto)).rejects.toThrow(ConflictError);
    });
  });

  describe('markPatientReturned', () => {
    it('should mark patient as returned successfully', async () => {
      const appointmentId = 'app-123';
      const performedBy = 'user-123';
      const newPosition = 5;

      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        markedAbsentAt: new Date(Date.now() - 600000), // 10 minutes ago
        returnedAt: undefined,
        isPresent: false,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);
      mockRepository.getNextQueuePosition = vi.fn().mockResolvedValue(newPosition);
      mockRepository.updateQueueEntry = vi.fn().mockResolvedValue({
        ...mockEntry,
        queuePosition: newPosition,
        isPresent: true,
        status: AppointmentStatus.WAITING,
        returnedAt: new Date(),
      });
      mockRepository.markPatientReturned = vi.fn().mockResolvedValue(undefined);
      mockRepository.createQueueOverride = vi.fn().mockResolvedValue(undefined);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.markPatientReturned(appointmentId, performedBy);

      expect(result.isPresent).toBe(true);
      expect(result.queuePosition).toBe(newPosition);
      expect(mockRepository.createQueueOverride).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw BusinessRuleError if not marked absent', async () => {
      const appointmentId = 'app-123';
      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        markedAbsentAt: undefined,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.markPatientReturned(appointmentId, 'user-123')).rejects.toThrow(
        BusinessRuleError
      );
    });
  });

  describe('completeAppointment', () => {
    it('should complete appointment and calculate wait time', async () => {
      const appointmentId = 'app-123';
      const performedBy = 'user-123';
      const startTime = new Date(Date.now() - 1800000); // 30 minutes ago (scheduled start)
      const checkedInAt = new Date(Date.now() - 900000); // 15 minutes ago (when entered)

      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        status: AppointmentStatus.IN_PROGRESS,
        startTime,
        checkedInAt,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);
      mockRepository.updateQueueEntry = vi.fn().mockResolvedValue({
        ...mockEntry,
        status: AppointmentStatus.COMPLETED,
        actualEndTime: new Date(),
      });
      mockRepository.recordActualWaitTime = vi.fn().mockResolvedValue(undefined);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.completeAppointment(appointmentId, performedBy);

      expect(result.status).toBe(AppointmentStatus.COMPLETED);
      expect(mockRepository.recordActualWaitTime).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw ConflictError if already completed', async () => {
      const appointmentId = 'app-123';
      const mockEntry = createMockQueueEntry({
        id: appointmentId,
        status: AppointmentStatus.COMPLETED,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.completeAppointment(appointmentId, 'user-123')).rejects.toThrow(
        ConflictError
      );
    });
  });

  describe('reorderQueue', () => {
    it('should reorder queue successfully', async () => {
      const dto: ReorderQueueDTO = {
        appointmentId: 'app-123',
        newPosition: 3,
        performedBy: 'user-123',
        reason: 'Priority case',
      };

      const mockEntry = createMockQueueEntry({
        id: dto.appointmentId,
        queuePosition: 5,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);
      mockRepository.updateQueueEntry = vi.fn().mockResolvedValue({
        ...mockEntry,
        queuePosition: dto.newPosition,
      });
      mockRepository.createQueueOverride = vi.fn().mockResolvedValue(undefined);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.reorderQueue(dto);

      expect(result.queuePosition).toBe(dto.newPosition);
      expect(mockRepository.createQueueOverride).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid position', async () => {
      const dto: ReorderQueueDTO = {
        appointmentId: 'app-123',
        newPosition: 0,
        performedBy: 'user-123',
      };

      const mockEntry = createMockQueueEntry({ id: dto.appointmentId });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      await expect(service.reorderQueue(dto)).rejects.toThrow(ValidationError);
    });

    it('should return entry unchanged if position is the same', async () => {
      const dto: ReorderQueueDTO = {
        appointmentId: 'app-123',
        newPosition: 5,
        performedBy: 'user-123',
      };

      const mockEntry = createMockQueueEntry({
        id: dto.appointmentId,
        queuePosition: 5,
      });

      mockRepository.getQueueEntryById = vi.fn().mockResolvedValue(mockEntry);

      const result = await service.reorderQueue(dto);

      expect(result).toEqual(mockEntry);
      expect(mockRepository.updateQueueEntry).not.toHaveBeenCalled();
    });
  });
});


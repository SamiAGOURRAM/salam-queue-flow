/**
 * StaffService Tests
 * Comprehensive tests for staff management business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StaffService, type StaffProfile, type CreateStaffDTO } from './StaffService';
import { StaffRepository } from './repositories/StaffRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, DatabaseError } from '../shared/errors';

// Mock dependencies
vi.mock('../shared/logging/Logger');

describe('StaffService', () => {
  let service: StaffService;
  let mockRepository: Partial<StaffRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = {
      getStaffByUser: vi.fn(),
      getStaffByClinic: vi.fn(),
      getStaffByClinicAndUser: vi.fn(),
      addStaff: vi.fn(),
      removeStaff: vi.fn(),
      updateStaff: vi.fn(),
      getStaffById: vi.fn(),
    };
    service = new StaffService(mockRepository as StaffRepository);
  });

  describe('getStaffByUser', () => {
    it('should return staff profile when found', async () => {
      const userId = 'user-123';
      const mockStaff = {
        id: 'staff-123',
        clinic_id: 'clinic-123',
        user_id: userId,
        role: 'doctor',
        specialization: 'cardiology',
        license_number: 'LIC123',
        working_hours: { monday: { start: '09:00', end: '17:00' } },
        average_consultation_duration: 30,
        patients_per_day_avg: 20,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getStaffByUser = vi.fn().mockResolvedValue(mockStaff);

      const result = await service.getStaffByUser(userId);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
      expect(result?.role).toBe('doctor');
      expect(result?.specialization).toBe('cardiology');
      expect(mockRepository.getStaffByUser).toHaveBeenCalledWith(userId);
    });

    it('should return null when staff not found', async () => {
      const userId = 'user-123';

      mockRepository.getStaffByUser = vi.fn().mockResolvedValue(null);

      const result = await service.getStaffByUser(userId);

      expect(result).toBeNull();
    });
  });

  describe('getStaffByClinic', () => {
    it('should return list of staff for clinic', async () => {
      const clinicId = 'clinic-123';
      const mockStaffList = [
        {
          id: 'staff-1',
          clinic_id: clinicId,
          user_id: 'user-1',
          role: 'doctor',
          specialization: null,
          license_number: null,
          working_hours: null,
          average_consultation_duration: null,
          patients_per_day_avg: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'staff-2',
          clinic_id: clinicId,
          user_id: 'user-2',
          role: 'receptionist',
          specialization: null,
          license_number: null,
          working_hours: null,
          average_consultation_duration: null,
          patients_per_day_avg: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockRepository.getStaffByClinic = vi.fn().mockResolvedValue(mockStaffList);

      const result = await service.getStaffByClinic(clinicId);

      expect(result).toHaveLength(2);
      expect(result[0].clinicId).toBe(clinicId);
      expect(result[1].role).toBe('receptionist');
      expect(mockRepository.getStaffByClinic).toHaveBeenCalledWith(clinicId);
    });

    it('should return empty array when no staff found', async () => {
      const clinicId = 'clinic-123';

      mockRepository.getStaffByClinic = vi.fn().mockResolvedValue([]);

      const result = await service.getStaffByClinic(clinicId);

      expect(result).toEqual([]);
    });
  });

  describe('getStaffByClinicAndUser', () => {
    it('should return staff when found', async () => {
      const clinicId = 'clinic-123';
      const userId = 'user-123';
      const mockStaff = {
        id: 'staff-123',
        clinic_id: clinicId,
        user_id: userId,
        role: 'doctor',
        specialization: null,
        license_number: null,
        working_hours: null,
        average_consultation_duration: null,
        patients_per_day_avg: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getStaffByClinicAndUser = vi.fn().mockResolvedValue(mockStaff);

      const result = await service.getStaffByClinicAndUser(clinicId, userId);

      expect(result).not.toBeNull();
      expect(result?.clinicId).toBe(clinicId);
      expect(result?.userId).toBe(userId);
    });

    it('should return null when staff not found', async () => {
      const clinicId = 'clinic-123';
      const userId = 'user-123';

      mockRepository.getStaffByClinicAndUser = vi.fn().mockResolvedValue(null);

      const result = await service.getStaffByClinicAndUser(clinicId, userId);

      expect(result).toBeNull();
    });
  });

  describe('addStaff', () => {
    it('should add staff successfully', async () => {
      const dto: CreateStaffDTO = {
        clinicId: 'clinic-123',
        userId: 'user-123',
        role: 'doctor',
        specialization: 'cardiology',
        licenseNumber: 'LIC123',
        workingHours: { monday: { start: '09:00', end: '17:00' } },
      };

      const mockStaff = {
        id: 'staff-new',
        clinic_id: dto.clinicId,
        user_id: dto.userId,
        role: dto.role,
        specialization: dto.specialization,
        license_number: dto.licenseNumber,
        working_hours: dto.workingHours,
        average_consultation_duration: null,
        patients_per_day_avg: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.addStaff = vi.fn().mockResolvedValue(mockStaff);

      const result = await service.addStaff(dto);

      expect(result.id).toBe('staff-new');
      expect(result.clinicId).toBe(dto.clinicId);
      expect(result.role).toBe(dto.role);
      expect(mockRepository.addStaff).toHaveBeenCalled();
    });

    it('should throw DatabaseError on add failure', async () => {
      const dto: CreateStaffDTO = {
        clinicId: 'clinic-123',
        userId: 'user-123',
        role: 'doctor',
      };
      const error = new Error('Add failed');

      mockRepository.addStaff = vi.fn().mockRejectedValue(error);

      await expect(service.addStaff(dto)).rejects.toThrow(DatabaseError);
    });
  });

  describe('removeStaff', () => {
    it('should remove staff successfully', async () => {
      const staffId = 'staff-123';

      mockRepository.removeStaff = vi.fn().mockResolvedValue(undefined);

      await service.removeStaff(staffId);

      expect(mockRepository.removeStaff).toHaveBeenCalledWith(staffId);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should throw DatabaseError on remove failure', async () => {
      const staffId = 'staff-123';
      const error = new Error('Remove failed');

      mockRepository.removeStaff = vi.fn().mockRejectedValue(error);

      await expect(service.removeStaff(staffId)).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateStaff', () => {
    it('should update staff successfully', async () => {
      const staffId = 'staff-123';
      const updateData: Partial<StaffProfile> = {
        role: 'senior_doctor',
        specialization: 'neurology',
        averageConsultationDuration: 45,
      };

      const existingStaff = {
        id: staffId,
        clinic_id: 'clinic-123',
        user_id: 'user-123',
        role: 'doctor',
        specialization: 'cardiology',
        license_number: null,
        working_hours: null,
        average_consultation_duration: 30,
        patients_per_day_avg: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedStaff = {
        ...existingStaff,
        role: updateData.role!,
        specialization: updateData.specialization!,
        average_consultation_duration: updateData.averageConsultationDuration!,
      };

      mockRepository.updateStaff = vi.fn().mockResolvedValue(undefined);
      mockRepository.getStaffById = vi.fn().mockResolvedValue(updatedStaff);

      const result = await service.updateStaff(staffId, updateData);

      expect(result.role).toBe(updateData.role);
      expect(result.specialization).toBe(updateData.specialization);
      expect(result.averageConsultationDuration).toBe(updateData.averageConsultationDuration);
      expect(mockRepository.updateStaff).toHaveBeenCalled();
    });

    it('should throw DatabaseError on update failure', async () => {
      const staffId = 'staff-123';
      const error = new Error('Update failed');

      mockRepository.updateStaff = vi.fn().mockRejectedValue(error);

      await expect(service.updateStaff(staffId, { role: 'doctor' })).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('getStaffById', () => {
    it('should return staff profile when found', async () => {
      const staffId = 'staff-123';
      const mockStaff = {
        id: staffId,
        clinic_id: 'clinic-123',
        user_id: 'user-123',
        role: 'doctor',
        specialization: 'cardiology',
        license_number: 'LIC123',
        working_hours: null,
        average_consultation_duration: 30,
        patients_per_day_avg: 20,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getStaffById = vi.fn().mockResolvedValue(mockStaff);

      const result = await service.getStaffById(staffId);

      expect(result.id).toBe(staffId);
      expect(result.role).toBe('doctor');
      expect(mockRepository.getStaffById).toHaveBeenCalledWith(staffId);
    });

    it('should throw NotFoundError when staff not found', async () => {
      const staffId = 'staff-123';
      const error = new DatabaseError('Staff not found');

      mockRepository.getStaffById = vi.fn().mockRejectedValue(error);

      await expect(service.getStaffById(staffId)).rejects.toThrow(NotFoundError);
    });
  });
});


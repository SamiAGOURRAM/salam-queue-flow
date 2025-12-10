/**
 * ClinicService Tests
 * Comprehensive tests for clinic management business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClinicService, type Clinic, type ClinicSettings } from './ClinicService';
import { ClinicRepository } from './repositories/ClinicRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, DatabaseError } from '../shared/errors';

// Mock dependencies
vi.mock('../shared/logging/Logger');

describe('ClinicService', () => {
  let service: ClinicService;
  let mockRepository: Partial<ClinicRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = {
      getClinic: vi.fn(),
      getClinicByOwner: vi.fn(),
      getClinicSettings: vi.fn(),
      updateClinicSettings: vi.fn(),
      updateClinic: vi.fn(),
    };
    service = new ClinicService(mockRepository as ClinicRepository);
  });

  describe('getClinic', () => {
    it('should return clinic successfully', async () => {
      const clinicId = 'clinic-123';
      const mockClinic = {
        id: clinicId,
        name: 'Test Clinic',
        name_ar: 'عيادة تجريبية',
        owner_id: 'owner-123',
        practice_type: 'private',
        specialty: 'general',
        address: '123 Test St',
        city: 'Casablanca',
        phone: '+212612345678',
        email: 'clinic@example.com',
        logo_url: 'https://example.com/logo.png',
        settings: { bufferTime: 15 },
        subscription_tier: 'premium',
        is_active: true,
        operating_mode: 'clinic_wide',
        estimation_mode: 'ml',
        ml_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getClinic = vi.fn().mockResolvedValue(mockClinic);

      const result = await service.getClinic(clinicId);

      expect(result.id).toBe(clinicId);
      expect(result.name).toBe('Test Clinic');
      expect(result.nameAr).toBe('عيادة تجريبية');
      expect(result.mlEnabled).toBe(true);
      expect(mockRepository.getClinic).toHaveBeenCalledWith(clinicId);
    });

    it('should throw NotFoundError when clinic not found', async () => {
      const clinicId = 'clinic-123';
      const error = new DatabaseError('Clinic not found');

      mockRepository.getClinic = vi.fn().mockRejectedValue(error);

      await expect(service.getClinic(clinicId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getClinicByOwner', () => {
    it('should return clinic when found', async () => {
      const ownerId = 'owner-123';
      const mockClinic = {
        id: 'clinic-123',
        name: 'Test Clinic',
        name_ar: null,
        owner_id: ownerId,
        practice_type: 'private',
        specialty: 'general',
        address: '123 Test St',
        city: 'Casablanca',
        phone: '+212612345678',
        email: null,
        logo_url: null,
        settings: {},
        subscription_tier: 'basic',
        is_active: true,
        operating_mode: 'staff_specific',
        estimation_mode: 'simple',
        ml_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getClinicByOwner = vi.fn().mockResolvedValue(mockClinic);

      const result = await service.getClinicByOwner(ownerId);

      expect(result).not.toBeNull();
      expect(result?.ownerId).toBe(ownerId);
      expect(mockRepository.getClinicByOwner).toHaveBeenCalledWith(ownerId);
    });

    it('should return null when clinic not found', async () => {
      const ownerId = 'owner-123';

      mockRepository.getClinicByOwner = vi.fn().mockResolvedValue(null);

      const result = await service.getClinicByOwner(ownerId);

      expect(result).toBeNull();
    });
  });

  describe('getClinicSettings', () => {
    it('should return clinic settings successfully', async () => {
      const clinicId = 'clinic-123';
      const mockSettings: ClinicSettings = {
        bufferTime: 15,
        workingHours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
        },
        allowWalkIns: true,
        maxQueueSize: 50,
        averageAppointmentDuration: 30,
      };

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue(mockSettings);

      const result = await service.getClinicSettings(clinicId);

      expect(result.bufferTime).toBe(15);
      expect(result.allowWalkIns).toBe(true);
      expect(result.maxQueueSize).toBe(50);
      expect(mockRepository.getClinicSettings).toHaveBeenCalledWith(clinicId);
    });

    it('should return empty object when settings not found', async () => {
      const clinicId = 'clinic-123';

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue(null);

      const result = await service.getClinicSettings(clinicId);

      expect(result).toEqual({});
    });

    it('should throw NotFoundError when clinic not found', async () => {
      const clinicId = 'clinic-123';
      const error = new DatabaseError('Clinic not found');

      mockRepository.getClinicSettings = vi.fn().mockRejectedValue(error);

      await expect(service.getClinicSettings(clinicId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateClinicSettings', () => {
    it('should update clinic settings successfully', async () => {
      const clinicId = 'clinic-123';
      const currentSettings: ClinicSettings = {
        bufferTime: 15,
        allowWalkIns: true,
      };
      const updateData: Partial<ClinicSettings> = {
        bufferTime: 20,
        maxQueueSize: 100,
      };

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue(currentSettings);
      mockRepository.updateClinicSettings = vi.fn().mockResolvedValue(undefined);

      const result = await service.updateClinicSettings(clinicId, updateData);

      expect(result.bufferTime).toBe(20);
      expect(result.maxQueueSize).toBe(100);
      expect(result.allowWalkIns).toBe(true); // Preserved from current
      expect(mockRepository.updateClinicSettings).toHaveBeenCalled();
    });

    it('should throw DatabaseError on update failure', async () => {
      const clinicId = 'clinic-123';
      const error = new Error('Update failed');

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue({});
      mockRepository.updateClinicSettings = vi.fn().mockRejectedValue(error);

      await expect(
        service.updateClinicSettings(clinicId, { bufferTime: 20 })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateClinic', () => {
    it('should update clinic information successfully', async () => {
      const clinicId = 'clinic-123';
      const updateData: Partial<Clinic> = {
        name: 'Updated Clinic Name',
        email: 'updated@example.com',
        isActive: false,
      };

      const existingClinic = {
        id: clinicId,
        name: 'Original Name',
        name_ar: null,
        owner_id: 'owner-123',
        practice_type: 'private',
        specialty: 'general',
        address: '123 Test St',
        city: 'Casablanca',
        phone: '+212612345678',
        email: 'original@example.com',
        logo_url: null,
        settings: {},
        subscription_tier: 'basic',
        is_active: true,
        operating_mode: 'clinic_wide',
        estimation_mode: 'simple',
        ml_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedClinic = {
        ...existingClinic,
        name: updateData.name!,
        email: updateData.email!,
        is_active: updateData.isActive!,
      };

      mockRepository.updateClinic = vi.fn().mockResolvedValue(undefined);
      mockRepository.getClinic = vi.fn().mockResolvedValue(updatedClinic);

      const result = await service.updateClinic(clinicId, updateData);

      expect(result.name).toBe(updateData.name);
      expect(result.email).toBe(updateData.email);
      expect(result.isActive).toBe(updateData.isActive);
      expect(mockRepository.updateClinic).toHaveBeenCalled();
    });

    it('should throw DatabaseError on update failure', async () => {
      const clinicId = 'clinic-123';
      const error = new Error('Update failed');

      mockRepository.updateClinic = vi.fn().mockRejectedValue(error);

      await expect(service.updateClinic(clinicId, { name: 'New Name' })).rejects.toThrow(
        DatabaseError
      );
    });
  });
});


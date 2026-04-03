/**
 * ClinicService Tests
 * Comprehensive tests for clinic management business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClinicService, type Clinic, type ClinicSettings } from './ClinicService';
import { ClinicRepository } from './repositories/ClinicRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, DatabaseError } from '../shared/errors';
import { QueueMode } from '../queue/models/QueueModels';

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
        settings: { buffer_time: 15 },
        subscription_tier: 'premium',
        is_active: true,
        queue_mode: QueueMode.SLOTTED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getClinic = vi.fn().mockResolvedValue(mockClinic);

      const result = await service.getClinic(clinicId);

      expect(result.id).toBe(clinicId);
      expect(result.name).toBe('Test Clinic');
      expect(result.nameAr).toBe('عيادة تجريبية');
      expect(result.queueMode).toBe(QueueMode.SLOTTED);
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
        queue_mode: QueueMode.FLUID,
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
        buffer_time: 15,
        working_hours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
        },
        allow_walk_ins: true,
        max_queue_size: 50,
        average_appointment_duration: 30,
      };

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue(mockSettings);

      const result = await service.getClinicSettings(clinicId);

      expect(result.buffer_time).toBe(15);
      expect(result.allow_walk_ins).toBe(true);
      expect(result.max_queue_size).toBe(50);
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
        buffer_time: 15,
        allow_walk_ins: true,
      };
      const updateData: Partial<ClinicSettings> = {
        buffer_time: 20,
        max_queue_size: 100,
      };

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue(currentSettings);
      mockRepository.updateClinicSettings = vi.fn().mockResolvedValue(undefined);

      const result = await service.updateClinicSettings(clinicId, updateData);

      expect(result.buffer_time).toBe(20);
      expect(result.max_queue_size).toBe(100);
      expect(result.allow_walk_ins).toBe(true); // Preserved from current
      expect(mockRepository.updateClinicSettings).toHaveBeenCalled();
    });

    it('should throw DatabaseError on update failure', async () => {
      const clinicId = 'clinic-123';
      const error = new Error('Update failed');

      mockRepository.getClinicSettings = vi.fn().mockResolvedValue({});
      mockRepository.updateClinicSettings = vi.fn().mockRejectedValue(error);

      await expect(
        service.updateClinicSettings(clinicId, { buffer_time: 20 })
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
        queue_mode: QueueMode.SLOTTED,
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


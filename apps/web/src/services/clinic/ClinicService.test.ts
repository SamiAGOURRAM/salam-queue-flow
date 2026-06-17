/**
 * ClinicService Tests
 *
 * NOW: thin facade over @queuemed/core's ClinicService.
 * Tests mock the core service instead of the now-deleted web ClinicRepository.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClinicService, type Clinic, type ClinicSettings } from './ClinicService';
import type { Clinic as CoreClinic } from '@queuemed/core';
import { NotFoundError, DatabaseError } from '../shared/errors';

// Mock logger
vi.mock('../shared/logging/Logger');

describe('ClinicService', () => {
  let service: ClinicService;
  let mockCore: Partial<{
    getClinic: ReturnType<typeof vi.fn>;
    getClinicsByOwner: ReturnType<typeof vi.fn>;
    searchDoctors: ReturnType<typeof vi.fn>;
    getClinicSettings: ReturnType<typeof vi.fn>;
    updateClinicSettings: ReturnType<typeof vi.fn>;
    updateClinic: ReturnType<typeof vi.fn>;
  }>;

  /** Core clinic shape returned by the mock. */
  function mockCoreClinic(overrides: Partial<CoreClinic> = {}): CoreClinic {
    return {
      id: 'clinic-123',
      name: 'Test Clinic',
      nameAr: 'عيادة تجريبية',
      ownerId: 'owner-123',
      practiceType: 'private',
      specialty: 'general',
      address: '123 Test St',
      city: 'Casablanca',
      phoneNumber: '+212612345678',
      email: 'clinic@example.com',
      logoUrl: 'https://example.com/logo.png',
      settings: { buffer_time: 15 },
      subscriptionTier: 'premium',
      isActive: true,
      queueMode: 'slotted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCore = {
      getClinic: vi.fn(),
      getClinicsByOwner: vi.fn(),
      searchDoctors: vi.fn(),
      getClinicSettings: vi.fn(),
      updateClinicSettings: vi.fn(),
      updateClinic: vi.fn(),
    };
    service = new ClinicService(mockCore as unknown as ConstructorParameters<typeof ClinicService>[0]);
  });

  describe('searchDoctors', () => {
    it('delegates to the core service and returns its result', async () => {
      const listings = [
        {
          staffId: 'staff-1',
          clinicId: 'clinic-1',
          fullName: 'Dr. Amine Benali',
          role: 'doctor',
          specialization: 'Cardiology',
          clinicName: 'Clinique Atlas',
          clinicSpecialty: 'Cardiology',
          city: 'Casablanca',
        },
      ];
      mockCore.searchDoctors!.mockResolvedValue(listings);

      const params = { name: 'amine', city: 'Casablanca', limit: 8 };
      const result = await service.searchDoctors(params);

      expect(result).toEqual(listings);
      expect(mockCore.searchDoctors).toHaveBeenCalledWith(params);
    });

    it('coerces an unexpected error into a DatabaseError', async () => {
      mockCore.searchDoctors!.mockRejectedValue(new Error('boom'));

      await expect(service.searchDoctors({ name: 'x' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('getClinic', () => {
    it('should return clinic successfully, mapped to web type', async () => {
      const coreClinic = mockCoreClinic();
      mockCore.getClinic!.mockResolvedValue(coreClinic);

      const result = await service.getClinic('clinic-123');

      expect(result.id).toBe('clinic-123');
      expect(result.name).toBe('Test Clinic');
      expect(result.nameAr).toBe('عيادة تجريبية');
      expect(result.phone).toBe('+212612345678');
      expect(result.isActive).toBe(true);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(mockCore.getClinic).toHaveBeenCalledWith('clinic-123');
    });

    it('should throw NotFoundError when clinic not found', async () => {
      mockCore.getClinic!.mockRejectedValue(new NotFoundError('Clinic', 'clinic-123'));

      await expect(service.getClinic('clinic-123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getClinicByOwner', () => {
    it('should return clinic when found', async () => {
      const coreClinic = mockCoreClinic({ ownerId: 'owner-123' });
      mockCore.getClinicsByOwner!.mockResolvedValue([coreClinic]);

      const result = await service.getClinicByOwner('owner-123');

      expect(result).not.toBeNull();
      expect(result!.ownerId).toBe('owner-123');
      expect(mockCore.getClinicsByOwner).toHaveBeenCalledWith('owner-123');
    });

    it('should return null when clinic not found', async () => {
      mockCore.getClinicsByOwner!.mockResolvedValue([]);

      const result = await service.getClinicByOwner('owner-123');

      expect(result).toBeNull();
    });
  });

  describe('getClinicSettings', () => {
    it('should return clinic settings successfully', async () => {
      const coreSettings = {
        buffer_time: 15,
        working_hours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
        },
        allow_walk_ins: true,
        max_queue_size: 50,
        average_appointment_duration: 30,
      };
      mockCore.getClinicSettings!.mockResolvedValue(coreSettings);

      const result = await service.getClinicSettings('clinic-123');

      expect(result.buffer_time).toBe(15);
      expect(result.allow_walk_ins).toBe(true);
      expect(result.max_queue_size).toBe(50);
      expect(mockCore.getClinicSettings).toHaveBeenCalledWith('clinic-123');
    });

    it('should return empty object when settings not found', async () => {
      mockCore.getClinicSettings!.mockResolvedValue(null);

      const result = await service.getClinicSettings('clinic-123');

      expect(result).toEqual({});
    });
  });

  describe('updateClinicSettings', () => {
    it('should update clinic settings successfully', async () => {
      const currentSettings = { buffer_time: 15, allow_walk_ins: true };
      mockCore.getClinicSettings!.mockResolvedValue(currentSettings);
      mockCore.updateClinicSettings!.mockResolvedValue({} as never);

      const result = await service.updateClinicSettings('clinic-123', {
        buffer_time: 20,
        max_queue_size: 100,
      });

      expect(result.buffer_time).toBe(20);
      expect(result.max_queue_size).toBe(100);
      expect(result.allow_walk_ins).toBe(true); // Preserved from current
      expect(mockCore.updateClinicSettings).toHaveBeenCalled();
    });
  });

  describe('updateClinic', () => {
    it('should update clinic information successfully', async () => {
      const updateData: Partial<Clinic> = {
        name: 'Updated Clinic Name',
        email: 'updated@example.com',
        isActive: false,
      };

      const coreResult = mockCoreClinic({
        name: 'Updated Clinic Name',
        email: 'updated@example.com',
        isActive: false,
      });
      mockCore.updateClinic!.mockResolvedValue(coreResult);

      const result = await service.updateClinic('clinic-123', updateData);

      expect(result.name).toBe(updateData.name);
      expect(result.email).toBe(updateData.email);
      expect(result.isActive).toBe(updateData.isActive);
      expect(mockCore.updateClinic).toHaveBeenCalled();
    });

    it('should throw DatabaseError on update failure', async () => {
      mockCore.updateClinic!.mockRejectedValue(new Error('Update failed'));

      await expect(service.updateClinic('clinic-123', { name: 'New Name' })).rejects.toThrow(
        DatabaseError
      );
    });
  });
});

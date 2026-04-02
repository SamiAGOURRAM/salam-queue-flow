/**
 * PatientService Tests
 * Comprehensive tests for patient management business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatientService } from './PatientService';
import { PatientRepository } from './repositories/PatientRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, DatabaseError } from '../shared/errors';
import { createMockPatientProfile } from '../../test/utils/testHelpers';

// Mock dependencies
vi.mock('../shared/logging/Logger');

describe('PatientService', () => {
  let service: PatientService;
  let mockRepository: Partial<PatientRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = {
      findPatientByPhone: vi.fn(),
      findWalkInPatientByPhone: vi.fn(),
      createWalkInPatient: vi.fn(),
      getPatientProfile: vi.fn(),
      updatePatientProfile: vi.fn(),
      getWalkInPatient: vi.fn(),
    };
    service = new PatientService(mockRepository as PatientRepository);
  });

  describe('findOrCreatePatient', () => {
    it('should return existing registered patient', async () => {
      const phoneNumber = '+212612345678';
      const fullName = 'Test Patient';
      const mockPatient = {
        id: 'patient-123',
        phone_number: phoneNumber,
        full_name: fullName,
        email: null,
        preferred_language: null,
        notification_preferences: null,
        no_show_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.findPatientByPhone = vi.fn().mockResolvedValue(mockPatient);
      mockRepository.findWalkInPatientByPhone = vi.fn().mockResolvedValue(null);

      const result = await service.findOrCreatePatient(phoneNumber, fullName);

      expect(result.patientId).toBe('patient-123');
      expect(result.isNew).toBe(false);
      expect(mockRepository.findPatientByPhone).toHaveBeenCalledWith(phoneNumber);
      expect(mockRepository.findWalkInPatientByPhone).not.toHaveBeenCalled();
    });

    it('should return existing walk-in patient', async () => {
      const phoneNumber = '+212612345678';
      const fullName = 'Walk-In Patient';
      const mockWalkIn = {
        id: 'walkin-123',
        phone_number: phoneNumber,
        full_name: fullName,
        source: 'walk_in',
        is_claimed: false,
        claimed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.findPatientByPhone = vi.fn().mockResolvedValue(null);
      mockRepository.findWalkInPatientByPhone = vi.fn().mockResolvedValue(mockWalkIn);

      const result = await service.findOrCreatePatient(phoneNumber, fullName);

      expect(result.patientId).toBe('walkin-123');
      expect(result.isNew).toBe(false);
      expect(mockRepository.findWalkInPatientByPhone).toHaveBeenCalledWith(phoneNumber);
    });

    it('should create new walk-in patient when none exists', async () => {
      const phoneNumber = '+212612345678';
      const fullName = 'New Walk-In';
      const mockWalkIn = {
        id: 'walkin-new',
        phone_number: phoneNumber,
        full_name: fullName,
        source: 'walk_in',
        is_claimed: false,
        claimed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.findPatientByPhone = vi.fn().mockResolvedValue(null);
      mockRepository.findWalkInPatientByPhone = vi.fn().mockResolvedValue(null);
      mockRepository.createWalkInPatient = vi.fn().mockResolvedValue(mockWalkIn);

      const result = await service.findOrCreatePatient(phoneNumber, fullName);

      expect(result.patientId).toBe('walkin-new');
      expect(result.isNew).toBe(true);
      expect(mockRepository.createWalkInPatient).toHaveBeenCalledWith(fullName, phoneNumber);
    });

    it('should throw DatabaseError on unexpected errors', async () => {
      const phoneNumber = '+212612345678';
      const fullName = 'Test Patient';
      const error = new Error('Unexpected error');

      mockRepository.findPatientByPhone = vi.fn().mockRejectedValue(error);

      await expect(service.findOrCreatePatient(phoneNumber, fullName)).rejects.toThrow(
        DatabaseError
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getPatientProfile', () => {
    it('should return patient profile successfully', async () => {
      const patientId = 'patient-123';
      const mockProfile = {
        id: patientId,
        phone_number: '+212612345678',
        full_name: 'Test Patient',
        email: 'test@example.com',
        preferred_language: 'ar',
        notification_preferences: { sms: true },
        no_show_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getPatientProfile = vi.fn().mockResolvedValue(mockProfile);

      const result = await service.getPatientProfile(patientId);

      expect(result.id).toBe(patientId);
      expect(result.phoneNumber).toBe('+212612345678');
      expect(result.fullName).toBe('Test Patient');
      expect(result.email).toBe('test@example.com');
      expect(result.preferredLanguage).toBe('ar');
      expect(mockRepository.getPatientProfile).toHaveBeenCalledWith(patientId);
    });

    it('should throw NotFoundError when patient not found', async () => {
      const patientId = 'patient-123';
      const error = new DatabaseError('Patient not found');

      mockRepository.getPatientProfile = vi.fn().mockRejectedValue(error);

      await expect(service.getPatientProfile(patientId)).rejects.toThrow(NotFoundError);
    });

    it('should handle missing optional fields', async () => {
      const patientId = 'patient-123';
      const mockProfile = {
        id: patientId,
        phone_number: '+212612345678',
        full_name: 'Test Patient',
        email: null,
        preferred_language: null,
        notification_preferences: null,
        no_show_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getPatientProfile = vi.fn().mockResolvedValue(mockProfile);

      const result = await service.getPatientProfile(patientId);

      expect(result.email).toBeUndefined();
      expect(result.preferredLanguage).toBeUndefined();
    });
  });

  describe('updatePatientProfile', () => {
    it('should update patient profile successfully', async () => {
      const patientId = 'patient-123';
      const updateData = {
        fullName: 'Updated Name',
        email: 'updated@example.com',
        preferredLanguage: 'fr',
      };

      const existingProfile = {
        id: patientId,
        phone_number: '+212612345678',
        full_name: 'Original Name',
        email: 'original@example.com',
        preferred_language: 'ar',
        notification_preferences: null,
        no_show_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedProfile = {
        ...existingProfile,
        full_name: updateData.fullName,
        email: updateData.email,
        preferred_language: updateData.preferredLanguage,
      };

      mockRepository.updatePatientProfile = vi.fn().mockResolvedValue(undefined);
      mockRepository.getPatientProfile = vi.fn().mockResolvedValue(updatedProfile);

      const result = await service.updatePatientProfile(patientId, updateData);

      expect(result.fullName).toBe(updateData.fullName);
      expect(result.email).toBe(updateData.email);
      expect(result.preferredLanguage).toBe(updateData.preferredLanguage);
      expect(mockRepository.updatePatientProfile).toHaveBeenCalled();
    });

    it('should throw DatabaseError on update failure', async () => {
      const patientId = 'patient-123';
      const error = new Error('Update failed');

      mockRepository.updatePatientProfile = vi.fn().mockRejectedValue(error);

      await expect(
        service.updatePatientProfile(patientId, { fullName: 'New Name' })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getWalkInPatient', () => {
    it('should return walk-in patient successfully', async () => {
      const patientId = 'walkin-123';
      const mockWalkIn = {
        id: patientId,
        phone_number: '+212612345678',
        full_name: 'Walk-In Patient',
        source: 'walk_in',
        is_claimed: true,
        claimed_by: 'user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getWalkInPatient = vi.fn().mockResolvedValue(mockWalkIn);

      const result = await service.getWalkInPatient(patientId);

      expect(result.id).toBe(patientId);
      expect(result.phoneNumber).toBe('+212612345678');
      expect(result.fullName).toBe('Walk-In Patient');
      expect(result.isClaimed).toBe(true);
      expect(result.claimedBy).toBe('user-123');
      expect(mockRepository.getWalkInPatient).toHaveBeenCalledWith(patientId);
    });

    it('should throw NotFoundError when walk-in patient not found', async () => {
      const patientId = 'walkin-123';
      const error = new DatabaseError('Walk-in patient not found');

      mockRepository.getWalkInPatient = vi.fn().mockRejectedValue(error);

      await expect(service.getWalkInPatient(patientId)).rejects.toThrow(NotFoundError);
    });

    it('should handle unclaimed walk-in patient', async () => {
      const patientId = 'walkin-123';
      const mockWalkIn = {
        id: patientId,
        phone_number: '+212612345678',
        full_name: 'Walk-In Patient',
        source: 'walk_in',
        is_claimed: false,
        claimed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepository.getWalkInPatient = vi.fn().mockResolvedValue(mockWalkIn);

      const result = await service.getWalkInPatient(patientId);

      expect(result.isClaimed).toBe(false);
      expect(result.claimedBy).toBeUndefined();
    });
  });
});


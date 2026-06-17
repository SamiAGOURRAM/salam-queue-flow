/**
 * PatientService Tests
 *
 * NOW: thin facade over @queuemed/core's PatientService.
 * Tests mock the core service instead of the (now-deleted) web PatientRepository.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatientService } from './PatientService';
import { NotFoundError, DatabaseError } from '../shared/errors';
import { PatientSource } from './models/PatientModels';

// Mock logger
vi.mock('../shared/logging/Logger');

/** Core PatientProfile shape (camelCase, string dates) returned by the mock. */
function coreProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'patient-123',
    fullName: 'Test Patient',
    phoneNumber: '+212612345678',
    email: 'test@example.com',
    city: 'Casablanca',
    preferredLanguage: 'ar',
    notificationPreferences: { sms: true },
    noShowCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PatientService (facade)', () => {
  let service: PatientService;
  let mockCore: {
    findOrCreatePatient: ReturnType<typeof vi.fn>;
    getPatientProfile: ReturnType<typeof vi.fn>;
    updatePatientProfile: ReturnType<typeof vi.fn>;
    getWalkInPatient: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCore = {
      findOrCreatePatient: vi.fn(),
      getPatientProfile: vi.fn(),
      updatePatientProfile: vi.fn(),
      getWalkInPatient: vi.fn(),
    };
    service = new PatientService(mockCore as unknown as ConstructorParameters<typeof PatientService>[0]);
  });

  describe('findOrCreatePatient', () => {
    it('delegates to core and returns an existing patient', async () => {
      mockCore.findOrCreatePatient.mockResolvedValue({ patientId: 'patient-123', isNew: false });

      const result = await service.findOrCreatePatient('+212612345678', 'Test Patient');

      expect(result).toEqual({ patientId: 'patient-123', isNew: false });
      expect(mockCore.findOrCreatePatient).toHaveBeenCalledWith('+212612345678', 'Test Patient');
    });

    it('returns isNew=true when core creates a walk-in', async () => {
      mockCore.findOrCreatePatient.mockResolvedValue({ patientId: 'walkin-new', isNew: true });

      const result = await service.findOrCreatePatient('+212600000000', 'New Walk-In');

      expect(result.isNew).toBe(true);
      expect(result.patientId).toBe('walkin-new');
    });

    it('coerces an unexpected error into a DatabaseError', async () => {
      mockCore.findOrCreatePatient.mockRejectedValue(new Error('boom'));

      await expect(service.findOrCreatePatient('+212612345678', 'x')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getPatientProfile', () => {
    it('maps the core profile to the web shape (string → Date)', async () => {
      mockCore.getPatientProfile.mockResolvedValue(coreProfile());

      const result = await service.getPatientProfile('patient-123');

      expect(result.id).toBe('patient-123');
      expect(result.fullName).toBe('Test Patient');
      expect(result.phoneNumber).toBe('+212612345678');
      expect(result.email).toBe('test@example.com');
      expect(result.city).toBe('Casablanca');
      expect(result.preferredLanguage).toBe('ar');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(mockCore.getPatientProfile).toHaveBeenCalledWith('patient-123');
    });

    it('propagates NotFoundError from core', async () => {
      mockCore.getPatientProfile.mockRejectedValue(new NotFoundError('Patient', 'patient-123'));

      await expect(service.getPatientProfile('patient-123')).rejects.toThrow(NotFoundError);
    });

    it('handles missing optional fields', async () => {
      mockCore.getPatientProfile.mockResolvedValue(
        coreProfile({ email: undefined, preferredLanguage: undefined, city: undefined }),
      );

      const result = await service.getPatientProfile('patient-123');

      expect(result.email).toBeUndefined();
      expect(result.preferredLanguage).toBeUndefined();
      expect(result.city).toBeUndefined();
    });
  });

  describe('updatePatientProfile', () => {
    it('forwards only patient-level fields to core and maps the result', async () => {
      mockCore.updatePatientProfile.mockResolvedValue(
        coreProfile({ fullName: 'Updated Name', email: 'updated@example.com' }),
      );

      const result = await service.updatePatientProfile('patient-123', {
        fullName: 'Updated Name',
        email: 'updated@example.com',
        city: 'Rabat',
      });

      expect(result.fullName).toBe('Updated Name');
      expect(result.email).toBe('updated@example.com');
      expect(mockCore.updatePatientProfile).toHaveBeenCalledWith('patient-123', {
        fullName: 'Updated Name',
        phoneNumber: undefined,
        email: 'updated@example.com',
        city: 'Rabat',
      });
    });

    it('coerces an unexpected error into a DatabaseError', async () => {
      mockCore.updatePatientProfile.mockRejectedValue(new Error('Update failed'));

      await expect(service.updatePatientProfile('patient-123', { fullName: 'X' })).rejects.toThrow(
        DatabaseError,
      );
    });
  });

  describe('getWalkInPatient', () => {
    it('maps a core walk-in patient to the web shape', async () => {
      mockCore.getWalkInPatient.mockResolvedValue({
        id: 'walkin-123',
        phoneNumber: '+212612345678',
        fullName: 'Walk-In Patient',
        source: PatientSource.WALK_IN,
        isClaimed: true,
        claimedBy: 'user-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.getWalkInPatient('walkin-123');

      expect(result.id).toBe('walkin-123');
      expect(result.fullName).toBe('Walk-In Patient');
      expect(result.isClaimed).toBe(true);
      expect(result.claimedBy).toBe('user-123');
      expect(result.source).toBe(PatientSource.WALK_IN);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('maps an unclaimed walk-in (no claimedBy)', async () => {
      mockCore.getWalkInPatient.mockResolvedValue({
        id: 'walkin-123',
        phoneNumber: '+212612345678',
        fullName: 'Walk-In Patient',
        source: PatientSource.WALK_IN,
        isClaimed: false,
        claimedBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.getWalkInPatient('walkin-123');

      expect(result.isClaimed).toBe(false);
      expect(result.claimedBy).toBeUndefined();
    });

    it('raises NotFoundError when core reports the patient is missing', async () => {
      mockCore.getWalkInPatient.mockRejectedValue(new Error('Walk-in patient not found'));

      await expect(service.getWalkInPatient('walkin-123')).rejects.toThrow(NotFoundError);
    });
  });
});

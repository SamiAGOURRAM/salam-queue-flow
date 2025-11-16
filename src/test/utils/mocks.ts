/**
 * Mock Factories
 * Reusable mock implementations for testing
 */

import { vi } from 'vitest';
import type { QueueRepository } from '@/services/queue/repositories/QueueRepository';
import type { PatientRepository } from '@/services/patient/repositories/PatientRepository';
import type { ClinicRepository } from '@/services/clinic/repositories/ClinicRepository';
import type { StaffRepository } from '@/services/staff/repositories/StaffRepository';
import { createMockQueueEntry } from './testHelpers';
import { createMockPatientProfile } from './testHelpers';

/**
 * Create a mock QueueRepository
 */
export function createMockQueueRepository(): Partial<QueueRepository> {
  return {
    getDailySchedule: vi.fn(),
    getQueueEntryById: vi.fn(),
    createQueueEntryViaRpc: vi.fn(),
    updateQueueEntry: vi.fn(),
    markAbsent: vi.fn(),
    markReturned: vi.fn(),
    callNextPatient: vi.fn(),
    recalculateQueuePositions: vi.fn(),
    getClinicEstimationConfig: vi.fn(),
    recordActualWaitTime: vi.fn(),
    recordQueueSnapshot: vi.fn(),
    getQueueSummary: vi.fn(),
  };
}

/**
 * Create a mock PatientRepository
 */
export function createMockPatientRepository(): Partial<PatientRepository> {
  return {
    findPatientByPhone: vi.fn(),
    findGuestPatientByPhone: vi.fn(),
    createGuestPatient: vi.fn(),
    getPatientProfile: vi.fn(),
    updatePatientProfile: vi.fn(),
    getPatientHistory: vi.fn(),
  };
}

/**
 * Create a mock ClinicRepository
 */
export function createMockClinicRepository(): Partial<ClinicRepository> {
  return {
    getClinicById: vi.fn(),
    searchClinics: vi.fn(),
    getClinicSettings: vi.fn(),
    updateClinicSettings: vi.fn(),
  };
}

/**
 * Create a mock StaffRepository
 */
export function createMockStaffRepository(): Partial<StaffRepository> {
  return {
    getStaffById: vi.fn(),
    getStaffByUserId: vi.fn(),
    getStaffByClinic: vi.fn(),
    createStaff: vi.fn(),
    updateStaff: vi.fn(),
    deleteStaff: vi.fn(),
  };
}

/**
 * Helper to reset all mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();
}


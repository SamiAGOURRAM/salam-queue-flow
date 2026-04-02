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
    checkInPatient: vi.fn(),
    createAbsentPatient: vi.fn(),
    markPatientReturned: vi.fn(),
    createQueueOverride: vi.fn(),
    getNextQueuePosition: vi.fn(),
    getClinicEstimationConfigByStaffId: vi.fn(),
    recordActualWaitTime: vi.fn(),
    recordWaitTimePredictions: vi.fn(),
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
    getGuestPatient: vi.fn(),
  };
}

/**
 * Create a mock ClinicRepository
 */
export function createMockClinicRepository(): Partial<ClinicRepository> {
  return {
    getClinic: vi.fn(),
    getClinicByOwner: vi.fn(),
    getClinicSettings: vi.fn(),
    updateClinicSettings: vi.fn(),
    updateClinic: vi.fn(),
  };
}

/**
 * Create a mock StaffRepository
 */
export function createMockStaffRepository(): Partial<StaffRepository> {
  return {
    getStaffById: vi.fn(),
    getStaffByUser: vi.fn(),
    getStaffByClinic: vi.fn(),
    getStaffByClinicAndUser: vi.fn(),
    addStaff: vi.fn(),
    updateStaff: vi.fn(),
    removeStaff: vi.fn(),
  };
}

/**
 * Helper to reset all mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();
}


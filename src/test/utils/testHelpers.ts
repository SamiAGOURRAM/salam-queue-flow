/**
 * Test Helper Utilities
 * Common utilities for writing tests
 */

import type { QueueEntry } from '@/services/queue/models/QueueModels';
import { AppointmentStatus, AppointmentType } from '@/services/queue/models/QueueModels';
import type { PatientProfile } from '@/services/patient/PatientService';

/**
 * Create a mock queue entry for testing
 */
export function createMockQueueEntry(overrides?: Partial<QueueEntry>): QueueEntry {
  const now = new Date();
  return {
    id: 'appointment-123',
    clinicId: 'clinic-123',
    patientId: 'patient-123',
    guestPatientId: undefined,
    staffId: 'staff-123',
    startTime: now,
    endTime: new Date(now.getTime() + 30 * 60 * 1000),
    appointmentDate: now,
    scheduledTime: now.toISOString().split('T')[1].substring(0, 5), // HH:mm format
    queuePosition: 1,
    originalQueuePosition: undefined,
    status: AppointmentStatus.SCHEDULED,
    appointmentType: AppointmentType.CONSULTATION,
    isPresent: true,
    markedAbsentAt: undefined,
    returnedAt: undefined,
    skipCount: 0,
    skipReason: undefined,
    overrideBy: undefined,
    checkedInAt: undefined,
    actualStartTime: undefined,
    actualEndTime: undefined,
    estimatedDurationMinutes: 30,
    estimatedWaitTime: undefined,
    predictionMode: undefined,
    predictionConfidence: undefined,
    predictedStartTime: undefined,
    etaSource: undefined,
    etaUpdatedAt: undefined,
    createdAt: now,
    updatedAt: now,
    isGuest: false,
    ...overrides,
  };
}

/**
 * Create a mock patient profile for testing
 */
export function createMockPatientProfile(overrides?: Partial<PatientProfile>): PatientProfile {
  const now = new Date();
  return {
    id: 'patient-123',
    phoneNumber: '+212612345678',
    fullName: 'Test Patient',
    email: 'test@example.com',
    preferredLanguage: 'ar',
    notificationPreferences: {},
    noShowCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a mock Supabase response
 */
export function createMockSupabaseResponse<T>(data: T | null, error: any = null) {
  return {
    data,
    error,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitFor(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a date string for testing
 */
export function createTestDate(daysOffset: number = 0, hours: number = 9, minutes: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}


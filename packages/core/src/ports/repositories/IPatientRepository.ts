/**
 * Patient Repository Port
 *
 * Defines the contract for patient data access.
 * Implementations: SupabasePatientRepository, MySQLPatientRepository, etc.
 */

import type { Patient, PatientProfile, QueueEntry, WalkInPatient } from '../../types.js';

export interface IPatientRepository {
  /** Get patient by ID (profile lookup). */
  getById(patientId: string): Promise<Patient | null>;

  /**
   * Resolve a patient by phone via the `find_patient_by_phone` RPC.
   * Returns the matched record (claimed = registered app user, unclaimed =
   * existing walk-in) or null if none exists.
   */
  findByPhoneRpc(phoneNumber: string): Promise<{ id: string; isClaimed: boolean } | null>;

  /** Create a walk-in (receptionist-entered) patient. Returns the new id. */
  createWalkInPatient(fullName: string, phoneNumber: string): Promise<{ id: string }>;

  /** Get a walk-in patient by id (PII decrypted via RPC). */
  getWalkInPatient(patientId: string): Promise<WalkInPatient>;

  /** Get patient by phone number. */
  getByPhoneNumber(phoneNumber: string): Promise<Patient | null>;

  /** Get patient profile with extended info. */
  getProfile(patientId: string): Promise<PatientProfile | null>;

  /** Get patient's appointments with optional filters. */
  getAppointments(
    patientId: string,
    options?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    },
  ): Promise<QueueEntry[]>;

  /** Get upcoming (scheduled, future) appointments for a patient. */
  getUpcomingAppointments(patientId: string, limit?: number): Promise<QueueEntry[]>;

  /** Update patient profile fields. */
  updateProfile(patientId: string, updates: Partial<Patient>): Promise<Patient>;
}

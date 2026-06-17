/**
 * Clinic Repository Port
 *
 * Defines the contract for clinic data access.
 * Implementations: SupabaseClinicRepository, MySQLClinicRepository, etc.
 */

import type { Clinic, ClinicSettings, DoctorListing, DoctorSearchParams } from '../../types.js';

export interface ClinicSearchParams {
  city?: string;
  specialty?: string;
  name?: string;
  limit?: number;
  offset?: number;
}

export interface IClinicRepository {
  /** Get clinic by ID. */
  getById(clinicId: string): Promise<Clinic | null>;

  /** Search clinics by city, specialty, name. */
  search(params: ClinicSearchParams): Promise<Clinic[]>;

  /** Search doctors (active providers at active clinics) for patient-facing discovery. */
  searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]>;

  /** Get clinic settings. */
  getSettings(clinicId: string): Promise<ClinicSettings | null>;

  /** Update clinic settings (merges with existing). */
  updateSettings(clinicId: string, settings: Partial<ClinicSettings>): Promise<Clinic>;

  /** Get clinics by owner ID. */
  getByOwnerId(ownerId: string): Promise<Clinic[]>;

  /** Update clinic metadata fields (name, address, specialty, etc. — NOT settings). */
  updateClinic(clinicId: string, data: Partial<Clinic>): Promise<Clinic>;
}

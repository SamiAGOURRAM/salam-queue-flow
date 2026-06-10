/**
 * Clinic Repository - Data access for clinic management
 */

import { BaseRepository } from '../base/BaseRepository.js';
import type { IDatabaseClient } from '../../ports/database.js';
import type { ILogger } from '../../ports/logger.js';
import type { Clinic, ClinicSettings, DoctorListing, DoctorSearchParams, Tables } from '../../types.js';
import { NotFoundError } from '../../errors.js';

/** Row shapes for searchDoctors, derived from the generated schema (only the selected columns). */
type ClinicRow = Pick<Tables<'clinics'>, 'id' | 'name' | 'specialty' | 'city'>;
type StaffRow = Pick<Tables<'clinic_staff'>, 'id' | 'clinic_id' | 'user_id' | 'role' | 'specialization'>;
type ProfileRow = Pick<Tables<'profiles'>, 'id' | 'full_name'>;

export interface ClinicSearchParams {
  city?: string;
  specialty?: string;
  name?: string;
  limit?: number;
  offset?: number;
}

/**
 * Whether a staff row should surface as a bookable "doctor" in patient discovery.
 * ROLE-BASED only: the role must say "doctor" or be a known clinical role. A free-text
 * `specialization` is NOT sufficient (a receptionist with a specialization must not be
 * bookable). Kept in parity with the web DoctorDirectory.
 */
function isDoctorLikeRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  if (normalized.includes('doctor')) return true;
  const clinicalRoles = new Set([
    'surgeon', 'dentist', 'radiologist', 'anesthesiologist', 'physiotherapist',
    'cardiologist', 'neurologist', 'pediatrician', 'orthopedist', 'dermatologist',
  ]);
  return clinicalRoles.has(normalized);
}

export class ClinicRepository extends BaseRepository {
  constructor(db: IDatabaseClient, logger: ILogger) {
    super(db, logger, 'ClinicRepository');
  }

  /**
   * Get clinic by ID
   */
  async getById(clinicId: string): Promise<Clinic | null> {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logError('Failed to get clinic', new Error(error.message), { clinicId });
      throw new Error(error.message || 'Failed to get clinic');
    }

    return this.mapToClinic(data);
  }

  /**
   * Search clinics
   */
  async search(params: ClinicSearchParams): Promise<Clinic[]> {
    const client = this.db.getClient();
    let query = client
      .from('clinics')
      .select('*');

    if (params.city) {
      query = query.ilike('city', `%${params.city}%`);
    }

    if (params.specialty) {
      query = query.ilike('specialty', `%${params.specialty}%`);
    }

    if (params.name) {
      query = query.ilike('name', `%${params.name}%`);
    }

    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      this.logError('Failed to search clinics', new Error(error.message), params as Record<string, unknown>);
      throw new Error(error.message || 'Failed to search clinics');
    }

    return (data || []).map(row => this.mapToClinic(row));
  }

  /**
   * Search doctors (active providers at active clinics) for patient discovery.
   * Mirrors the web DoctorDirectory join: clinics → clinic_staff → profiles.
   * city/specialty filter the clinic; name filters the provider's full name.
   * Returns only public-facing fields (no PHI).
   */
  async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]> {
    const client = this.db.getClient();

    // 1) Active clinics (apply clinic-level filters here).
    let clinicQuery = client
      .from('clinics')
      .select('id, name, specialty, city')
      .eq('is_active', true);
    if (params.city) clinicQuery = clinicQuery.ilike('city', `%${params.city}%`);
    if (params.specialty) clinicQuery = clinicQuery.ilike('specialty', `%${params.specialty}%`);

    const { data: clinicsData, error: clinicsError } = await clinicQuery;
    if (clinicsError) {
      this.logError('Failed to search doctors (clinics)', new Error(clinicsError.message), params as Record<string, unknown>);
      throw new Error(clinicsError.message || 'Failed to search doctors');
    }
    const clinicsById = new Map(
      ((clinicsData ?? []) as ClinicRow[]).map((c) => [c.id, c]),
    );
    if (clinicsById.size === 0) return [];

    // 2) Active staff at those clinics; keep only doctor-like roles.
    // Bounded fetch: the JS-side `limit` is applied after doctor/name filtering,
    // so cap the DB read to avoid pulling an unbounded staff set into memory.
    const MAX_STAFF_SCAN = 200;
    const { data: staffData, error: staffError } = await client
      .from('clinic_staff')
      .select('id, clinic_id, user_id, role, specialization')
      .eq('is_active', true)
      .in('clinic_id', [...clinicsById.keys()])
      .limit(MAX_STAFF_SCAN);
    if (staffError) {
      this.logError('Failed to search doctors (staff)', new Error(staffError.message), params as Record<string, unknown>);
      throw new Error(staffError.message || 'Failed to search doctors');
    }
    const doctorStaff = ((staffData ?? []) as StaffRow[]).filter((s) =>
      isDoctorLikeRole(s.role),
    );
    if (doctorStaff.length === 0) return [];

    // 3) Provider names.
    const userIds = [...new Set(doctorStaff.map((s) => s.user_id))];
    const { data: profilesData, error: profilesError } = await client
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    if (profilesError) {
      this.logError('Failed to search doctors (profiles)', new Error(profilesError.message), params as Record<string, unknown>);
      throw new Error(profilesError.message || 'Failed to search doctors');
    }
    const nameByUserId = new Map(
      ((profilesData ?? []) as ProfileRow[]).map((p) => [p.id, p.full_name ?? '']),
    );

    // 4) Join + name filter + limit.
    const nameFilter = params.name?.toLowerCase();
    const listings: DoctorListing[] = [];
    for (const s of doctorStaff) {
      const clinic = clinicsById.get(s.clinic_id);
      if (!clinic) continue;
      const fullName = (nameByUserId.get(s.user_id) ?? '').trim();
      if (nameFilter && !fullName.toLowerCase().includes(nameFilter)) continue;
      listings.push({
        staffId: s.id,
        clinicId: clinic.id,
        fullName: fullName || 'Doctor',
        role: s.role,
        specialization: s.specialization || undefined,
        clinicName: clinic.name,
        clinicSpecialty: clinic.specialty || undefined,
        city: clinic.city || undefined,
      });
      if (params.limit && listings.length >= params.limit) break;
    }
    return listings;
  }

  /**
   * Get clinic settings
   */
  async getSettings(clinicId: string): Promise<ClinicSettings | null> {
    const clinic = await this.getById(clinicId);
    return clinic?.settings || null;
  }

  /**
   * Update clinic settings
   */
  async updateSettings(clinicId: string, settings: Partial<ClinicSettings>): Promise<Clinic> {
    const client = this.db.getClient();
    
    // First get current settings
    const current = await this.getById(clinicId);
    if (!current) {
      throw new NotFoundError('Clinic', clinicId);
    }

    const updatedSettings = {
      ...current.settings,
      ...settings
    };

    const { data, error } = await client
      .from('clinics')
      .update({ settings: updatedSettings })
      .eq('id', clinicId)
      .select()
      .single();

    if (error) {
      this.logError('Failed to update clinic settings', new Error(error.message), { clinicId });
      throw error;
    }

    return this.mapToClinic(data);
  }

  /**
   * Get clinics by owner ID
   */
  async getByOwnerId(ownerId: string): Promise<Clinic[]> {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('clinics')
      .select('*')
      .eq('owner_id', ownerId);

    if (error) {
      this.logError('Failed to get clinics by owner', new Error(error.message), { ownerId });
      throw error;
    }

    return (data || []).map(row => this.mapToClinic(row));
  }

  /**
   * Map database row to Clinic
   */
  private mapToClinic(row: Record<string, unknown>): Clinic {
    return {
      id: row.id as string,
      name: row.name as string,
      specialty: row.specialty as string | undefined,
      address: row.address as string | undefined,
      city: row.city as string | undefined,
      phoneNumber: row.phone_number as string | undefined,
      email: row.email as string | undefined,
      settings: row.settings as ClinicSettings | undefined,
      createdAt: row.created_at as string
    };
  }
}


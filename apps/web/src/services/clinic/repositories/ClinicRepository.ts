/**
 * Clinic Repository
 * Handles all data access for clinic operations
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import type { DoctorListing, DoctorSearchParams } from '@queuemed/core';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';
import { isDoctorLikeRole } from '@/lib/isDoctorLikeRole';

/** Row shapes for searchDoctors, derived from the generated schema (only the selected columns). */
type DoctorClinicRow = Pick<Database['public']['Tables']['clinics']['Row'], 'id' | 'name' | 'specialty' | 'city'>;
type DoctorStaffRow = Pick<Database['public']['Tables']['clinic_staff']['Row'], 'id' | 'clinic_id' | 'user_id' | 'role' | 'specialization'>;
type DoctorProfileRow = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name'>;

/**
 * Cap the staff read so a growing roster never pulls an unbounded set into memory.
 * The caller's `limit` is applied AFTER doctor/name filtering, so this is a safety
 * ceiling, not the result size. Mirrors @queuemed/core.
 */
const MAX_STAFF_SCAN = 200;

export interface ClinicRow {
  id: string;
  name: string;
  name_ar?: string | null;
  owner_id: string;
  practice_type: string;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  email?: string | null;
  logo_url?: string | null;
  settings: Record<string, unknown> | null;
  subscription_tier: string;
  is_active: boolean;
  queue_mode?: string | null;
  grace_period_minutes?: number | null;
  allow_overflow?: boolean | null;
  daily_capacity_limit?: number | null;
  created_at: string;
  updated_at: string;
}

export class ClinicRepository {
  /**
   * Get clinic by ID
   */
  async getClinic(clinicId: string): Promise<ClinicRow> {
    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', clinicId)
        .single();

      if (error || !data) {
        logger.error('Clinic not found', error, { clinicId });
        throw new DatabaseError('Clinic not found', error);
      }

      return data as ClinicRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error getting clinic', error as Error);
    }
  }

  /**
   * Search doctors (active providers at active clinics) for patient discovery.
   * Mirrors @queuemed/core's ClinicRepository: clinics → clinic_staff → profiles.
   * city/specialty filter the clinic (ilike-contains); name filters the provider's
   * full name. Returns only public-facing fields (no PHI).
   */
  async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]> {
    try {
      // 1) Active clinics (apply clinic-level filters here).
      let clinicQuery = supabase
        .from('clinics')
        .select('id, name, specialty, city')
        .eq('is_active', true);
      if (params.city) clinicQuery = clinicQuery.ilike('city', `%${params.city}%`);
      if (params.specialty) clinicQuery = clinicQuery.ilike('specialty', `%${params.specialty}%`);

      const { data: clinicsData, error: clinicsError } = await clinicQuery;
      if (clinicsError) {
        logger.error('Failed to search doctors (clinics)', clinicsError, params as Record<string, unknown>);
        throw new DatabaseError('Failed to search doctors', clinicsError);
      }
      const clinicsById = new Map(
        ((clinicsData ?? []) as DoctorClinicRow[]).map((c) => [c.id, c]),
      );
      if (clinicsById.size === 0) return [];

      // 2) Active staff at those clinics; keep only doctor-like roles.
      const { data: staffData, error: staffError } = await supabase
        .from('clinic_staff')
        .select('id, clinic_id, user_id, role, specialization')
        .eq('is_active', true)
        .in('clinic_id', [...clinicsById.keys()])
        .limit(MAX_STAFF_SCAN);
      if (staffError) {
        logger.error('Failed to search doctors (staff)', staffError, params as Record<string, unknown>);
        throw new DatabaseError('Failed to search doctors', staffError);
      }
      const doctorStaff = ((staffData ?? []) as DoctorStaffRow[]).filter((s) => isDoctorLikeRole(s.role));
      if (doctorStaff.length === 0) return [];

      // 3) Provider names.
      const userIds = [...new Set(doctorStaff.map((s) => s.user_id))];
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      if (profilesError) {
        logger.error('Failed to search doctors (profiles)', profilesError, params as Record<string, unknown>);
        throw new DatabaseError('Failed to search doctors', profilesError);
      }
      const nameByUserId = new Map(
        ((profilesData ?? []) as DoctorProfileRow[]).map((p) => [p.id, p.full_name ?? '']),
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
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error searching doctors', error as Error, params as Record<string, unknown>);
      throw new DatabaseError('Unexpected error searching doctors', error as Error);
    }
  }

  /**
   * Get clinic by owner ID
   */
  async getClinicByOwner(ownerId: string): Promise<ClinicRow | null> {
    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to get clinic by owner', error, { ownerId });
        throw new DatabaseError('Failed to get clinic by owner', error);
      }

      return data as ClinicRow | null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting clinic by owner', error as Error, { ownerId });
      throw new DatabaseError('Unexpected error getting clinic by owner', error as Error);
    }
  }

  /**
   * Get clinic settings
   */
  async getClinicSettings(clinicId: string): Promise<Record<string, unknown> | null> {
    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('settings')
        .eq('id', clinicId)
        .single();

      if (error || !data) {
        logger.error('Clinic not found', error, { clinicId });
        throw new DatabaseError('Clinic not found', error);
      }

      return data.settings as Record<string, unknown> | null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting clinic settings', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error getting clinic settings', error as Error);
    }
  }

  /**
   * Update clinic settings
   */
  async updateClinicSettings(clinicId: string, settings: Record<string, unknown>): Promise<void> {
    try {
      const { error } = await supabase
        .from('clinics')
        .update({ settings: settings as Json })
        .eq('id', clinicId);

      if (error) {
        logger.error('Failed to update clinic settings', error, { clinicId, settings });
        throw new DatabaseError('Failed to update clinic settings', error);
      }

      logger.info('Clinic settings updated', { clinicId });
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating clinic settings', error as Error, { clinicId, settings });
      throw new DatabaseError('Unexpected error updating clinic settings', error as Error);
    }
  }

  /**
   * Update clinic information
   */
  async updateClinic(clinicId: string, data: Partial<ClinicRow>): Promise<ClinicRow> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.name) updateData.name = data.name;
      if (data.name_ar !== undefined) updateData.name_ar = data.name_ar;
      if (data.specialty) updateData.specialty = data.specialty;
      if (data.address) updateData.address = data.address;
      if (data.city) updateData.city = data.city;
      if (data.phone) updateData.phone = data.phone;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.logo_url !== undefined) updateData.logo_url = data.logo_url;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { error } = await supabase
        .from('clinics')
        .update(updateData)
        .eq('id', clinicId);

      if (error) {
        logger.error('Failed to update clinic', error, { clinicId, data });
        throw new DatabaseError('Failed to update clinic', error);
      }

      logger.info('Clinic updated', { clinicId });
      return this.getClinic(clinicId);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating clinic', error as Error, { clinicId, data });
      throw new DatabaseError('Unexpected error updating clinic', error as Error);
    }
  }
}


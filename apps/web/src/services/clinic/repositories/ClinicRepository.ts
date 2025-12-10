/**
 * Clinic Repository
 * Handles all data access for clinic operations
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

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
  operating_mode: string;
  estimation_mode: string;
  ml_enabled?: boolean | null;
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
        .update({ settings })
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


/**
 * Patient Repository
 * Handles all data access for patient operations
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

export interface PatientProfileRow {
  id: string;
  phone_number: string;
  full_name: string;
  email?: string | null;
  is_claimed?: boolean | null;
  source?: string | null;
  city?: string | null;
  preferred_language?: string | null;
  notification_preferences?: Record<string, unknown> | null;
  no_show_count?: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Walk-in patient row (patients with source != 'app' and user_id IS NULL).
 * Uses the unified patients table - no separate guest_patients table.
 */
export interface WalkInPatientRow {
  id: string;
  phone_number: string;
  full_name: string;
  source: string;
  is_claimed: boolean;
  claimed_by?: string | null;
  created_at: string;
  updated_at: string;
}

export class PatientRepository {
  /**
   * Find patient by phone number
   */
  async findPatientByPhone(phoneNumber: string): Promise<PatientProfileRow | null> {
    try {
      const { data, error } = await supabase.rpc('find_patient_by_phone', {
        p_phone_number: phoneNumber,
      });

      if (error) {
        logger.error('Failed to find patient by phone', error, { phoneNumber });
        throw new DatabaseError('Failed to find patient by phone', error);
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row || !(row.is_claimed as boolean)) return null;

      return {
        id: row.id as string,
        phone_number: phoneNumber,
        full_name: row.full_name as string,
        email: null,
        is_claimed: (row.is_claimed as boolean) ?? null,
        source: (row.source as string) ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error finding patient by phone', error as Error, { phoneNumber });
      throw new DatabaseError('Unexpected error finding patient by phone', error as Error);
    }
  }

  /**
   * Find walk-in patient by phone number (not claimed, no user_id)
   */
  async findWalkInPatientByPhone(phoneNumber: string): Promise<WalkInPatientRow | null> {
    try {
      const { data, error } = await supabase.rpc('find_patient_by_phone', {
        p_phone_number: phoneNumber,
      });

      if (error) {
        logger.error('Failed to find walk-in patient by phone', error, { phoneNumber });
        throw new DatabaseError('Failed to find walk-in patient by phone', error);
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row || (row.is_claimed as boolean)) {
        return null;
      }

      return {
        id: row.id as string,
        phone_number: phoneNumber,
        full_name: row.full_name as string,
        source: (row.source as string) ?? 'walk_in',
        is_claimed: false,
        claimed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error finding walk-in patient by phone', error as Error, { phoneNumber });
      throw new DatabaseError('Unexpected error finding walk-in patient by phone', error as Error);
    }
  }

  /**
   * Create walk-in patient (no app account, receptionist-entered)
   */
  async createWalkInPatient(fullName: string, phoneNumber: string): Promise<WalkInPatientRow> {
    try {
      const { data, error } = await supabase.rpc('create_patient', {
        p_full_name: fullName,
        p_phone_number: phoneNumber,
        p_email: null,
        p_source: 'walk_in',
        p_user_id: null,
        p_created_by: null,
        p_consent_sms: false,
        p_consent_data_processing: true,
        p_consent_given_by: 'patient_verbal',
      });

      if (error || !data) {
        logger.error('Failed to create walk-in patient', error, { fullName, phoneNumber });
        throw new DatabaseError('Failed to create walk-in patient', error);
      }

      return {
        id: data as string,
        phone_number: phoneNumber,
        full_name: fullName,
        source: 'walk_in',
        is_claimed: false,
        claimed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating walk-in patient', error as Error, { fullName, phoneNumber });
      throw new DatabaseError('Unexpected error creating walk-in patient', error as Error);
    }
  }

  /**
   * Get patient profile by ID
   */
  async getPatientProfile(patientId: string): Promise<PatientProfileRow> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', patientId)
        .single();

      if (error || !data) {
        logger.error('Patient not found', error, { patientId });
        throw new DatabaseError('Patient not found', error);
      }

      return data as PatientProfileRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting patient profile', error as Error, { patientId });
      throw new DatabaseError('Unexpected error getting patient profile', error as Error);
    }
  }

  /**
   * Update patient profile
   */
  async updatePatientProfile(patientId: string, data: Partial<PatientProfileRow>): Promise<PatientProfileRow> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.full_name) updateData.full_name = data.full_name;
      if (data.phone_number) updateData.phone_number = data.phone_number;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.preferred_language) updateData.preferred_language = data.preferred_language;
      if (data.notification_preferences) updateData.notification_preferences = data.notification_preferences;

      const { data: updated, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', patientId)
        .select()
        .single();

      if (error || !updated) {
        logger.error('Failed to update patient profile', error, { patientId, data });
        throw new DatabaseError('Failed to update patient profile', error);
      }

      return updated as PatientProfileRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating patient profile', error as Error, { patientId, data });
      throw new DatabaseError('Unexpected error updating patient profile', error as Error);
    }
  }

  /**
   * Get walk-in patient by ID (decrypts PII via RPC)
   */
  async getWalkInPatient(patientId: string): Promise<WalkInPatientRow> {
    try {
      const { data, error } = await supabase.rpc('get_patient_decrypted', {
        p_patient_id: patientId,
      });

      const row = Array.isArray(data) ? data[0] : null;

      if (error || !row) {
        logger.error('Walk-in patient not found', error, { patientId });
        throw new DatabaseError('Walk-in patient not found', error);
      }

      if ((row.source as string | undefined) === 'app') {
        logger.error('Requested patient is not a walk-in record', undefined, { patientId });
        throw new DatabaseError('Walk-in patient not found', null);
      }

      return {
        id: row.id as string,
        phone_number: row.phone_number as string,
        full_name: row.full_name as string,
        source: (row.source as string) ?? 'walk_in',
        is_claimed: (row.is_claimed as boolean) ?? false,
        claimed_by: row.user_id as string | null,
        created_at: row.created_at as string,
        updated_at: row.created_at as string,
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting walk-in patient', error as Error, { patientId });
      throw new DatabaseError('Unexpected error getting walk-in patient', error as Error);
    }
  }
}


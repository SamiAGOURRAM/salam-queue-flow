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

export interface GuestPatientRow {
  id: string;
  phone_number: string;
  full_name: string;
  claimed_by?: string | null;
  claimed_at?: string | null;
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
   * Find guest patient by phone number (not claimed)
   */
  async findGuestPatientByPhone(phoneNumber: string): Promise<GuestPatientRow | null> {
    try {
      const { data, error } = await supabase.rpc('find_patient_by_phone', {
        p_phone_number: phoneNumber,
      });

      if (error) {
        logger.error('Failed to find guest patient by phone', error, { phoneNumber });
        throw new DatabaseError('Failed to find guest patient by phone', error);
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row || (row.is_claimed as boolean)) {
        return null;
      }

      return {
        id: row.id as string,
        phone_number: phoneNumber,
        full_name: row.full_name as string,
        claimed_by: null,
        claimed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error finding guest patient by phone', error as Error, { phoneNumber });
      throw new DatabaseError('Unexpected error finding guest patient by phone', error as Error);
    }
  }

  /**
   * Create guest patient
   */
  async createGuestPatient(fullName: string, phoneNumber: string): Promise<GuestPatientRow> {
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
        logger.error('Failed to create guest patient', error, { fullName, phoneNumber });
        throw new DatabaseError('Failed to create guest patient', error);
      }

      return {
        id: data as string,
        phone_number: phoneNumber,
        full_name: fullName,
        claimed_by: null,
        claimed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating guest patient', error as Error, { fullName, phoneNumber });
      throw new DatabaseError('Unexpected error creating guest patient', error as Error);
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
   * Get guest patient by ID
   */
  async getGuestPatient(guestPatientId: string): Promise<GuestPatientRow> {
    try {
      const { data, error } = await supabase.rpc('get_patient_decrypted', {
        p_patient_id: guestPatientId,
      });

      const row = Array.isArray(data) ? data[0] : null;

      if (error || !row) {
        logger.error('Guest patient not found', error, { guestPatientId });
        throw new DatabaseError('Guest patient not found', error);
      }

      if ((row.source as string | undefined) === 'app') {
        logger.error('Requested patient is not a guest record', undefined, { guestPatientId });
        throw new DatabaseError('Guest patient not found', null);
      }

      return {
        id: row.id as string,
        phone_number: row.phone_number as string,
        full_name: row.full_name as string,
        claimed_by: row.user_id as string | null,
        claimed_at: null,
        created_at: row.created_at as string,
        updated_at: row.created_at as string,
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting guest patient', error as Error, { guestPatientId });
      throw new DatabaseError('Unexpected error getting guest patient', error as Error);
    }
  }
}


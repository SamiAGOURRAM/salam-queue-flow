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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

      if (error) {
        logger.error('Failed to find patient by phone', error, { phoneNumber });
        throw new DatabaseError('Failed to find patient by phone', error);
      }

      return data as PatientProfileRow | null;
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
      // Note: guest_patients table may not be in generated types
      const { data, error } = await supabase
        .from('guest_patients' as any)
        .select('*')
        .eq('phone_number', phoneNumber)
        .is('claimed_by', null)
        .maybeSingle();

      if (error) {
        logger.error('Failed to find guest patient by phone', error, { phoneNumber });
        throw new DatabaseError('Failed to find guest patient by phone', error);
      }

      return data as unknown as GuestPatientRow | null;
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
      // Note: guest_patients table may not be in generated types
      const { data, error } = await supabase
        .from('guest_patients' as any)
        .insert({
          full_name: fullName,
          phone_number: phoneNumber,
        } as any)
        .select()
        .single();

      if (error || !data) {
        logger.error('Failed to create guest patient', error, { fullName, phoneNumber });
        throw new DatabaseError('Failed to create guest patient', error);
      }

      return data as unknown as GuestPatientRow;
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
      // Note: guest_patients table may not be in generated types
      const { data, error } = await supabase
        .from('guest_patients' as any)
        .select('*')
        .eq('id', guestPatientId)
        .single();

      if (error || !data) {
        logger.error('Guest patient not found', error, { guestPatientId });
        throw new DatabaseError('Guest patient not found', error);
      }

      return data as unknown as GuestPatientRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting guest patient', error as Error, { guestPatientId });
      throw new DatabaseError('Unexpected error getting guest patient', error as Error);
    }
  }
}


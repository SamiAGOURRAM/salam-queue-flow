/**
 * Patient Repository - Data access for patient management
 */

import { BaseRepository } from '../base/BaseRepository.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ILogger } from '../../ports/logger.js';
import type { IPatientRepository } from '../../ports/repositories/IPatientRepository.js';
import {
  AppointmentStatus,
  PatientSource,
  ConsentGivenBy,
  type Patient,
  type PatientProfile,
  type QueueEntry,
  type WalkInPatient,
} from '../../types.js';

export class PatientRepository extends BaseRepository implements IPatientRepository {
  constructor(client: SupabaseClient, logger: ILogger) {
    super(client, logger, 'PatientRepository');
  }

  /**
   * Get patient by ID (profile)
   */
  async getById(patientId: string): Promise<Patient | null> {
    // Using this.client directly
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', patientId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logError('Failed to get patient', new Error(error.message), { patientId });
      throw error;
    }

    return this.mapToPatient(data);
  }

  /**
   * Get patient by phone number
   */
  async getByPhoneNumber(phoneNumber: string): Promise<Patient | null> {
    // Using this.client directly
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logError('Failed to get patient by phone', new Error(error.message));
      throw error;
    }

    return this.mapToPatient(data);
  }

  /**
   * Get patient profile with extended info.
   *
   * Resolution order (mirrors the canonical flow):
   *  1. `profiles` row by id (app user) → extended profile.
   *  2. Fallback: `patients` row by user_id (non-anonymized) + PII decrypted via
   *     `get_patient_decrypted` RPC.
   *  3. Neither found → null (service raises NotFoundError).
   */
  async getProfile(patientId: string): Promise<PatientProfile | null> {
    const { data: profileRow } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', patientId)
      .maybeSingle();

    if (profileRow) {
      return this.mapToProfile(profileRow as Record<string, unknown>);
    }

    // Fallback: resolve via the unified patients table by user_id.
    const { data: identity, error: identityError } = await this.client
      .from('patients')
      .select('id, display_name, created_at, updated_at')
      .eq('user_id', patientId)
      .eq('is_anonymized', false)
      .maybeSingle();

    if (identityError || !identity) {
      return null;
    }

    let fullName = identity.display_name as string;
    let phoneNumber = '';
    let email: string | undefined;

    const { data: decrypted, error: decryptError } = await this.client.rpc('get_patient_decrypted', {
      p_patient_id: identity.id,
    });

    if (!decryptError && Array.isArray(decrypted) && decrypted.length > 0) {
      const d = decrypted[0] as { full_name?: string; phone_number?: string; email?: string | null };
      fullName = d.full_name || fullName;
      phoneNumber = d.phone_number || '';
      email = d.email || undefined;
    }

    const nowIso = new Date().toISOString();
    return {
      id: patientId,
      fullName,
      phoneNumber,
      email,
      city: undefined,
      preferredLanguage: undefined,
      notificationPreferences: undefined,
      noShowCount: 0,
      createdAt: (identity.created_at as string) || nowIso,
      updatedAt: (identity.updated_at as string) || nowIso,
    };
  }

  /**
   * Resolve a patient by phone via the `find_patient_by_phone` RPC.
   */
  async findByPhoneRpc(phoneNumber: string): Promise<{ id: string; isClaimed: boolean } | null> {
    const { data, error } = await this.client.rpc('find_patient_by_phone', {
      p_phone_number: phoneNumber,
    });

    if (error) {
      this.logError('Failed to find patient by phone', new Error(error.message));
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    return { id: row.id as string, isClaimed: Boolean(row.is_claimed) };
  }

  /**
   * Create a walk-in (receptionist-entered) patient.
   */
  async createWalkInPatient(fullName: string, phoneNumber: string): Promise<{ id: string }> {
    const { data, error } = await this.client.rpc('create_patient', {
      p_full_name: fullName,
      p_phone_number: phoneNumber,
      p_email: null,
      p_source: PatientSource.WALK_IN,
      p_user_id: null,
      p_created_by: null,
      p_consent_sms: false,
      p_consent_data_processing: true,
      p_consent_given_by: ConsentGivenBy.PATIENT_VERBAL,
    });

    if (error || !data) {
      this.logError('Failed to create walk-in patient', new Error(error?.message || 'No id returned'), { fullName });
      throw error || new Error('Failed to create walk-in patient');
    }

    return { id: data as string };
  }

  /**
   * Get a walk-in patient by id (PII decrypted via RPC).
   */
  async getWalkInPatient(patientId: string): Promise<WalkInPatient> {
    const { data, error } = await this.client.rpc('get_patient_decrypted', {
      p_patient_id: patientId,
    });

    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) {
      this.logError('Walk-in patient not found', new Error(error?.message || 'No row'), { patientId });
      throw error || new Error('Walk-in patient not found');
    }

    if ((row.source as string | undefined) === PatientSource.APP) {
      throw new Error('Requested patient is not a walk-in record');
    }

    return {
      id: row.id as string,
      phoneNumber: row.phone_number as string,
      fullName: row.full_name as string,
      source: (row.source as string) ?? PatientSource.WALK_IN,
      isClaimed: Boolean(row.is_claimed),
      claimedBy: (row.user_id as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.created_at as string,
    };
  }

  /**
   * Get patient's appointments
   */
  async getAppointments(
    patientId: string,
    options?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    }
  ): Promise<QueueEntry[]> {
    // Using this.client directly
    let query = this.client
      .from('appointments')
      .select(`
        id,
        clinic_id,
        patient_id,
        staff_id,
        appointment_date,
        time_slot,
        checked_in_at,
        start_time,
        end_time,
        status,
        queue_position,
        appointment_type,
        reason_for_visit,
        predicted_wait_time,
        actual_duration,
        clinics (
          name,
          specialty
        )
      `)
      .eq('patient_id', patientId)
      .order('appointment_date', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.fromDate) {
      query = query.gte('appointment_date', options.fromDate);
    }

    if (options?.toDate) {
      query = query.lte('appointment_date', options.toDate);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      this.logError('Failed to get patient appointments', new Error(error.message), { patientId });
      throw error;
    }

    return (data || []).map(row => this.mapToQueueEntry(row));
  }

  /**
   * Get upcoming appointments for a patient
   */
  async getUpcomingAppointments(patientId: string, limit: number = 5): Promise<QueueEntry[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getAppointments(patientId, {
      fromDate: today,
      status: AppointmentStatus.SCHEDULED,
      limit
    });
  }

  /**
   * Update patient profile
   */
  async updateProfile(patientId: string, updates: Partial<Patient>): Promise<Patient> {
    // Only send defined fields so a partial update never nulls untouched columns.
    const updateData: Record<string, unknown> = {};
    if (updates.fullName !== undefined) updateData.full_name = updates.fullName;
    if (updates.phoneNumber !== undefined) updateData.phone_number = updates.phoneNumber;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.dateOfBirth !== undefined) updateData.date_of_birth = updates.dateOfBirth;
    if (updates.gender !== undefined) updateData.gender = updates.gender;
    if (updates.city !== undefined) updateData.city = updates.city ?? null;

    const { data, error } = await this.client
      .from('profiles')
      .update(updateData)
      .eq('id', patientId)
      .select()
      .single();

    if (error) {
      this.logError('Failed to update patient profile', new Error(error.message), { patientId });
      throw error;
    }

    return this.mapToPatient(data);
  }

  /**
   * Map database row to Patient
   */
  private mapToPatient(row: Record<string, unknown>): Patient {
    return {
      id: row.id as string,
      fullName: row.full_name as string,
      phoneNumber: row.phone_number as string | undefined,
      email: row.email as string | undefined,
      dateOfBirth: row.date_of_birth as string | undefined,
      gender: row.gender as string | undefined,
      city: row.city as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string | undefined,
    };
  }

  /** Map a `profiles` row to an extended PatientProfile. */
  private mapToProfile(row: Record<string, unknown>): PatientProfile {
    return {
      ...this.mapToPatient(row),
      preferredLanguage: row.preferred_language as string | undefined,
      notificationPreferences: row.notification_preferences as Record<string, unknown> | undefined,
      noShowCount: (row.no_show_count as number | undefined) ?? 0,
    };
  }

  /**
   * Map database row to QueueEntry
   */
  private mapToQueueEntry(row: Record<string, unknown>): QueueEntry {
    return {
      id: row.id as string,
      clinicId: row.clinic_id as string,
      patientId: row.patient_id as string,
      staffId: row.staff_id as string | undefined,
      appointmentDate: row.appointment_date as string,
      scheduledTime: row.time_slot as string | undefined,
      checkInTime: row.checked_in_at as string | undefined,
      startTime: row.start_time as string | undefined,
      endTime: row.end_time as string | undefined,
      status: row.status as QueueEntry['status'],
      queuePosition: row.queue_position as number | undefined,
      appointmentType: row.appointment_type as string,
      reasonForVisit: row.reason_for_visit as string | undefined,
      estimatedWaitTime: row.predicted_wait_time as number | undefined,
      actualWaitTime: row.actual_duration as number | undefined
    };
  }
}


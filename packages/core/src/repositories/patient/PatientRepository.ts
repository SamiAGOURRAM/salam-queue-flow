/**
 * Patient Repository - Data access for patient management
 */

import { BaseRepository } from '../base/BaseRepository';
import type { IDatabaseClient } from '../../ports/database';
import type { ILogger } from '../../ports/logger';
import type { Patient, PatientProfile, QueueEntry } from '../../types';

export class PatientRepository extends BaseRepository {
  constructor(db: IDatabaseClient, logger: ILogger) {
    super(db, logger, 'PatientRepository');
  }

  /**
   * Get patient by ID (profile)
   */
  async getById(patientId: string): Promise<Patient | null> {
    const client = this.db.getClient();
    const { data, error } = await client
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
    const client = this.db.getClient();
    const { data, error } = await client
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
   * Get patient profile with extended info
   */
  async getProfile(patientId: string): Promise<PatientProfile | null> {
    const patient = await this.getById(patientId);
    if (!patient) return null;

    // In the future, this could fetch additional profile data
    return {
      ...patient,
      medicalHistory: undefined,
      allergies: undefined,
      insuranceInfo: undefined
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
    const client = this.db.getClient();
    let query = client
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
      status: 'scheduled',
      limit
    });
  }

  /**
   * Update patient profile
   */
  async updateProfile(patientId: string, updates: Partial<Patient>): Promise<Patient> {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('profiles')
      .update({
        full_name: updates.fullName,
        phone_number: updates.phoneNumber,
        email: updates.email,
        date_of_birth: updates.dateOfBirth,
        gender: updates.gender
      })
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
      createdAt: row.created_at as string
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


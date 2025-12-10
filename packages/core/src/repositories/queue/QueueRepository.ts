/**
 * Queue Repository - Data access for queue management
 */

import { BaseRepository } from '../base/BaseRepository';
import type { IDatabaseClient } from '../../ports/database';
import type { ILogger } from '../../ports/logger';
import type { 
  QueueEntry, 
  DailyScheduleEntry, 
  AppointmentStatus,
  CallNextPatientDTO 
} from '../../types';

export class QueueRepository extends BaseRepository {
  constructor(db: IDatabaseClient, logger: ILogger) {
    super(db, logger, 'QueueRepository');
  }

  /**
   * Get daily schedule for a staff member
   */
  async getDailySchedule(
    staffId: string,
    targetDate: string
  ): Promise<DailyScheduleEntry[]> {
    return this.executeRpc<DailyScheduleEntry[]>(
      'get_daily_schedule',
      {
        p_staff_id: staffId,
        p_target_date: targetDate
      },
      'Failed to fetch daily schedule'
    );
  }

  /**
   * Get queue entries for a clinic on a specific date
   */
  async getQueueEntries(
    clinicId: string,
    date: string
  ): Promise<QueueEntry[]> {
    const client = this.db.getClient();
    const { data, error } = await client
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
        profiles!appointments_patient_fkey (
          full_name,
          phone_number
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('appointment_date', date)
      .order('queue_position', { ascending: true });

    if (error) {
      this.logError('Failed to get queue entries', new Error(error.message), { clinicId, date });
      throw error;
    }

    return (data || []).map(entry => this.mapToQueueEntry(entry));
  }

  /**
   * Get a specific queue entry by appointment ID
   */
  async getQueueEntry(appointmentId: string): Promise<QueueEntry | null> {
    const client = this.db.getClient();
    const { data, error } = await client
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
        profiles!appointments_patient_fkey (
          full_name,
          phone_number
        )
      `)
      .eq('id', appointmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      this.logError('Failed to get queue entry', new Error(error.message), { appointmentId });
      throw error;
    }

    return this.mapToQueueEntry(data);
  }

  /**
   * Get queue position for a patient's appointment
   */
  async getQueuePosition(
    clinicId: string,
    patientId: string,
    date: string
  ): Promise<{ position: number; total: number; estimatedWait: number } | null> {
    return this.executeRpc<{ position: number; total: number; estimatedWait: number } | null>(
      'get_queue_position',
      {
        p_clinic_id: clinicId,
        p_patient_id: patientId,
        p_date: date
      },
      'Failed to get queue position'
    );
  }

  /**
   * Check in a patient
   */
  async checkInPatient(appointmentId: string): Promise<QueueEntry> {
    return this.executeRpc<QueueEntry>(
      'check_in_patient',
      { p_appointment_id: appointmentId },
      'Failed to check in patient'
    );
  }

  /**
   * Call the next patient in the queue
   */
  async callNextPatient(dto: CallNextPatientDTO): Promise<QueueEntry> {
    return this.executeRpc<QueueEntry>(
      'call_next_patient',
      {
        p_clinic_id: dto.clinicId,
        p_staff_id: dto.staffId,
        p_appointment_date: dto.appointmentDate
      },
      'Failed to call next patient'
    );
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<QueueEntry> {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('appointments')
      .update({ 
        status,
        ...(status === 'in_progress' ? { start_time: new Date().toISOString() } : {}),
        ...(status === 'completed' ? { end_time: new Date().toISOString() } : {})
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) {
      this.logError('Failed to update appointment status', new Error(error.message), { appointmentId, status });
      throw error;
    }

    return this.mapToQueueEntry(data);
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    const client = this.db.getClient();
    const { error } = await client
      .from('appointments')
      .update({ 
        status: 'cancelled' as AppointmentStatus,
        notes: reason ? `Cancelled: ${reason}` : 'Cancelled'
      })
      .eq('id', appointmentId);

    if (error) {
      this.logError('Failed to cancel appointment', new Error(error.message), { appointmentId });
      throw error;
    }
  }

  /**
   * Subscribe to queue updates
   */
  subscribeToQueueUpdates(
    clinicId: string,
    date: string,
    callback: (payload: unknown) => void
  ): () => void {
    const client = this.db.getClient();
    const channel = client
      .channel(`queue-${clinicId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        callback
      )
      .subscribe();

    return () => client.removeChannel(channel);
  }

  /**
   * Map database row to QueueEntry
   */
  private mapToQueueEntry(row: Record<string, unknown>): QueueEntry {
    const profiles = row.profiles as { full_name?: string; phone_number?: string } | null;
    
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
      status: row.status as AppointmentStatus,
      queuePosition: row.queue_position as number | undefined,
      appointmentType: row.appointment_type as string,
      reasonForVisit: row.reason_for_visit as string | undefined,
      estimatedWaitTime: row.predicted_wait_time as number | undefined,
      actualWaitTime: row.actual_duration as number | undefined,
      patientName: profiles?.full_name,
      patientPhone: profiles?.phone_number
    };
  }
}


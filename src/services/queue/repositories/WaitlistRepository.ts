import { supabase } from '@/integrations/supabase/client';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';
import { WaitlistEntry } from '../models/QueueModels';

export class WaitlistRepository {
  /**
   * Add a patient to the waitlist
   */
  async addToWaitlist(
    clinicId: string,
    date: Date,
    patientId?: string,
    guestPatientId?: string,
    priorityScore: number = 0,
    notes?: string
  ): Promise<WaitlistEntry> {
    try {
      logger.debug('Adding to waitlist', { clinicId, date, patientId, guestPatientId });

      const { data, error } = await supabase
        .from('waitlist')
        .insert({
          clinic_id: clinicId,
          requested_date: date.toISOString().split('T')[0],
          patient_id: patientId || null,
          guest_patient_id: guestPatientId || null,
          priority_score: priorityScore,
          notes: notes,
          status: 'waiting'
        })
        .select()
        .single();

      if (error || !data) {
        logger.error('Failed to add to waitlist', error, { clinicId });
        throw new DatabaseError('Failed to add to waitlist', error);
      }

      return this.mapToWaitlistEntry(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error adding to waitlist', error as Error);
      throw new DatabaseError('Unexpected error adding to waitlist', error as Error);
    }
  }

  /**
   * Get waitlist for a clinic and date
   */
  async getWaitlist(clinicId: string, date: Date): Promise<WaitlistEntry[]> {
    try {
      logger.debug('Fetching waitlist', { clinicId, date });

      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('requested_date', date.toISOString().split('T')[0])
        .eq('status', 'waiting')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Failed to fetch waitlist', error, { clinicId });
        throw new DatabaseError('Failed to fetch waitlist', error);
      }

      return (data || []).map(this.mapToWaitlistEntry);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching waitlist', error as Error);
      throw new DatabaseError('Unexpected error fetching waitlist', error as Error);
    }
  }

  /**
   * Update waitlist entry status
   */
  async updateStatus(id: string, status: WaitlistEntry['status']): Promise<void> {
    try {
      const { error } = await supabase
        .from('waitlist')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        logger.error('Failed to update waitlist status', error, { id, status });
        throw new DatabaseError('Failed to update waitlist status', error);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating waitlist status', error as Error);
      throw new DatabaseError('Unexpected error updating waitlist status', error as Error);
    }
  }

  private mapToWaitlistEntry(row: any): WaitlistEntry {
    return {
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      guestPatientId: row.guest_patient_id,
      requestedDate: new Date(row.requested_date),
      requestedTimeRangeStart: row.requested_time_range_start,
      requestedTimeRangeEnd: row.requested_time_range_end,
      priorityScore: row.priority_score,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      notes: row.notes
    };
  }
}


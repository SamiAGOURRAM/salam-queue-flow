import { supabase } from '@/integrations/supabase/client';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';
import { WaitlistEntry, WaitlistStatus } from '../models/QueueModels';

export class WaitlistRepository {
  /**
   * Add a patient to the waitlist
   */
  async addToWaitlist(
    clinicId: string,
    date: Date,
    patientId?: string,
    priorityScore: number = 0,
    notes?: string
  ): Promise<WaitlistEntry> {
    try {
      logger.debug('Adding to waitlist', { clinicId, date, patientId });

      const { data, error } = await supabase
        .from('waitlist')
        .insert({
          clinic_id: clinicId,
          requested_date: date.toISOString().split('T')[0],
          patient_id: patientId || null,
          priority_score: priorityScore,
          notes: notes,
          status: WaitlistStatus.WAITING
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
        .eq('status', WaitlistStatus.WAITING)
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
   * Get a waitlist entry by ID
   */
  async getWaitlistEntryById(id: string): Promise<WaitlistEntry | null> {
    try {
      logger.debug('Fetching waitlist entry by id', { id });

      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch waitlist entry by id', error, { id });
        throw new DatabaseError('Failed to fetch waitlist entry by id', error);
      }

      return data ? this.mapToWaitlistEntry(data) : null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching waitlist entry by id', error as Error, { id });
      throw new DatabaseError('Unexpected error fetching waitlist entry by id', error as Error);
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

  /**
   * Atomically claim a waitlist entry for promotion.
   * Returns null when another process already claimed/finalized the entry.
   */
  async claimForPromotion(id: string): Promise<WaitlistEntry | null> {
    try {
      const { data, error } = await supabase
        .from('waitlist')
        .update({
          status: WaitlistStatus.PROMOTED,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .in('status', [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED])
        .select('*')
        .maybeSingle();

      if (error) {
        logger.error('Failed to claim waitlist entry for promotion', error, { id });
        throw new DatabaseError('Failed to claim waitlist entry for promotion', error);
      }

      return data ? this.mapToWaitlistEntry(data) : null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error claiming waitlist entry for promotion', error as Error, {
        id,
      });
      throw new DatabaseError('Unexpected error claiming waitlist entry for promotion', error as Error);
    }
  }

  private mapToWaitlistEntry(row: any): WaitlistEntry {
    const status = row.status === 'booked' ? WaitlistStatus.PROMOTED : row.status;

    return {
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id || undefined,
      requestedDate: new Date(row.requested_date),
      requestedTimeRangeStart: row.requested_time_range_start,
      requestedTimeRangeEnd: row.requested_time_range_end,
      priorityScore: row.priority_score,
      status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      notes: row.notes
    };
  }
}


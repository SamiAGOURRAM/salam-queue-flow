/**
 * Queue Snapshot Service
 * Collects periodic snapshots of queue state for ML features and historical patterns
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '../shared/logging/Logger';

export interface QueueSnapshot {
  clinicId: string;
  snapshotDate: string; // YYYY-MM-DD
  snapshotTime: string; // ISO timestamp
  totalWaiting: number;
  totalInProgress: number;
  totalCompletedToday: number;
  averageWaitTime: number | null;
  longestWaitTime: number | null;
  currentDelayMinutes: number;
  activeStaffCount: number;
  staffUtilization: number;
}

export class QueueSnapshotService {
  /**
   * Collect snapshot for a single clinic
   */
  async collectSnapshotForClinic(clinicId: string, targetDate?: Date): Promise<QueueSnapshot | null> {
    try {
      const now = targetDate || new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toISOString();

      logger.debug('Collecting queue snapshot', { clinicId, date: dateStr });

      // Get current queue state
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('status, queue_position, actual_start_time')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', dateStr)
        .in('status', ['scheduled', 'waiting', 'in_progress', 'completed']);

      if (appointmentsError) {
        logger.error('Failed to fetch appointments for snapshot', appointmentsError, { clinicId });
        return null;
      }

      const waiting = appointments?.filter(a => 
        a.status === 'waiting' || a.status === 'scheduled'
      ).length || 0;
      
      const inProgress = appointments?.filter(a => a.status === 'in_progress').length || 0;
      const completed = appointments?.filter(a => a.status === 'completed').length || 0;

      // Get active staff count
      const { count: activeStaffCount, error: staffError } = await supabase
        .from('clinic_staff')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('is_active', true);

      if (staffError) {
        logger.warn('Failed to fetch staff count', { clinicId, error: staffError });
      }

      // NOTE: All calculations (averages, utilization, delays) should be done in backend
      // Frontend only collects raw counts - backend will calculate metrics
      // For now, we set these to null and let backend calculate
      const averageWaitTime: number | null = null;
      const longestWaitTime: number | null = null;
      const staffUtilization = 0; // Backend will calculate
      const currentDelayMinutes = 0; // Backend will calculate

      const snapshot: QueueSnapshot = {
        clinicId,
        snapshotDate: dateStr,
        snapshotTime: timeStr,
        totalWaiting: waiting,
        totalInProgress: inProgress,
        totalCompletedToday: completed,
        averageWaitTime,
        longestWaitTime,
        currentDelayMinutes,
        activeStaffCount: activeStaffCount || 0,
        staffUtilization: Math.round(staffUtilization * 100) / 100, // Round to 2 decimals
      };

      logger.info('Queue snapshot collected', { 
        clinicId, 
        waiting, 
        inProgress, 
        completed,
        averageWaitTime,
        staffUtilization 
      });

      return snapshot;
    } catch (error) {
      logger.error('Unexpected error collecting queue snapshot', error as Error, { clinicId });
      return null;
    }
  }

  /**
   * Store snapshot in database
   * Uses database function to bypass RLS policies
   */
  async storeSnapshot(snapshot: QueueSnapshot): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('record_queue_snapshot', {
        p_clinic_id: snapshot.clinicId,
        p_snapshot_date: snapshot.snapshotDate,
        p_snapshot_time: snapshot.snapshotTime,
        p_total_waiting: snapshot.totalWaiting,
        p_total_in_progress: snapshot.totalInProgress,
        p_total_completed_today: snapshot.totalCompletedToday,
        p_average_wait_time: snapshot.averageWaitTime,
        p_longest_wait_time: snapshot.longestWaitTime,
        p_current_delay_minutes: snapshot.currentDelayMinutes,
        p_active_staff_count: snapshot.activeStaffCount,
        p_staff_utilization: snapshot.staffUtilization,
      });

      if (error) {
        logger.error('Failed to store queue snapshot via database function', error, { clinicId: snapshot.clinicId });
        return false;
      }

      logger.info('Queue snapshot stored successfully', { clinicId: snapshot.clinicId });
      return true;
    } catch (error) {
      logger.error('Unexpected error storing queue snapshot', error as Error, { clinicId: snapshot.clinicId });
      return false;
    }
  }

  /**
   * Collect and store snapshot for a single clinic
   */
  async collectAndStore(clinicId: string, targetDate?: Date): Promise<boolean> {
    const snapshot = await this.collectSnapshotForClinic(clinicId, targetDate);
    if (!snapshot) {
      return false;
    }
    return await this.storeSnapshot(snapshot);
  }

  /**
   * Collect snapshots for all active clinics
   */
  async collectForAllActiveClinics(targetDate?: Date): Promise<{ success: number; failed: number }> {
    try {
      const { data: clinics, error: clinicsError } = await supabase
        .from('clinics')
        .select('id')
        .eq('is_active', true);

      if (clinicsError) {
        logger.error('Failed to fetch active clinics', clinicsError);
        return { success: 0, failed: 0 };
      }

      if (!clinics || clinics.length === 0) {
        logger.info('No active clinics found for snapshot collection');
        return { success: 0, failed: 0 };
      }

      let success = 0;
      let failed = 0;

      for (const clinic of clinics) {
        const result = await this.collectAndStore(clinic.id, targetDate);
        if (result) {
          success++;
        } else {
          failed++;
        }
      }

      logger.info('Completed snapshot collection for all clinics', { 
        total: clinics.length, 
        success, 
        failed 
      });

      return { success, failed };
    } catch (error) {
      logger.error('Unexpected error collecting snapshots for all clinics', error as Error);
      return { success: 0, failed: 0 };
    }
  }
}

export const queueSnapshotService = new QueueSnapshotService();


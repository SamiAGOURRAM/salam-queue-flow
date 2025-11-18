import { supabase } from '@/integrations/supabase/client';
import { logger } from '../../shared/logging/Logger';

export interface HistoricalWaitTimeMetrics {
  averageWaitTime: number;
  averageWaitTimeForType?: number;
  averageWaitTimeForTimeSlot?: number;
}

export class AnalyticsRepository {
  /**
   * Get historical wait time metrics for estimation
   */
  async getHistoricalWaitTimeMetrics(
    clinicId: string,
    appointmentType?: string,
    scheduledTime?: string,
    lookbackDays: number = 30
  ): Promise<HistoricalWaitTimeMetrics | undefined> {
    try {
      // Get historical average wait time (last X days)
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
      
      // Query appointment_metrics with join to appointments
      // First get appointment IDs for this clinic, then get their metrics
      const { data: clinicAppointments, error: clinicAppointmentsError } = await supabase
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .gte('appointment_date', lookbackDate.toISOString().split('T')[0])
        .limit(1000);
      
      if (clinicAppointmentsError || !clinicAppointments || clinicAppointments.length === 0) {
        logger.debug('No appointments found for clinic history', { clinicId, error: clinicAppointmentsError });
        return undefined;
      }
      
      const appointmentIds = clinicAppointments.map(a => a.id);
      
      // Batch the queries to avoid URL length limits
      const BATCH_SIZE = 50;
      const allMetrics: any[] = [];
      
      for (let i = 0; i < appointmentIds.length; i += BATCH_SIZE) {
        const batch = appointmentIds.slice(i, i + BATCH_SIZE);
        
        const { data: batchMetrics, error: metricsError } = await supabase
          .from('appointment_metrics')
          .select('actual_wait_time, appointment_id')
          .in('appointment_id', batch)
          .gte('recorded_at', lookbackDate.toISOString())
          .not('actual_wait_time', 'is', null)
          .limit(1000);
        
        if (metricsError) {
          logger.warn('Error fetching metrics batch', { 
            clinicId, 
            error: metricsError,
            batchIndex: i 
          });
          continue;
        }
        
        if (batchMetrics && batchMetrics.length > 0) {
          allMetrics.push(...batchMetrics);
        }
      }
      
      if (allMetrics.length === 0) {
        return undefined;
      }
      
      const metrics = allMetrics;
      
      // Get appointment details for the metrics we found
      const metricAppointmentIds = [...new Set(metrics.map(m => m.appointment_id).filter(Boolean))];
      if (metricAppointmentIds.length === 0) {
        return undefined;
      }
      
      const allAppointmentDetails: any[] = [];
      
      for (let i = 0; i < metricAppointmentIds.length; i += BATCH_SIZE) {
        const batch = metricAppointmentIds.slice(i, i + BATCH_SIZE);
        
        const { data: batchAppointments, error: appointmentDetailsError } = await supabase
          .from('appointments')
          .select('id, clinic_id, appointment_type, start_time')
          .in('id', batch)
          .eq('clinic_id', clinicId);
        
        if (appointmentDetailsError) {
          logger.debug('Error fetching appointment details batch', { 
            error: appointmentDetailsError, 
            batchIndex: i 
          });
          continue;
        }
        
        if (batchAppointments && batchAppointments.length > 0) {
          allAppointmentDetails.push(...batchAppointments);
        }
      }
      
      // Combine metrics with appointment data
      const finalMetrics = metrics.map(m => ({
        ...m,
        appointments: allAppointmentDetails?.find((a: any) => a.id === m.appointment_id) || null
      }));
      
      // Extract wait times
      const waitTimes = finalMetrics
        .map((m: any) => {
          const waitTime = m.actual_wait_time;
          return typeof waitTime === 'number' && waitTime > 0 ? waitTime : null;
        })
        .filter((wt): wt is number => wt !== null);

      if (waitTimes.length === 0) return undefined;

      const averageWaitTime = Math.round(
        waitTimes.reduce((sum, wt) => sum + wt, 0) / waitTimes.length
      );

      // Calculate average for specific appointment type
      let averageWaitTimeForType: number | undefined;
      if (appointmentType) {
        const typeMetrics = finalMetrics.filter((m: any) => {
          const appt = m.appointments;
          return appt && appt.appointment_type === appointmentType;
        });
        if (typeMetrics.length > 0) {
          const typeWaitTimes = typeMetrics
            .map((m: any) => {
              const waitTime = m.actual_wait_time;
              return typeof waitTime === 'number' && waitTime > 0 ? waitTime : null;
            })
            .filter((wt): wt is number => wt !== null);
          if (typeWaitTimes.length > 0) {
            averageWaitTimeForType = Math.round(
              typeWaitTimes.reduce((sum, wt) => sum + wt, 0) / typeWaitTimes.length
            );
          }
        }
      }

      // Calculate average for time slot
      let averageWaitTimeForTimeSlot: number | undefined;
      if (scheduledTime) {
        const hour = parseInt(scheduledTime.split(':')[0] || '0');
        const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        
        const slotMetrics = finalMetrics.filter((m: any) => {
          const appt = m.appointments;
          if (!appt || !appt.start_time) return false;
          const apptDate = new Date(appt.start_time);
          const apptHour = apptDate.getHours();
          const apptSlot = apptHour < 12 ? 'morning' : apptHour < 17 ? 'afternoon' : 'evening';
          return apptSlot === timeSlot;
        });

        if (slotMetrics.length > 0) {
          const slotWaitTimes = slotMetrics
            .map((m: any) => {
              const waitTime = m.actual_wait_time;
              return typeof waitTime === 'number' && waitTime > 0 ? waitTime : null;
            })
            .filter((wt): wt is number => wt !== null);
          if (slotWaitTimes.length > 0) {
            averageWaitTimeForTimeSlot = Math.round(
              slotWaitTimes.reduce((sum, wt) => sum + wt, 0) / slotWaitTimes.length
            );
          }
        }
      }

      return {
        averageWaitTime,
        averageWaitTimeForType,
        averageWaitTimeForTimeSlot,
      };
    } catch (error) {
      logger.warn('Failed to get historical data', { error, clinicId });
      return undefined;
    }
  }
}

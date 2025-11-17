/**
 * Wait Time Estimation Service
 * 
 * Orchestrates wait time estimation using a fallback chain:
 * 1. ML Estimator (if enabled and available)
 * 2. Rule-Based Estimator (reliable fallback)
 * 3. Historical Average Estimator (last resort)
 * 
 * Frontend only needs to call: estimateWaitTime(appointmentId)
 * Service handles all complexity internally.
 */

import { IWaitTimeEstimator, type WaitTimeEstimation, type EstimationContext } from './estimators/IWaitTimeEstimator';
import { MlEstimator } from './estimators/MlEstimator';
import { RuleBasedEstimator } from './estimators/RuleBasedEstimator';
import { HistoricalAverageEstimator } from './estimators/HistoricalAverageEstimator';
import { QueueRepository } from '../queue/repositories/QueueRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, DatabaseError } from '../shared/errors';
import { supabase } from '@/integrations/supabase/client';
import type { QueueEntry } from '../queue/models/QueueModels';

export class WaitTimeEstimationService {
  private mlEstimator: IWaitTimeEstimator;
  private ruleBasedEstimator: IWaitTimeEstimator;
  private historicalAverageEstimator: IWaitTimeEstimator;
  private repository: QueueRepository;
  private estimationCache: Map<string, { result: WaitTimeEstimation; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000; // Cache results for 30 seconds to prevent duplicate calls

  constructor(repository?: QueueRepository) {
    this.mlEstimator = new MlEstimator();
    this.ruleBasedEstimator = new RuleBasedEstimator();
    this.historicalAverageEstimator = new HistoricalAverageEstimator();
    this.repository = repository || new QueueRepository();
  }

  /**
   * Estimate wait time for an appointment
   * 
   * This is the ONLY method the frontend needs to call.
   * Service handles estimator selection and fallback internally.
   * 
   * @param appointmentId - Appointment ID to estimate for
   * @param options - Optional configuration
   * @returns Wait time estimation
   */
  async estimateWaitTime(
    appointmentId: string,
    options?: {
      /** Force a specific estimator mode (for testing) */
      forceMode?: 'ml' | 'rule-based' | 'historical-average';
      /** Skip ML and use rule-based directly */
      skipMl?: boolean;
      /** Bypass cache and force recalculation */
      bypassCache?: boolean;
    }
  ): Promise<WaitTimeEstimation> {
    // Check cache first (unless bypassing)
    if (!options?.bypassCache) {
      const cached = this.estimationCache.get(appointmentId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        logger.debug('Returning cached estimation', { appointmentId, age: Date.now() - cached.timestamp });
        return cached.result;
      }
    }

    logger.info('Estimating wait time', { appointmentId, options });

    try {
      // 1. Fetch appointment and build context
      const context = await this.buildEstimationContext(appointmentId);

      // 2. If force mode specified, use that estimator directly
      if (options?.forceMode) {
        return this.estimateWithMode(context, options.forceMode);
      }

      // 3. Get clinic configuration
      const clinicConfig = await this.repository.getClinicEstimationConfigByStaffId(
        context.appointment.staffId || ''
      );

      // 4. Try estimators in fallback chain
      const estimation = await this.estimateWithFallback(context, {
        mlEnabled: clinicConfig?.mlEnabled || false,
        skipMl: options?.skipMl || false,
      });

      logger.info('Wait time estimation completed', {
        appointmentId,
        waitTime: estimation.waitTimeMinutes,
        mode: estimation.mode,
        confidence: estimation.confidence,
      });

      // Cache the result
      this.estimationCache.set(appointmentId, {
        result: estimation,
        timestamp: Date.now(),
      });

      // Clean up old cache entries (keep only recent ones)
      this.cleanupCache();

      return estimation;
    } catch (error) {
      logger.error('Wait time estimation failed', error as Error, { appointmentId });
      
      // Last resort: return a safe default
      if (error instanceof NotFoundError) {
        throw error; // Re-throw not found errors
      }

      // For other errors, return historical average as fallback
      try {
        const context = await this.buildEstimationContext(appointmentId);
        return await this.historicalAverageEstimator.estimate(context);
      } catch (fallbackError) {
        // If even fallback fails, return a safe default
        logger.error('All estimation methods failed', fallbackError as Error, { appointmentId });
        return {
          waitTimeMinutes: 15,
          confidence: 0.3,
          mode: 'fallback',
          explanation: {
            topFactors: [],
            context: 'Unable to estimate wait time. Using default value.',
          },
        };
      }
    }
  }

  /**
   * Estimate with fallback chain
   */
  private async estimateWithFallback(
    context: EstimationContext,
    options: { mlEnabled: boolean; skipMl: boolean }
  ): Promise<WaitTimeEstimation> {
    // Try ML first (if enabled and not skipped)
    if (options.mlEnabled && !options.skipMl) {
      try {
        const isAvailable = await this.mlEstimator.isAvailable();
        if (isAvailable) {
          const estimation = await this.mlEstimator.estimate(context);
          
          // If confidence is high enough, use it
          if (estimation.confidence >= this.mlEstimator.getMinConfidence()) {
            logger.debug('Using ML estimation', {
              appointmentId: context.appointment.id,
              confidence: estimation.confidence,
            });
            return estimation;
          } else {
            logger.debug('ML estimation confidence too low, falling back', {
              appointmentId: context.appointment.id,
              confidence: estimation.confidence,
              minConfidence: this.mlEstimator.getMinConfidence(),
            });
          }
        }
      } catch (error) {
        logger.warn('ML estimation failed, falling back to rule-based', {
          appointmentId: context.appointment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Try rule-based (reliable fallback)
    try {
      const estimation = await this.ruleBasedEstimator.estimate(context);
      logger.debug('Using rule-based estimation', {
        appointmentId: context.appointment.id,
        confidence: estimation.confidence,
      });
      return estimation;
    } catch (error) {
      logger.warn('Rule-based estimation failed, falling back to historical average', {
        appointmentId: context.appointment.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Last resort: historical average
    const estimation = await this.historicalAverageEstimator.estimate(context);
    logger.debug('Using historical average estimation', {
      appointmentId: context.appointment.id,
      confidence: estimation.confidence,
    });
    return estimation;
  }

  /**
   * Estimate with a specific mode (for testing)
   */
  private async estimateWithMode(
    context: EstimationContext,
    mode: 'ml' | 'rule-based' | 'historical-average'
  ): Promise<WaitTimeEstimation> {
    switch (mode) {
      case 'ml':
        return this.mlEstimator.estimate(context);
      case 'rule-based':
        return this.ruleBasedEstimator.estimate(context);
      case 'historical-average':
        return this.historicalAverageEstimator.estimate(context);
    }
  }

  /**
   * Build estimation context from appointment
   */
  private async buildEstimationContext(appointmentId: string): Promise<EstimationContext> {
    // Fetch appointment
    const appointment = await this.repository.getQueueEntryById(appointmentId);
    if (!appointment) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    // Fetch clinic config
    const clinicConfig = await this.repository.getClinicEstimationConfigByStaffId(
      appointment.staffId || ''
    ).catch(() => null);

    // Fetch queue state (if available)
    const queueState = await this.getQueueState(appointment.clinicId, appointment.appointmentDate);

    // Fetch staff info (if available)
    const staffInfo = await this.getStaffInfo(appointment.staffId);

    // Fetch historical data (if available)
    const historicalData = await this.getHistoricalData(
      appointment.clinicId,
      appointment.appointmentType,
      appointment.scheduledTime
    );

    return {
      appointment,
      queueState,
      staffInfo,
      historicalData,
      clinicConfig: clinicConfig ? {
        bufferTime: clinicConfig.etaBufferMinutes || undefined,
        averageAppointmentDuration: clinicConfig.averageAppointmentDuration || undefined,
        operatingMode: clinicConfig.estimationMode || undefined,
      } : undefined,
    };
  }

  /**
   * Get current queue state
   */
  private async getQueueState(clinicId: string, appointmentDate: Date): Promise<EstimationContext['queueState']> {
    try {
      const dateStr = appointmentDate.toISOString().split('T')[0];
      
      // Get all appointments for the clinic on this date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('status, checked_in_at, start_time')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', dateStr);

      if (error || !appointments) {
        logger.debug('Could not fetch queue state, using defaults', { clinicId, error });
        return undefined;
      }

      // Calculate queue metrics
      const waiting = appointments.filter(a => 
        a.status === 'waiting' || a.status === 'scheduled'
      ).length;
      
      const inProgress = appointments.filter(a => 
        a.status === 'in_progress'
      ).length;

      // Calculate average wait time from completed appointments today
      // Wait time = time from scheduled start (start_time) to check-in (entry)
      const completed = appointments.filter(a => 
        a.status === 'completed' && a.checked_in_at && a.start_time
      );
      
      let averageWaitTime: number | undefined;
      if (completed.length > 0) {
        const totalWaitMinutes = completed.reduce((sum, a) => {
          const scheduled = new Date(a.start_time).getTime();
          const checkedIn = new Date(a.checked_in_at).getTime();
          const waitMinutes = (checkedIn - scheduled) / 60000;
          return sum + Math.max(0, waitMinutes);
        }, 0);
        averageWaitTime = Math.round(totalWaitMinutes / completed.length);
      }

      return {
        totalWaiting: waiting,
        totalInProgress: inProgress,
        averageWaitTime,
      };
    } catch (error) {
      logger.warn('Failed to get queue state', { error, clinicId });
      return undefined;
    }
  }

  /**
   * Get staff information
   */
  private async getStaffInfo(staffId?: string): Promise<EstimationContext['staffInfo']> {
    if (!staffId) return undefined;

    try {
      const { StaffRepository } = await import('../staff/repositories/StaffRepository');
      const staffRepo = new StaffRepository();
      
      const staff = await staffRepo.getStaffById(staffId).catch(() => null);
      if (!staff) return undefined;

      // Get active staff count for the clinic
      const allStaff = await staffRepo.getStaffByClinic(staff.clinic_id).catch(() => []);
      const activeStaffCount = allStaff.filter(s => s.is_active).length;

      // Calculate staff utilization (simplified - would need real-time data)
      // For now, estimate based on in-progress appointments
      const staffUtilization = staff.average_consultation_duration 
        ? 0.5 // Default 50% if we can't calculate
        : undefined;

      return {
        activeStaffCount,
        staffUtilization,
        averageConsultationDuration: staff.average_consultation_duration || undefined,
      };
    } catch (error) {
      logger.warn('Failed to get staff info', { error, staffId });
      return undefined;
    }
  }

  /**
   * Get historical data
   */
  private async getHistoricalData(
    clinicId: string,
    appointmentType?: string,
    scheduledTime?: string
  ): Promise<EstimationContext['historicalData']> {
    try {
      // Query appointment_metrics for historical averages
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Get historical average wait time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Query appointment_metrics with join to appointments
      // First get appointment IDs for this clinic, then get their metrics
      // This avoids issues with filtering on joined tables
      const { data: clinicAppointments, error: clinicAppointmentsError } = await supabase
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .gte('appointment_date', thirtyDaysAgo.toISOString().split('T')[0])
        .limit(1000);
      
      if (clinicAppointmentsError || !clinicAppointments || clinicAppointments.length === 0) {
        logger.debug('No appointments found for clinic', { clinicId, error: clinicAppointmentsError });
        return undefined;
      }
      
      const appointmentIds = clinicAppointments.map(a => a.id);
      
      // Batch the queries to avoid URL length limits (Supabase/PostgREST has limits on .in() size)
      // Process in chunks of 50 IDs at a time
      const BATCH_SIZE = 50;
      const allMetrics: any[] = [];
      
      for (let i = 0; i < appointmentIds.length; i += BATCH_SIZE) {
        const batch = appointmentIds.slice(i, i + BATCH_SIZE);
        
        const { data: batchMetrics, error: metricsError } = await supabase
          .from('appointment_metrics')
          .select('actual_wait_time, appointment_id')
          .in('appointment_id', batch)
          .gte('recorded_at', thirtyDaysAgo.toISOString())
          .not('actual_wait_time', 'is', null)
          .limit(1000);
        
        if (metricsError) {
          logger.warn('Error fetching metrics batch', { 
            clinicId, 
            error: metricsError,
            errorCode: metricsError.code,
            errorMessage: metricsError.message,
            batchIndex: i,
            batchSize: batch.length 
          });
          // Continue with other batches
          continue;
        }
        
        if (batchMetrics && batchMetrics.length > 0) {
          allMetrics.push(...batchMetrics);
        }
      }
      
      if (allMetrics.length === 0) {
        logger.debug('No historical data available', { clinicId, totalAppointments: appointmentIds.length });
        return undefined;
      }
      
      const metrics = allMetrics;
      
      // Get appointment details for the metrics we found (also batch this query)
      const metricAppointmentIds = [...new Set(metrics.map(m => m.appointment_id).filter(Boolean))];
      if (metricAppointmentIds.length === 0) {
        return undefined;
      }
      
      const allAppointmentDetails: any[] = [];
      
      // Batch appointment details query as well
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
            batchIndex: i,
            batchSize: batch.length 
          });
          // Continue with other batches
          continue;
        }
        
        if (batchAppointments && batchAppointments.length > 0) {
          allAppointmentDetails.push(...batchAppointments);
        }
      }
      
      const appointmentDetails = allAppointmentDetails;
      
      // Combine metrics with appointment data
      const finalMetrics = metrics.map(m => ({
        ...m,
        appointments: appointmentDetails?.find((a: any) => a.id === m.appointment_id) || null
      }));
      
      // Extract wait times (handle nested appointment structure)
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

      // Calculate average for time slot (morning/afternoon/evening)
      let averageWaitTimeForTimeSlot: number | undefined;
      if (scheduledTime) {
        const hour = parseInt(scheduledTime.split(':')[0] || '0');
        const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        
        const slotMetrics = finalMetrics.filter((m: any) => {
          const appt = m.appointments;
          if (!appt || !appt.start_time) return false;
          // Extract hour from start_time (timestamp)
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

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [appointmentId, cached] of this.estimationCache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL_MS) {
        this.estimationCache.delete(appointmentId);
      }
    }
  }

  /**
   * Clear cache for a specific appointment (useful when appointment state changes)
   */
  clearCache(appointmentId?: string): void {
    if (appointmentId) {
      this.estimationCache.delete(appointmentId);
    } else {
      this.estimationCache.clear();
    }
  }
}

// Export singleton instance
export const waitTimeEstimationService = new WaitTimeEstimationService();


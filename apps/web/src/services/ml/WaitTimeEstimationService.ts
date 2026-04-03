/**
 * Wait Time Estimation Service
 * 
 * Orchestrates wait time estimation using a strict configured path.
 * Runtime path uses ML or Rule-Based mode based on clinic config.
 * Historical estimator remains available for explicit forceMode usage.
 * 
 * Frontend only needs to call: estimateWaitTime(appointmentId)
 * Service handles estimator selection internally.
 */

import { IWaitTimeEstimator, type WaitTimeEstimation, type EstimationContext } from './estimators/IWaitTimeEstimator';
import { MlEstimator } from './estimators/MlEstimator';
import { RuleBasedEstimator } from './estimators/RuleBasedEstimator';
import { HistoricalAverageEstimator } from './estimators/HistoricalAverageEstimator';
import { QueueRepository } from '../queue/repositories/QueueRepository';
import { StaffRepository } from '../staff/repositories/StaffRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError } from '../shared/errors';
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
    * Service handles estimator selection internally.
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

      // 4. Run configured estimator path
      const estimation = await this.estimateWithConfiguredMode(context, {
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

      if (error instanceof NotFoundError) {
        throw error;
      }

      throw error;
    }
  }

  /**
   * Estimate using configured runtime mode.
   */
  private async estimateWithConfiguredMode(
    context: EstimationContext,
    options: { mlEnabled: boolean; skipMl: boolean }
  ): Promise<WaitTimeEstimation> {
    if (options.mlEnabled && !options.skipMl) {
      const isAvailable = await this.mlEstimator.isAvailable();
      if (!isAvailable) {
        throw new Error('ML estimator is unavailable for configured clinic mode');
      }

      const estimation = await this.mlEstimator.estimate(context);
      logger.debug('Using ML estimation', {
        appointmentId: context.appointment.id,
        confidence: estimation.confidence,
      });
      return estimation;
    }

    const estimation = await this.ruleBasedEstimator.estimate(context);
    logger.debug('Using rule-based estimation', {
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
    );

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
  /**
   * Get current queue state
   */
  private async getQueueState(clinicId: string, appointmentDate: Date): Promise<EstimationContext['queueState']> {
    return this.repository.getQueueState(clinicId, appointmentDate);
  }

  /**
   * Get staff information
   */
  private async getStaffInfo(staffId?: string): Promise<EstimationContext['staffInfo']> {
    if (!staffId) return undefined;

    try {
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
  /**
   * Get historical data
   */
  private async getHistoricalData(
    clinicId: string,
    appointmentType?: string,
    scheduledTime?: string
  ): Promise<EstimationContext['historicalData']> {
    try {
      const { AnalyticsRepository } = await import('../analytics/repositories/AnalyticsRepository');
      const analyticsRepo = new AnalyticsRepository();

      return await analyticsRepo.getHistoricalWaitTimeMetrics(
        clinicId,
        appointmentType,
        scheduledTime,
        30 // lookback days
      );
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


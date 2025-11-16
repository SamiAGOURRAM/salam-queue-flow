/**
 * Rule-Based Wait Time Estimator
 * 
 * Simple, reliable estimator using business rules.
 * Works immediately without training data.
 * 
 * Algorithm:
 * - Base wait time
 * - Queue position impact
 * - Current delay impact
 * - Staff utilization impact
 * - Historical average (if available)
 */

import { IWaitTimeEstimator, type WaitTimeEstimation, type EstimationContext, type EstimationMode } from './IWaitTimeEstimator';
import { logger } from '../../shared/logging/Logger';
import { AppointmentStatus } from '../../queue/models/QueueModels';

export class RuleBasedEstimator implements IWaitTimeEstimator {
  private readonly minConfidence = 0.6; // Rule-based is reliable but not highly confident
  
  /**
   * Estimate wait time using business rules
   */
  async estimate(context: EstimationContext): Promise<WaitTimeEstimation> {
    const { appointment, queueState, staffInfo, historicalData, clinicConfig } = context;
    
    logger.debug('Estimating wait time using rule-based algorithm', {
      appointmentId: appointment.id,
      queuePosition: appointment.queuePosition,
    });

    // Base wait time (minimum expected wait)
    const baseWaitTime = clinicConfig?.bufferTime || 10;

    // Queue position impact
    // Each position ahead adds ~5 minutes (adjustable)
    const positionFactor = Math.max(0, (appointment.queuePosition - 1)) * 5;

    // Current delay impact
    // If clinic is running behind, add delay to estimate
    const currentDelay = queueState?.currentDelay || 0;
    const delayFactor = Math.max(0, currentDelay);

    // Staff utilization impact
    // Higher utilization = longer waits
    const utilization = staffInfo?.staffUtilization || 0.5;
    const utilizationFactor = utilization * 20; // Max 20 minutes at 100% utilization

    // Historical average (if available)
    const historicalAvg = historicalData?.averageWaitTime || 
                          historicalData?.averageWaitTimeForType ||
                          null;

    // Weighted combination
    let estimatedWaitTime: number;
    
    if (historicalAvg) {
      // Use weighted average: 40% rules, 60% historical
      const ruleBasedEstimate = baseWaitTime + positionFactor + delayFactor + utilizationFactor;
      estimatedWaitTime = (0.4 * ruleBasedEstimate) + (0.6 * historicalAvg);
    } else {
      // Pure rule-based
      estimatedWaitTime = baseWaitTime + positionFactor + delayFactor + utilizationFactor;
    }

    // Clamp between reasonable bounds (5 minutes to 2 hours)
    estimatedWaitTime = Math.max(5, Math.min(estimatedWaitTime, 120));

    // Calculate confidence based on data availability
    let confidence = this.minConfidence;
    if (historicalAvg) confidence += 0.15; // Historical data increases confidence
    if (queueState?.averageWaitTime) confidence += 0.1; // Current queue state helps
    if (staffInfo?.staffUtilization !== undefined) confidence += 0.1; // Staff info helps
    confidence = Math.min(confidence, 0.85); // Cap at 85% for rule-based

    // Build explanation
    const explanation = this.buildExplanation({
      baseWaitTime,
      positionFactor,
      delayFactor,
      utilizationFactor,
      historicalAvg,
      estimatedWaitTime,
      queueState,
      staffInfo,
    });

    return {
      waitTimeMinutes: Math.round(estimatedWaitTime),
      confidence,
      mode: 'rule-based',
      explanation,
      features: {
        baseWaitTime,
        queuePosition: appointment.queuePosition,
        positionFactor,
        currentDelay: delayFactor,
        staffUtilization: utilization,
        utilizationFactor,
        historicalAverage: historicalAvg,
        finalEstimate: estimatedWaitTime,
      },
    };
  }

  /**
   * Build human-readable explanation
   */
  private buildExplanation(params: {
    baseWaitTime: number;
    positionFactor: number;
    delayFactor: number;
    utilizationFactor: number;
    historicalAvg: number | null;
    estimatedWaitTime: number;
    queueState?: EstimationContext['queueState'];
    staffInfo?: EstimationContext['staffInfo'];
  }): WaitTimeEstimation['explanation'] {
    const factors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; value: string | number }> = [];

    // Queue position (high impact)
    if (params.positionFactor > 0) {
      factors.push({
        factor: `Queue position: ${Math.round(params.positionFactor / 5) + 1} patients ahead`,
        impact: 'high',
        value: `${Math.round(params.positionFactor)} min`,
      });
    }

    // Current delay (high impact)
    if (params.delayFactor > 0) {
      factors.push({
        factor: 'Current clinic delay',
        impact: 'high',
        value: `${Math.round(params.delayFactor)} min`,
      });
    }

    // Staff utilization (medium impact)
    if (params.staffInfo?.staffUtilization !== undefined) {
      const utilizationPercent = Math.round(params.staffInfo.staffUtilization * 100);
      factors.push({
        factor: 'Staff utilization',
        impact: utilizationPercent > 80 ? 'high' : 'medium',
        value: `${utilizationPercent}%`,
      });
    }

    // Historical average (medium impact)
    if (params.historicalAvg) {
      factors.push({
        factor: 'Historical average wait time',
        impact: 'medium',
        value: `${Math.round(params.historicalAvg)} min`,
      });
    }

    // Base wait time (low impact)
    factors.push({
      factor: 'Base wait time',
      impact: 'low',
      value: `${params.baseWaitTime} min`,
    });

    // Confidence interval (±20% of estimate)
    const margin = Math.round(params.estimatedWaitTime * 0.2);
    const confidenceInterval: [number, number] = [
      Math.max(5, Math.round(params.estimatedWaitTime - margin)),
      Math.min(120, Math.round(params.estimatedWaitTime + margin)),
    ];

    return {
      topFactors: factors.slice(0, 3), // Top 3 factors
      confidenceInterval,
      context: params.historicalAvg
        ? 'Estimate based on current queue state and historical patterns'
        : 'Estimate based on current queue state',
    };
  }

  /**
   * Rule-based estimator is always available
   */
  async isAvailable(): Promise<boolean> {
    return true; // Rule-based always works
  }

  /**
   * Get estimator mode
   */
  getMode(): EstimationMode {
    return 'rule-based';
  }

  /**
   * Get minimum confidence threshold
   */
  getMinConfidence(): number {
    return this.minConfidence;
  }
}


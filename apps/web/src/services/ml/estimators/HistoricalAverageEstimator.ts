/**
 * Historical Average Wait Time Estimator
 * 
 * Simple fallback estimator using historical averages.
 * Used when other estimators fail or are unavailable.
 */

import { IWaitTimeEstimator, type WaitTimeEstimation, type EstimationContext, type EstimationMode } from './IWaitTimeEstimator';
import { logger } from '../../shared/logging/Logger';

export class HistoricalAverageEstimator implements IWaitTimeEstimator {
  private readonly minConfidence = 0.5; // Historical average is least confident
  private readonly defaultWaitTime = 15; // Default if no historical data

  /**
   * Estimate wait time using historical averages
   */
  async estimate(context: EstimationContext): Promise<WaitTimeEstimation> {
    const { appointment, historicalData, clinicConfig } = context;
    
    logger.debug('Estimating wait time using historical average', {
      appointmentId: appointment.id,
    });

    // Try to get historical average (prefer type-specific, then general)
    const historicalAvg = historicalData?.averageWaitTimeForType ||
                         historicalData?.averageWaitTimeForTimeSlot ||
                         historicalData?.averageWaitTime ||
                         clinicConfig?.averageAppointmentDuration ||
                         this.defaultWaitTime;

    // Confidence is low for historical average alone
    const confidence = 0.5;

    // Build explanation
    const explanation: WaitTimeEstimation['explanation'] = {
      topFactors: [
        {
          factor: 'Historical average wait time',
          impact: 'medium',
          value: `${Math.round(historicalAvg)} min`,
        },
      ],
      confidenceInterval: [
        Math.max(5, Math.round(historicalAvg * 0.7)),
        Math.min(120, Math.round(historicalAvg * 1.5)),
      ],
      context: 'Estimate based on historical patterns. Less accurate than real-time estimates.',
    };

    return {
      waitTimeMinutes: Math.round(historicalAvg),
      confidence,
      mode: 'historical-average',
      explanation,
      features: {
        historicalAverage: historicalAvg,
        source: historicalData?.averageWaitTimeForType ? 'type-specific' :
                historicalData?.averageWaitTimeForTimeSlot ? 'time-slot-specific' :
                historicalData?.averageWaitTime ? 'general' : 'default',
      },
    };
  }

  /**
   * Historical average is always available (has default)
   */
  async isAvailable(): Promise<boolean> {
    return true; // Always available (uses default if no data)
  }

  /**
   * Get estimator mode
   */
  getMode(): EstimationMode {
    return 'historical-average';
  }

  /**
   * Get minimum confidence threshold
   */
  getMinConfidence(): number {
    return this.minConfidence;
  }
}


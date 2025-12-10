/**
 * ML-Based Wait Time Estimator
 * 
 * Wraps the ML API client to provide estimation via ML model.
 * Falls back gracefully if ML service is unavailable.
 */

import { IWaitTimeEstimator, type WaitTimeEstimation, type EstimationContext, type EstimationMode } from './IWaitTimeEstimator';
import { mlApiClient, type WaitTimePrediction } from '../MlApiClient';
import { logger } from '../../shared/logging/Logger';

export class MlEstimator implements IWaitTimeEstimator {
  private readonly minConfidence = 0.7; // ML should be more confident than rule-based
  
  /**
   * Estimate wait time using ML model
   */
  async estimate(context: EstimationContext): Promise<WaitTimeEstimation> {
    const { appointment } = context;
    
    logger.debug('Estimating wait time using ML model', {
      appointmentId: appointment.id,
    });

    try {
      // Call ML API (which calls Edge Function → External ML Service)
      const prediction: WaitTimePrediction = await mlApiClient.predictWaitTime(appointment.id);

      // Convert ML prediction to estimation format
      const estimation: WaitTimeEstimation = {
        waitTimeMinutes: prediction.waitTimeMinutes,
        confidence: prediction.confidence,
        mode: 'ml',
        explanation: prediction.features ? this.buildExplanationFromFeatures(prediction.features) : undefined,
        features: prediction.features,
      };

      // Validate confidence threshold
      if (estimation.confidence < this.minConfidence) {
        logger.warn('ML prediction confidence below threshold, should fallback', {
          appointmentId: appointment.id,
          confidence: estimation.confidence,
          minConfidence: this.minConfidence,
        });
      }

      return estimation;
    } catch (error) {
      logger.error('ML estimation failed', error as Error, {
        appointmentId: appointment.id,
      });
      
      // Re-throw to trigger fallback in orchestrator
      throw new Error(`ML estimation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build explanation from ML features
   */
  private buildExplanationFromFeatures(features: Record<string, unknown>): WaitTimeEstimation['explanation'] {
    // Extract top contributing features (if provided by ML service)
    const topFactors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; value: string | number }> = [];

    // Common feature names to look for
    const featurePriority: Record<string, 'high' | 'medium' | 'low'> = {
      queue_position: 'high',
      current_delay: 'high',
      staff_utilization: 'high',
      queue_length: 'medium',
      historical_avg_wait_time: 'medium',
      hour_of_day: 'low',
      day_of_week: 'low',
    };

    // Sort features by priority
    const sortedFeatures = Object.entries(features)
      .filter(([key]) => featurePriority[key])
      .sort(([a], [b]) => {
        const priorityA = featurePriority[a] || 'low';
        const priorityB = featurePriority[b] || 'low';
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[priorityB] - priorityOrder[priorityA];
      })
      .slice(0, 3); // Top 3

    for (const [key, value] of sortedFeatures) {
      const impact = featurePriority[key] || 'low';
      topFactors.push({
        factor: this.formatFeatureName(key),
        impact,
        value: typeof value === 'number' ? Math.round(value) : String(value),
      });
    }

    return {
      topFactors: topFactors.length > 0 ? topFactors : undefined,
      context: 'Estimate based on ML model trained on historical data',
    };
  }

  /**
   * Format feature name for display
   */
  private formatFeatureName(key: string): string {
    const nameMap: Record<string, string> = {
      queue_position: 'Queue position',
      current_delay: 'Current clinic delay',
      staff_utilization: 'Staff utilization',
      queue_length: 'Queue length',
      historical_avg_wait_time: 'Historical average',
      hour_of_day: 'Time of day',
      day_of_week: 'Day of week',
    };

    return nameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Check if ML service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Could ping ML service health endpoint
      // For now, we'll try and catch errors
      return true; // Assume available, will fail gracefully if not
    } catch (error) {
      logger.warn('ML service availability check failed', { error });
      return false;
    }
  }

  /**
   * Get estimator mode
   */
  getMode(): EstimationMode {
    return 'ml';
  }

  /**
   * Get minimum confidence threshold
   */
  getMinConfidence(): number {
    return this.minConfidence;
  }
}


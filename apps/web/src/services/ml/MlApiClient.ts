/**
 * ML API Client
 * 
 * FRONTEND: User experience + data ingestion ONLY
 * - Sends ONLY appointment ID to backend
 * - Receives prediction and displays it
 * - NO data processing, NO feature engineering
 * 
 * BACKEND: ALL processing happens in Edge Function
 * - Fetches all raw data
 * - Feature engineering
 * - ML prediction
 * 
 * This follows MLOps best practices:
 * - Frontend: UI/UX only
 * - Backend: All data processing, feature engineering, ML
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '../shared/logging/Logger';

export interface WaitTimePrediction {
  waitTimeMinutes: number;
  confidence: number;
  mode: string;
  features?: Record<string, unknown>;
}

export class MlApiClient {
  /**
   * Predict wait time for an appointment
   * 
   * Frontend sends ONLY appointment ID
   * Backend does ALL the work
   */
  async predictWaitTime(appointmentId: string): Promise<WaitTimePrediction> {
    try {
      logger.debug('Requesting wait time prediction from backend', { appointmentId });

      // Call Supabase Edge Function
      // Frontend sends ONLY appointment ID - no processing!
      const { data, error } = await supabase.functions.invoke('predict-wait-time', {
        body: { appointmentId },
      });

      if (error) {
        logger.error('ML API call failed', error, { appointmentId });
        throw new Error(`ML prediction failed: ${error.message}`);
      }

      if (!data || !data.prediction) {
        throw new Error('Invalid response from ML service');
      }

      logger.info('Received prediction from backend', {
        appointmentId,
        waitTime: data.prediction.waitTimeMinutes,
        confidence: data.prediction.confidence,
      });

      return data.prediction;
    } catch (error) {
      logger.error('Unexpected error calling ML API', error as Error, { appointmentId });
      throw error;
    }
  }

  /**
   * Batch predict wait times for multiple appointments
   * 
   * Frontend sends ONLY appointment IDs
   * Backend processes all
   */
  async predictWaitTimesBatch(appointmentIds: string[]): Promise<Map<string, WaitTimePrediction>> {
    const predictions = new Map<string, WaitTimePrediction>();

    // For now, call individually
    // TODO: Backend could support batch endpoint
    for (const appointmentId of appointmentIds) {
      try {
        const prediction = await this.predictWaitTime(appointmentId);
        predictions.set(appointmentId, prediction);
      } catch (error) {
        logger.warn('Failed to get prediction for appointment', { appointmentId, error });
        // Continue with other appointments
      }
    }

    return predictions;
  }
}

export const mlApiClient = new MlApiClient();


/**
 * Wait Time Estimator Interface
 * 
 * Common contract for all wait time estimation strategies.
 * This allows us to swap estimators without changing calling code.
 * 
 * Follows Strategy Pattern + Dependency Inversion Principle
 */

import type { QueueEntry } from '../../queue/models/QueueModels';

/**
 * Estimation result with metadata
 */
export interface WaitTimeEstimation {
  /** Estimated wait time in minutes */
  waitTimeMinutes: number;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Estimation mode/strategy used */
  mode: EstimationMode;
  
  /** Human-readable explanation of the prediction */
  explanation?: EstimationExplanation;
  
  /** Features used for estimation (for debugging/analytics) */
  features?: Record<string, unknown>;
}

/**
 * Estimation modes
 */
export type EstimationMode = 'ml' | 'rule-based' | 'historical-average' | 'fallback';

/**
 * Explanation of the estimation
 */
export interface EstimationExplanation {
  /** Top contributing factors */
  topFactors: Array<{
    factor: string;
    impact: 'high' | 'medium' | 'low';
    value: string | number;
  }>;
  
  /** Confidence interval [min, max] in minutes */
  confidenceInterval?: [number, number];
  
  /** Additional context */
  context?: string;
}

/**
 * Context needed for estimation
 */
export interface EstimationContext {
  /** The appointment to estimate for */
  appointment: QueueEntry;
  
  /** Current queue state */
  queueState?: {
    totalWaiting: number;
    totalInProgress: number;
    averageWaitTime?: number;
    currentDelay?: number;
  };
  
  /** Staff information */
  staffInfo?: {
    activeStaffCount: number;
    staffUtilization?: number;
    averageConsultationDuration?: number;
  };
  
  /** Historical patterns */
  historicalData?: {
    averageWaitTime?: number;
    averageWaitTimeForType?: number;
    averageWaitTimeForTimeSlot?: number;
  };
  
  /** Clinic configuration */
  clinicConfig?: {
    bufferTime?: number;
    averageAppointmentDuration?: number;
    operatingMode?: string;
  };
}

/**
 * Wait Time Estimator Interface
 * 
 * All estimators must implement this interface.
 * This allows for easy swapping and testing.
 */
export interface IWaitTimeEstimator {
  /**
   * Estimate wait time for an appointment
   * 
   * @param context - Context needed for estimation
   * @returns Promise resolving to wait time estimation
   */
  estimate(context: EstimationContext): Promise<WaitTimeEstimation>;
  
  /**
   * Check if this estimator is available/ready
   * 
   * @returns true if estimator can be used
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get the mode/type of this estimator
   */
  getMode(): EstimationMode;
  
  /**
   * Get minimum confidence threshold for this estimator
   * If confidence is below this, should fallback to another estimator
   */
  getMinConfidence(): number;
}


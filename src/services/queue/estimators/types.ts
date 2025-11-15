import { ClinicEstimationConfig, EstimationMode, QueueEntry, WaitTimeFeatureSnapshot } from "../models/QueueModels";

export interface WaitTimeEstimatorContext {
  clinicConfig: ClinicEstimationConfig;
  schedule: QueueEntry[];
  currentTime: Date;
  historicalSnapshots?: WaitTimeFeatureSnapshot[];
}

export interface WaitTimeEstimatorMetadata {
  generator: string;
  version: string;
  generatedAt: string;
  notes?: string;
}

export interface WaitTimePrediction {
  appointmentId: string;
  clinicId: string;
  patientId: string;
  estimatedMinutes: number;
  lowerConfidence?: number;
  upperConfidence?: number;
  confidence?: number;
  mode: EstimationMode;
  featureHash?: string;
  featureSnapshot?: Record<string, unknown>;
}

export interface WaitTimeEstimationResult {
  mode: EstimationMode;
  predictions: WaitTimePrediction[];
  metadata: WaitTimeEstimatorMetadata;
}

export interface WaitTimeEstimator {
  estimate(context: WaitTimeEstimatorContext): Promise<WaitTimeEstimationResult>;
}

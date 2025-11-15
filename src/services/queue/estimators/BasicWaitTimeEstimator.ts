import { AppointmentStatus, QueueEntry, SkipReason } from "../models/QueueModels";
import {
  WaitTimeEstimator,
  WaitTimeEstimatorContext,
  WaitTimeEstimationResult,
  WaitTimePrediction,
} from "./types";

export class BasicWaitTimeEstimator implements WaitTimeEstimator {
  async estimate(context: WaitTimeEstimatorContext): Promise<WaitTimeEstimationResult> {
    const { clinicConfig, schedule, currentTime } = context;
    const defaultDuration = Math.max(5, clinicConfig.averageAppointmentDuration || 15);

    let backlogMinutes = 0;
    const predictions: WaitTimePrediction[] = schedule.map((entry) => {
      const waitMinutes = Math.max(0, backlogMinutes);
      const bufferedWait = waitMinutes + clinicConfig.etaBufferMinutes;

      const prediction: WaitTimePrediction = {
        appointmentId: entry.id,
        clinicId: entry.clinicId,
        patientId: entry.patientId,
        estimatedMinutes: Math.max(0, Math.round(bufferedWait)),
        confidence: 0.6,
        mode: clinicConfig.estimationMode,
      };

      backlogMinutes += this.getRemainingDuration(entry, defaultDuration, currentTime);
      return prediction;
    });

    return {
      mode: clinicConfig.estimationMode,
      predictions,
      metadata: {
        generator: "basic-estimator",
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private getRemainingDuration(entry: QueueEntry, defaultDuration: number, now: Date): number {
    const duration = entry.estimatedDurationMinutes ?? defaultDuration;

    if (entry.status === AppointmentStatus.COMPLETED || entry.status === AppointmentStatus.CANCELLED) {
      return 0;
    }

    if (entry.status === AppointmentStatus.IN_PROGRESS && entry.actualStartTime) {
      const elapsed = (now.getTime() - entry.actualStartTime.getTime()) / 60000;
      return Math.max(duration - elapsed, 2);
    }

    let penalty = 0;
    if (entry.skipReason === SkipReason.PATIENT_ABSENT) {
      penalty += duration;
    }
    if (entry.skipReason === SkipReason.LATE_ARRIVAL) {
      penalty += duration * 0.5;
    }

    return duration + penalty;
  }
}

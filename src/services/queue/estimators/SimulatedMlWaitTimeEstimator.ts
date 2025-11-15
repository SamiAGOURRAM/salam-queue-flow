import { AppointmentStatus, QueueEntry, SkipReason, WaitTimeFeatureSnapshot } from "../models/QueueModels";
import { BasicWaitTimeEstimator } from "./BasicWaitTimeEstimator";
import {
  WaitTimeEstimator,
  WaitTimeEstimatorContext,
  WaitTimeEstimationResult,
  WaitTimePrediction,
} from "./types";

export class SimulatedMlWaitTimeEstimator implements WaitTimeEstimator {
  private readonly baselineEstimator = new BasicWaitTimeEstimator();

  async estimate(context: WaitTimeEstimatorContext): Promise<WaitTimeEstimationResult> {
    const baseline = await this.baselineEstimator.estimate(context);
    const queueLength = context.schedule.filter((entry) =>
      entry.status === AppointmentStatus.WAITING || entry.status === AppointmentStatus.SCHEDULED
    ).length;
    const historicalInsights = this.aggregateHistoricalSnapshots(context.historicalSnapshots);

    const predictions: WaitTimePrediction[] = baseline.predictions.map((prediction, index) => {
      const entry = context.schedule[index];
      const features = this.buildFeatureSnapshot(entry, index, queueLength, context.schedule.length, historicalInsights);
      const adjustment = this.computeAdjustment(entry, features, historicalInsights);
      const estimatedMinutes = Math.max(0, prediction.estimatedMinutes + adjustment + historicalInsights.waitTimeDelta);
      const confidence = Math.min(0.95, 0.7 + historicalInsights.coverageScore * 0.25);

      return {
        ...prediction,
        estimatedMinutes,
        confidence,
        mode: context.clinicConfig.mlEnabled ? 'ml' : 'basic',
        featureSnapshot: features,
        featureHash: this.hash(JSON.stringify(features)),
      };
    });

    return {
      mode: context.clinicConfig.mlEnabled ? 'ml' : 'basic',
      predictions,
      metadata: {
        generator: "simulated-ml-estimator",
        version: context.clinicConfig.mlModelVersion || "sim-v1",
        generatedAt: new Date().toISOString(),
        notes: "Simulated ML output based on synthetic historical signals",
      },
    };
  }

  private computeAdjustment(
    entry: QueueEntry,
    features: Record<string, unknown>,
    insights: ReturnType<SimulatedMlWaitTimeEstimator['aggregateHistoricalSnapshots']>
  ): number {
    const seed = this.numericHash(entry.id);
    const loadFactor = Number(features.queueLength) || 0;
    const staffLoad = Number(features.staffLoad) || 1;
    const lateness = Number(features.latenessMinutes) || 0;
    const historicalVolatility = insights.driftScore || 0;

    let adjustment = ((seed % 11) - 5) * 0.5;
    adjustment += loadFactor * 0.3;
    adjustment += lateness * 0.2;
    adjustment += historicalVolatility * 0.4;

    if (entry.skipReason === SkipReason.PATIENT_ABSENT) {
      adjustment += 5;
    }

    return adjustment / Math.max(staffLoad, 1);
  }

  private buildFeatureSnapshot(
    entry: QueueEntry,
    index: number,
    queueLength: number,
    scheduleLength: number,
    insights: ReturnType<SimulatedMlWaitTimeEstimator['aggregateHistoricalSnapshots']>
  ): Record<string, unknown> {
    const patientsAhead = index;
    const latenessMinutes = entry.checkedInAt && entry.startTime
      ? Math.max(0, (entry.checkedInAt.getTime() - entry.startTime.getTime()) / 60000)
      : 0;

    return {
      appointmentType: entry.appointmentType,
      queuePosition: entry.queuePosition,
      patientsAhead,
      queueLength,
      totalAppointments: scheduleLength,
      isWalkIn: entry.isGuest || entry.isPresent === false,
      latenessMinutes: Number.isFinite(latenessMinutes) ? Number(latenessMinutes.toFixed(2)) : 0,
      staffLoad: scheduleLength / Math.max(queueLength, 1),
      historicalAverageWait: Number(insights.averageWaitTime.toFixed(2)),
      historicalAverageDuration: Number(insights.averageServiceDuration.toFixed(2)),
      historicalCoverage: insights.coverageScore,
    };
  }

  private aggregateHistoricalSnapshots(snapshots: WaitTimeFeatureSnapshot[] | undefined) {
    if (!snapshots?.length) {
      return {
        averageWaitTime: 10,
        averageServiceDuration: 15,
        waitTimeDelta: 0,
        driftScore: 0,
        coverageScore: 0,
      };
    }

    const sample = snapshots.slice(0, 200);
    const waitTimes = sample
      .map(snapshot => snapshot.labelWaitTime)
      .filter((value): value is number => typeof value === 'number');
    const serviceTimes = sample
      .map(snapshot => snapshot.labelServiceDuration)
      .filter((value): value is number => typeof value === 'number');

    const avgWait = waitTimes.length ? waitTimes.reduce((sum, value) => sum + value, 0) / waitTimes.length : 10;
    const avgService = serviceTimes.length ? serviceTimes.reduce((sum, value) => sum + value, 0) / serviceTimes.length : 15;
    const driftScore = this.computeDriftScore(sample.map(snapshot => snapshot.driftScore).filter((value): value is number => typeof value === 'number'));
    const waitTimeDelta = avgWait - avgService * 0.6;
    const coverageScore = Math.min(1, sample.length / 200);

    return {
      averageWaitTime: avgWait,
      averageServiceDuration: avgService,
      waitTimeDelta,
      driftScore,
      coverageScore,
    };
  }

  private computeDriftScore(values: number[]): number {
    if (!values.length) return 0;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
    return Math.min(5, Math.sqrt(variance));
  }

  private numericHash(value: string): number {
    return value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  }

  private hash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return `ml_${Math.abs(hash)}`;
  }
}

import { QueueRepository } from "../repositories/QueueRepository";
import { logger } from "../../shared/logging/Logger";
import { WaitTimeFeatureSnapshotInput, AppointmentType } from "../models/QueueModels";

export interface WaitTimeSimulationOptions {
  clinicId: string;
  days?: number;
  appointmentsPerDay?: number;
  featureSchemaVersion?: string;
  seed?: number;
}

const DEFAULT_APPOINTMENT_TYPES: AppointmentType[] = [
  AppointmentType.CONSULTATION,
  AppointmentType.FOLLOW_UP,
  AppointmentType.EMERGENCY,
  AppointmentType.PROCEDURE,
  AppointmentType.VACCINATION,
  AppointmentType.SCREENING,
];

export class WaitTimeDataSimulator {
  private readonly repository: QueueRepository;

  constructor(repository?: QueueRepository) {
    this.repository = repository || new QueueRepository();
  }

  async generate(options: WaitTimeSimulationOptions): Promise<{ inserted: number }> {
    const {
      clinicId,
      days = 30,
      appointmentsPerDay = 40,
      featureSchemaVersion = "sim.v1",
      seed = Date.now(),
    } = options;

    if (!clinicId) {
      throw new Error('clinicId is required to generate simulated data');
    }

    const snapshots: WaitTimeFeatureSnapshotInput[] = [];
    const now = new Date();

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - dayIndex);
      dayStart.setHours(8, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(18, 0, 0, 0);

      for (let index = 0; index < appointmentsPerDay; index += 1) {
        const queueLength = Math.max(5, Math.round(this.randomNormal(seed + dayIndex + index, 18, 4)));
        const patientsAhead = Math.max(0, Math.min(queueLength, Math.round(this.randomNormal(seed + index, queueLength / 2, queueLength / 6))));
        const appointmentType = this.sampleAppointmentType(seed + dayIndex + index);
        const waitTime = Math.max(0, Math.round(this.randomNormal(seed + patientsAhead, 18 + patientsAhead * 0.4, 6)));
        const serviceDuration = Math.max(8, Math.round(this.randomNormal(seed + queueLength, 14, 3)));
        const lateness = Math.max(0, Math.round(this.randomNormal(seed + queueLength + index, 3, 2)));
        const driftScore = Math.max(0, Number(this.randomNormal(seed + waitTime, 1.2, 0.8).toFixed(2)));

        const snapshot: WaitTimeFeatureSnapshotInput = {
          clinicId,
          hashedAppointmentId: this.hash(`${clinicId}-${dayIndex}-${index}`),
          hashedPatientId: this.hash(`${clinicId}-${dayIndex}-${index}-patient`),
          featureSchemaVersion,
          features: {
            appointmentType,
            queueLength,
            patientsAhead,
            isWalkIn: Math.random() < 0.2,
            latenessMinutes: lateness,
            dayOfWeek: dayStart.getDay(),
            hourOfDay: 8 + Math.floor((index / appointmentsPerDay) * 9),
          },
          labelWaitTime: waitTime,
          labelServiceDuration: serviceDuration,
          dataWindowStart: dayStart,
          dataWindowEnd: dayEnd,
          biasFlag: driftScore > 3,
          driftScore,
          processingPurpose: 'wait_time_optimization_sim',
        };

        snapshots.push(snapshot);
      }
    }

    const chunkSize = 500;
    for (let cursor = 0; cursor < snapshots.length; cursor += chunkSize) {
      const chunk = snapshots.slice(cursor, cursor + chunkSize);
      await this.repository.insertFeatureSnapshots(chunk);
    }

    logger.info('Simulated wait time feature snapshots generated', {
      clinicId,
      count: snapshots.length,
      days,
      appointmentsPerDay,
    });

    return { inserted: snapshots.length };
  }

  private randomNormal(seed: number, mean: number, stdDev: number): number {
    const x = Math.sin(seed) * 10000;
    const y = Math.cos(seed) * 10000;
    const u = x - Math.floor(x) || 0.5;
    const v = y - Math.floor(y) || 0.5;
    const mag = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + stdDev * mag;
  }

  private sampleAppointmentType(seed: number): AppointmentType {
    const index = Math.abs(Math.floor(seed) % DEFAULT_APPOINTMENT_TYPES.length);
    return DEFAULT_APPOINTMENT_TYPES[index];
  }

  private hash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return `sim_${Math.abs(hash)}`;
  }
}

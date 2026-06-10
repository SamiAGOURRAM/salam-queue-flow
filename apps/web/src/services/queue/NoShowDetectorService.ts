/**
 * No-Show Detector Service
 *
 * Detects grace-period expirations for absent patients and automatically
 * transitions appointments to NO_SHOW.
 */

import { QueueConfig } from '@/config/QueueConfig';
import { eventBus } from '../shared/events/EventBus';
import { logger } from '../shared/logging/Logger';
import {
  AppointmentStatus,
  type AbsentPatient,
} from './models/QueueModels';
import {
  QueueEventType,
  type AppointmentStatusChangedEvent,
  type PatientMarkedAbsentEvent,
  type PatientReturnedEvent,
} from './events/QueueEvents';
import { QueueRepository } from './repositories/QueueRepository';
import { QueueService } from './QueueService';
import { WaitlistService } from './WaitlistService';
import { GapManagerService } from './GapManagerService';

const DEFAULT_GRACE_MINUTES = 15;
const NO_SHOW_SCAN_INTERVAL_MS = 60_000;

export class NoShowDetectorService {
  private readonly repository: QueueRepository;
  private readonly queueService: QueueService;
  private readonly waitlistService: WaitlistService;
  private readonly gapManagerService: GapManagerService;

  private isInitialized = false;
  private isProcessing = false;
  private clinicId: string | null = null;
  private fallbackStaffId: string | null = null;

  private periodicCheckHandle: ReturnType<typeof setInterval> | null = null;
  private noShowTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private processingAppointmentIds: Set<string> = new Set();
  private unsubscribeFunctions: Array<() => void> = [];

  constructor(repository?: QueueRepository, queueService?: QueueService) {
    this.repository = repository || new QueueRepository();
    this.queueService = queueService || new QueueService(this.repository);
    this.waitlistService = new WaitlistService(undefined, this.queueService);
    this.gapManagerService = new GapManagerService(this.repository, this.waitlistService, this.queueService);
  }

  /**
   * Initialize detector for a clinic dashboard context.
   * Re-initializes automatically when context changes.
   */
  initialize(clinicId: string, staffId: string): void {
    if (!clinicId || !staffId) return;

    if (
      this.isInitialized &&
      this.clinicId === clinicId &&
      this.fallbackStaffId === staffId
    ) {
      return;
    }

    if (this.isInitialized) {
      this.cleanup();
    }

    this.clinicId = clinicId;
    this.fallbackStaffId = staffId;

    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_MARKED_ABSENT, this.handlePatientMarkedAbsent)
    );
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.PATIENT_RETURNED, this.handlePatientReturned)
    );
    this.unsubscribeFunctions.push(
      eventBus.subscribe(QueueEventType.APPOINTMENT_STATUS_CHANGED, this.handleAppointmentStatusChanged)
    );

    this.periodicCheckHandle = setInterval(() => {
      void this.processExpiredAbsences();
    }, NO_SHOW_SCAN_INTERVAL_MS);

    this.isInitialized = true;

    logger.info('No-show detector initialized', {
      clinicId,
      fallbackStaffId: staffId,
    });

    void this.bootstrapExistingAbsences();
    void this.processExpiredAbsences();
  }

  cleanup(): void {
    if (!this.isInitialized) return;

    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];

    if (this.periodicCheckHandle) {
      clearInterval(this.periodicCheckHandle);
      this.periodicCheckHandle = null;
    }

    this.noShowTimers.forEach(handle => clearTimeout(handle));
    this.noShowTimers.clear();
    this.processingAppointmentIds.clear();

    this.isInitialized = false;
    this.clinicId = null;
    this.fallbackStaffId = null;
  }

  private handlePatientMarkedAbsent = async (event: PatientMarkedAbsentEvent): Promise<void> => {
    if (!this.clinicId || event.clinicId !== this.clinicId) return;

    const gracePeriodEndsAt = event.payload.gracePeriodEndsAt
      ? new Date(event.payload.gracePeriodEndsAt)
      : new Date(Date.now() + DEFAULT_GRACE_MINUTES * 60_000);

    this.scheduleNoShowTimer(event.appointmentId, gracePeriodEndsAt);
  };

  private handlePatientReturned = async (event: PatientReturnedEvent): Promise<void> => {
    if (!this.clinicId || event.clinicId !== this.clinicId) return;
    this.clearNoShowTimer(event.appointmentId);
  };

  private handleAppointmentStatusChanged = async (event: AppointmentStatusChangedEvent): Promise<void> => {
    if (!this.clinicId || event.clinicId !== this.clinicId) return;

    if (
      event.payload.newStatus === AppointmentStatus.NO_SHOW ||
      event.payload.newStatus === AppointmentStatus.CANCELLED ||
      event.payload.newStatus === AppointmentStatus.COMPLETED ||
      event.payload.newStatus === AppointmentStatus.RESCHEDULED
    ) {
      this.clearNoShowTimer(event.appointmentId);
    }
  };

  private async bootstrapExistingAbsences(): Promise<void> {
    if (!this.clinicId) return;

    try {
      const now = new Date();

      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const absences = await this.repository.getAbsentPatients(
        this.clinicId,
        startOfDay.toISOString(),
        endOfDay.toISOString()
      );

      absences
        .filter(absent => !absent.returnedAt && !absent.autoCancelled && absent.gracePeriodEndsAt)
        .forEach(absent => this.scheduleNoShowTimer(absent.appointmentId, absent.gracePeriodEndsAt!));
    } catch (error) {
      logger.error('Failed to bootstrap existing absences for no-show detector', error as Error, {
        clinicId: this.clinicId,
      });
    }
  }

  private scheduleNoShowTimer(appointmentId: string, gracePeriodEndsAt: Date): void {
    this.clearNoShowTimer(appointmentId);

    const delayMs = gracePeriodEndsAt.getTime() - Date.now();

    if (delayMs <= 0) {
      void this.processSingleGraceExpiry(appointmentId);
      return;
    }

    const timerHandle = setTimeout(() => {
      void this.processSingleGraceExpiry(appointmentId);
    }, delayMs);

    this.noShowTimers.set(appointmentId, timerHandle);
  }

  private clearNoShowTimer(appointmentId: string): void {
    const timerHandle = this.noShowTimers.get(appointmentId);
    if (!timerHandle) return;

    clearTimeout(timerHandle);
    this.noShowTimers.delete(appointmentId);
  }

  private async processExpiredAbsences(): Promise<void> {
    if (!this.clinicId || this.isProcessing) return;

    this.isProcessing = true;

    try {
      const expiredAbsences = await this.repository.getPendingGraceExpiries(new Date(), this.clinicId);

      for (const absent of expiredAbsences) {
        await this.processSingleGraceExpiry(absent.appointmentId, absent);
      }
    } catch (error) {
      logger.error('Failed processing expired absences', error as Error, {
        clinicId: this.clinicId,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleGraceExpiry(
    appointmentId: string,
    absentRecord?: AbsentPatient
  ): Promise<void> {
    this.clearNoShowTimer(appointmentId);

    // Deduplication: prevent timer + periodic scan from double-processing
    if (this.processingAppointmentIds.has(appointmentId)) {
      return;
    }
    this.processingAppointmentIds.add(appointmentId);

    try {
      const noShowEntry = await this.queueService.autoMarkNoShow(appointmentId);
      if (!noShowEntry) return;

      const assignedStaffId = noShowEntry.staffId || this.fallbackStaffId;
      if (!assignedStaffId) {
        logger.warn('Skipping gap handling after auto no-show because no staff context is available', {
          appointmentId,
          clinicId: noShowEntry.clinicId,
        });
        return;
      }

      const durationMinutes =
        noShowEntry.estimatedDurationMinutes ||
        QueueConfig.DEFAULTS.DEFAULT_APPOINTMENT_DURATION_MINUTES;

      const gapStart = new Date();
      const gapEnd = new Date(gapStart.getTime() + durationMinutes * 60_000);

      await this.gapManagerService.handleGap(
        noShowEntry.clinicId,
        gapStart,
        gapEnd,
        assignedStaffId
      );

      logger.info('Processed grace expiry and auto no-show transition', {
        appointmentId,
        clinicId: noShowEntry.clinicId,
        gracePeriodEndedAt: absentRecord?.gracePeriodEndsAt?.toISOString(),
      });
    } catch (error) {
      // Remove from set so it can be retried on next cycle
      this.processingAppointmentIds.delete(appointmentId);
      logger.error('Failed to process grace expiry for appointment', error as Error, {
        appointmentId,
      });
    }
  }
}

export const noShowDetectorService = new NoShowDetectorService();

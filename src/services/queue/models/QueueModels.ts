/**
 * Queue Domain Models
 * Represents the core business entities for queue management
 */

// ============================================
// ENUMS & TYPES (matching database schema)
// ============================================

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
  RESCHEDULED = 'rescheduled',
}

export enum AppointmentType {
  CONSULTATION = 'consultation',
  FOLLOW_UP = 'follow_up',
  EMERGENCY = 'emergency',
  PROCEDURE = 'procedure',
  VACCINATION = 'vaccination',
  SCREENING = 'screening',
}

export enum SkipReason {
  PATIENT_ABSENT = 'patient_absent',
  PATIENT_PRESENT = 'patient_present',
  EMERGENCY_CASE = 'emergency_case',
  DOCTOR_PREFERENCE = 'doctor_preference',
  LATE_ARRIVAL = 'late_arrival',
  TECHNICAL_ISSUE = 'technical_issue',
  OTHER = 'other',
}

export enum QueueActionType {
  CALL_PRESENT = 'call_present',
  MARK_ABSENT = 'mark_absent',
  LATE_ARRIVAL = 'late_arrival',
  EMERGENCY = 'emergency',
  REORDER = 'reorder',
}

// ============================================
// DOMAIN ENTITIES
// ============================================

/**
 * Patient Information
 */
export interface Patient {
  id: string;
  fullName: string;
  phoneNumber?: string;
  email?: string;
  dateOfBirth?: Date;
}

/**
 * Queue Entry (Appointment in Queue Context)
 */
export interface QueueEntry {
  id: string;
  clinicId: string;
  patientId: string;
  staffId?: string;
  appointmentDate: Date;
  scheduledTime?: string;
  queuePosition: number;
  originalQueuePosition?: number;
  status: AppointmentStatus;
  appointmentType: AppointmentType;
  isPresent: boolean;
  markedAbsentAt?: Date;
  returnedAt?: Date;
  skipCount: number;
  skipReason?: SkipReason;
  overrideBy?: string;
  checkedInAt?: Date;
  actualStartTime?: Date;
  actualEndTime?: Date;
  startTime?: Date;
  endTime?: Date;
  estimatedDurationMinutes?: number;
  estimatedWaitTime?: number;
  predictionMode?: EstimationMode;
  predictionConfidence?: number;
  predictedStartTime?: Date;
  etaSource?: EstimationMode;
  etaUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Guest patient support
  isGuest?: boolean;
  guestPatientId?: string;
  
  // Relations (optional - populated on demand)
  patient?: Patient;
}

/**
 * Absent Patient Record
 */
export interface AbsentPatient {
  id: string;
  appointmentId: string;
  clinicId: string;
  patientId: string;
  markedAbsentAt: Date;
  returnedAt?: Date;
  newPosition?: number;
  notificationSent: boolean;
  gracePeriodEndsAt?: Date;
  autoCancelled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Queue Override Audit Record
 */
export interface QueueOverride {
  id: string;
  clinicId: string;
  appointmentId: string;
  skippedPatientIds: string[];
  actionType: QueueActionType;
  performedBy: string;
  reason?: string;
  previousPosition?: number;
  newPosition?: number;
  createdAt: Date;
}

/**
 * Queue Statistics
 */
export interface QueueStats {
  totalInQueue: number;
  currentPosition: number;
  estimatedWaitTime: number; // in minutes
  averageServiceTime: number; // in minutes
  patientsAhead: number;
  lastUpdated: Date;
}

/**
 * Queue Summary for Display
 */
export interface QueueSummary {
  clinicId: string;
  date: Date;
  totalAppointments: number;
  waiting: number;
  inProgress: number;
  completed: number;
  absent: number;
  noShow: number;
  averageWaitTime: number;
  currentQueueLength: number;
}

// ============================================
// ESTIMATION & CONFIGURATION MODELS
// ============================================

export type EstimationMode = 'basic' | 'ml' | 'hybrid';

export interface ClinicEstimationConfig {
  clinicId: string;
  estimationMode: EstimationMode;
  averageAppointmentDuration: number;
  etaBufferMinutes: number;
  etaRefreshIntervalSec: number;
  mlEnabled: boolean;
  mlModelVersion?: string;
  mlEndpointUrl?: string;
  rawSettings?: Record<string, unknown>;
}

export interface WaitTimePredictionRecord {
  appointmentId: string;
  clinicId: string;
  estimatedMinutes: number;
  lowerConfidence?: number;
  upperConfidence?: number;
  confidenceScore?: number;
  mode: EstimationMode;
  modelVersion?: string;
  featureHash?: string;
  features?: Record<string, unknown>;
}

export interface WaitTimeFeatureSnapshot {
  clinicId: string;
  hashedAppointmentId: string;
  hashedPatientId?: string;
  featureSchemaVersion: string;
  features: Record<string, unknown>;
  labelWaitTime?: number;
  labelServiceDuration?: number;
  dataWindowStart?: Date;
  dataWindowEnd?: Date;
  biasFlag?: boolean;
  driftScore?: number;
  processingPurpose?: string;
  createdAt?: Date;
}

export type WaitTimeFeatureSnapshotInput = Omit<WaitTimeFeatureSnapshot, 'createdAt'>;

// ============================================
// VALUE OBJECTS
// ============================================

/**
 * Queue Position
 * Encapsulates position logic with validation
 */
export class QueuePosition {
  constructor(
    public readonly value: number,
    public readonly isOverridden: boolean = false,
    public readonly originalValue?: number
  ) {
    if (value < 1) {
      throw new Error('Queue position must be greater than 0');
    }
  }

  static create(position: number): QueuePosition {
    return new QueuePosition(position);
  }

  static createOverridden(newPosition: number, originalPosition: number): QueuePosition {
    return new QueuePosition(newPosition, true, originalPosition);
  }

  isFirst(): boolean {
    return this.value === 1;
  }

  increment(): QueuePosition {
    return new QueuePosition(this.value + 1, this.isOverridden, this.originalValue);
  }

  decrement(): QueuePosition {
    if (this.value === 1) {
      return this;
    }
    return new QueuePosition(this.value - 1, this.isOverridden, this.originalValue);
  }
}

// ============================================
// DATA TRANSFER OBJECTS (DTOs)
// ============================================

/**
 * DTO for creating a queue entry
 */
export interface CreateQueueEntryDTO {
  clinicId: string;
  patientId: string;
  staffId?: string;
  appointmentDate: Date;
  scheduledTime?: string;
  appointmentType: AppointmentType;
  autoAssignPosition?: boolean;
}

/**
 * DTO for updating queue entry
 */
export interface UpdateQueueEntryDTO {
  queuePosition?: number;
  status?: AppointmentStatus;
  isPresent?: boolean;
  skipReason?: SkipReason;
  scheduledTime?: string;
  appointmentType?: AppointmentType;
  markedAbsentAt?: string;
  returnedAt?: string;
}

/**
 * DTO for marking patient absent
 */
export interface MarkAbsentDTO {
  appointmentId: string;
  performedBy: string;
  reason?: string;
  gracePeriodMinutes?: number; // Default: 15 minutes
}

/**
 * DTO for calling next patient
 */
export interface CallNextPatientDTO {
  clinicId: string;
  date: Date;
  performedBy: string;
  skipAbsentPatients?: boolean; // Default: true
}

/**
 * DTO for reordering queue
 */
export interface ReorderQueueDTO {
  appointmentId: string;
  newPosition: number;
  performedBy: string;
  reason: string;
}

/**
 * DTO for queue filters
 */
export interface QueueFilters {
  clinicId: string;
  startDate: string;
  endDate: string;
  status?: AppointmentStatus[];
  includeAbsent?: boolean;
  includeCompleted?: boolean;
}

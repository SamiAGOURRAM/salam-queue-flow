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
  SWAP = 'swap',
  FORCE_ADD = 'force_add',
  PRIORITY_BOOST = 'priority_boost',
}

export type QueueMode = 'slotted' | 'fluid';

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
  checkedInAt?: Date; // Set when staff calls "Call Next" (patient enters consultation room)
  actualEndTime?: Date; // Set when staff completes appointment
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

  // Smart Queue Logic Fields (RFC)
  priorityScore?: number;
  isGapFiller?: boolean;
  promotedFromWaitlist?: boolean;
  lateArrivalConverted?: boolean;
  originalSlotTime?: Date;

  // Guest patient support
  isGuest?: boolean;
  guestPatientId?: string;

  // Relations (optional - populated on demand)
  patient?: Patient;
}

/**
 * Waitlist Entry (RFC)
 */
export interface WaitlistEntry {
  id: string;
  clinicId: string;
  patientId?: string;
  guestPatientId?: string;
  requestedDate: Date;
  requestedTimeRangeStart?: string;
  requestedTimeRangeEnd?: string;
  priorityScore: number;
  status: 'waiting' | 'notified' | 'promoted' | 'expired' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
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
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
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

export interface QueueState {
  totalWaiting: number;
  totalInProgress: number;
  averageWaitTime?: number;
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
  
  // Queue Logic Config (RFC)
  queueMode?: QueueMode;
  allowOverflow?: boolean;
  dailyCapacityLimit?: number;
  lateArrivalPolicy?: 'priority_walk_in' | 'reschedule_only';
  
  // New Config Overrides (Optional - falls back to QueueConfig)
  lateArrivalThresholdMinutes?: number;
  appointmentRunOverThresholdMinutes?: number;
  historicalDataLookbackDays?: number;
  rawSettings: Record<string, unknown>;
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
  appointmentDate?: Date; // Optional - can be derived from startTime
  scheduledTime?: string; // Optional - can be derived from startTime
  appointmentType: AppointmentType;
  autoAssignPosition?: boolean;
  // New fields for RPC function
  startTime?: string; // ISO string timestamp
  endTime?: string; // ISO string timestamp
  guestPatientId?: string | null;
  isGuest?: boolean;
  isWalkIn?: boolean;
  reasonForVisit?: string;
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
  checkedInAt?: string; // Set when staff calls "Call Next"
  actualEndTime?: string;
  actualDuration?: number;
  // RFC Fields
  priorityScore?: number;
  isGapFiller?: boolean;
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

export interface ResolveAbsentDTO {
  appointmentId: string;
  performedBy: string;
  resolution: 'rebooked' | 'waitlist';
}

/**
 * DTO for calling next patient
 */
export interface CallNextPatientDTO {
  clinicId: string;
  staffId: string; // Mandatory now for schedule fetching
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

/**
 * Context for Disruption Logic
 */
export interface Disruption {
  type: DisruptionType;
  appointmentId: string;
  clinicId: string;
  reason: string;
  timestamp: Date;
}

export enum DisruptionType {
  LATE_ARRIVAL = 'late_arrival',
  NO_SHOW = 'no_show',
  PATIENT_RETURNED = 'patient_returned',
  LONGER_THAN_EXPECTED = 'longer_than_expected',
  SHORTER_THAN_EXPECTED = 'shorter_than_expected',
  QUEUE_OVERRIDE = 'queue_override',
  EMERGENCY_INSERTED = 'emergency_inserted',
  DOCTOR_LATE = 'doctor_late',
  MULTIPLE_NO_SHOWS = 'multiple_no_shows',
  APPOINTMENT_RUNNING_OVER = 'appointment_running_over',
}

export interface EstimationContext {
  appointment: QueueEntry;
  queueState: QueueState;
  staffInfo?: {
    activeStaffCount: number;
    staffUtilization?: number;
    averageConsultationDuration?: number;
  };
  historicalData?: {
    averageWaitTime: number;
    averageWaitTimeForType?: number;
    averageWaitTimeForTimeSlot?: number;
  };
  clinicConfig?: {
    bufferTime?: number;
    averageAppointmentDuration?: number;
    operatingMode?: EstimationMode;
  };
}

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

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  PARTIALLY_PAID = 'partially_paid',
  REFUNDED = 'refunded',
  WAIVED = 'waived',
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

export enum QueueMode {
  SLOTTED = 'slotted',
  FLUID = 'fluid',
  HYBRID = 'hybrid',
}

export type QueueScopeMode = 'clinic' | 'provider' | 'restricted';

export interface ResolvedQueueScope {
  clinicId: string;
  requesterStaffId?: string;
  scopeMode: QueueScopeMode;
  isClinicWide: boolean;
  isOwner: boolean;
  isProvider: boolean;
  allowedStaffIds: string[];
}

export enum WaitlistStatus {
  WAITING = 'waiting',
  NOTIFIED = 'notified',
  PROMOTED = 'promoted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
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
 * Clinic Information (optional relation on queue entries)
 */
export interface Clinic {
  id: string;
  name?: string;
  specialty?: string;
  city?: string;
}

export interface QueueResource {
  id: string;
  name: string;
  resourceType: string;
}

export interface ClinicResourceAvailability {
  id: string;
  clinicId: string;
  name: string;
  resourceType: string;
  capacity: number;
  displayOrder: number;
  isActive: boolean;
  notes?: string | null;
  isOccupied: boolean;
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
  isWalkIn?: boolean;
  isPresent: boolean;
  markedAbsentAt?: Date;
  returnedAt?: Date;
  skipCount: number;
  skipReason?: SkipReason;
  overrideBy?: string;
  checkedInAt?: Date; // Set when staff calls "Call Next" (patient enters consultation room)
  actualEndTime?: Date; // Set when staff completes appointment
  billingAmount?: number;
  currency?: string;
  paymentStatus?: PaymentStatus;
  paidAt?: Date;
  paymentMethod?: string;
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
  queueStatusToken?: string;
  lateArrivalConverted?: boolean;
  originalSlotTime?: Date;

  // Relations (optional - populated on demand)
  patient?: Patient;
  clinic?: Clinic;
  resourceId?: string;
  resource?: QueueResource;
}

/**
 * Waitlist Entry (RFC)
 */
export interface WaitlistEntry {
  id: string;
  clinicId: string;
  patientId?: string;
  requestedDate: Date;
  requestedTimeRangeStart?: string;
  requestedTimeRangeEnd?: string;
  priorityScore: number;
  status: WaitlistStatus;
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

export interface QueueBreakState {
  breakId: string;
  clinicId: string;
  staffId: string;
  startedBy: string;
  reason?: string | null;
  durationMinutes: number;
  startedAt: string;
  endsAt: string;
  endedAt?: string | null;
  remainingSeconds: number;
  pushedSchedule: boolean;
  shiftedAppointmentsCount: number;
}

export interface PublicQueueStatus {
  appointmentId: string;
  clinicId: string;
  clinicName: string;
  queuePosition: number;
  status: AppointmentStatus;
  appointmentDate: string | null;
  scheduledTime: string | null;
  predictedStartTime: string | null;
  predictedWaitTime: number | null;
  appointmentType: AppointmentType;
  checkedInAt: string | null;
  updatedAt: string | null;
}

// ============================================
// ESTIMATION & CONFIGURATION MODELS
// ============================================

export type EstimationMode =
  | 'basic'
  | 'ml'
  | 'rule-based'
  | 'historical-average';

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
  appointmentDate?: Date;
  scheduledTime?: string;
  appointmentType: AppointmentType;
  autoAssignPosition?: boolean;
  startTime?: string; // ISO string timestamp - used by createQueueEntryViaRpc
  endTime?: string; // ISO string timestamp - used by createQueueEntryViaRpc
  isWalkIn?: boolean;
  reasonForVisit?: string;
  isGapFiller?: boolean;
  promotedFromWaitlist?: boolean;
  billingAmount?: number;
  currency?: string;
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
  resourceId?: string | null;
  // RFC Fields
  priorityScore?: number;
  isGapFiller?: boolean;
  promotedFromWaitlist?: boolean;
  billingAmount?: number | null;
  currency?: string;
  paymentStatus?: PaymentStatus;
  paidAt?: string | null;
  paymentMethod?: string | null;
}

export interface UpdateAppointmentPaymentDTO {
  appointmentId: string;
  paymentStatus: PaymentStatus;
  paymentMethod?: string | null;
  paidAt?: string | null;
  billingAmount?: number;
  currency?: string;
}

/**
 * DTO for marking patient absent
 */
export interface MarkAbsentDTO {
  appointmentId: string;
  performedBy: string;
  reason?: string;
  gracePeriodMinutes?: number; // Default: 15 minutes
  allowedStaffIds?: string[];
}

export interface ResolveAbsentDTO {
  appointmentId: string;
  performedBy: string;
  resolution: 'rebooked' | 'waitlist';
  allowedStaffIds?: string[];
}

/**
 * DTO for calling next patient
 */
export interface CallNextPatientDTO {
  clinicId: string;
  staffId?: string;
  date: Date;
  performedBy: string;
  skipAbsentPatients?: boolean; // Default: true
  resourceId?: string;
  useClinicWide?: boolean;
  allowedStaffIds?: string[];
}

export interface CallSpecificPatientDTO {
  appointmentId: string;
  clinicId: string;
  staffId?: string;
  performedBy: string;
  reason?: string;
  resourceId?: string;
  useClinicWide?: boolean;
  allowedStaffIds?: string[];
}

export interface StartQueueBreakDTO {
  clinicId: string;
  staffId: string;
  durationMinutes: number;
  performedBy: string;
  reason?: string;
  pushSchedule?: boolean;
}

export interface EndQueueBreakDTO {
  clinicId: string;
  staffId: string;
  performedBy: string;
  reason?: string;
}

/**
 * DTO for reordering queue
 */
export interface ReorderQueueDTO {
  appointmentId: string;
  newPosition: number;
  performedBy: string;
  reason: string;
  allowedStaffIds?: string[];
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

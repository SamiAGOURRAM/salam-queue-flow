/**
 * Core Types - Shared type definitions
 */

// ============================================================================
// DISCOVERY CARD CONTRACT (doctor/clinic cards for the chat UI)
// ============================================================================
// Explicit `.js` so NodeNext/Node-ESM consumers can follow this re-export
// through the emitted .d.ts (see note in ../index.ts).
export * from './cards.js';

// ============================================================================
// GENERATED SUPABASE SCHEMA (canonical — web re-exports this; mcp TBD)
// ============================================================================
export * from './database.js';

// ============================================================================
// AUTH TYPES (transport-agnostic auth context for all consumers)
// ============================================================================
export * from './auth.js';

// ============================================================================
// BOOKING TYPES
// ============================================================================
export interface BookingSlot {
  time: string;
  available: boolean;
}

export interface AvailableSlotsResponse {
  available: boolean;
  reason?: string;
  slots: BookingSlot[];
  duration?: number;
  bufferTime?: number;
  mode?: QueueMode;
}

export interface BookingRequest {
  clinicId: string;
  /** Provider/staff to book with. Required: the booking RPCs are doctor-first (per-staff). */
  staffId: string;
  patientId: string;
  appointmentDate: string;
  scheduledTime: string | null;  // Can be null for free queue
  appointmentType: string;
  reasonForVisit?: string;
}

export interface BookingResponse {
  success: boolean;
  appointmentId?: string;
  queuePosition?: number;
  staffId?: string;
  error?: string;
}

export interface AppointmentAvailability {
  available: boolean;
  existingCount: number;
  capacity: number;
}

// ============================================================================
// QUEUE TYPES
// ============================================================================
export type QueueMode = 'fluid' | 'slotted' | 'hybrid' | null;

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
  RESCHEDULED = 'rescheduled',
}

export interface QueueEntry {
  id: string;
  clinicId: string;
  patientId: string;
  staffId?: string;
  appointmentDate: string;
  scheduledTime?: string;
  checkInTime?: string;
  startTime?: string;
  endTime?: string;
  status: AppointmentStatus;
  queuePosition?: number;
  appointmentType: string;
  reasonForVisit?: string;
  estimatedWaitTime?: number;
  actualWaitTime?: number;
  patientName?: string;
  patientPhone?: string;
}

export interface DailyScheduleEntry extends QueueEntry {
  patient: {
    fullName: string;
    phoneNumber?: string;
  };
}

export interface CallNextPatientDTO {
  clinicId: string;
  staffId: string;
  appointmentDate: string;
}

/**
 * Manual queue-action types, recorded in the `queue_overrides` audit trail.
 * Mirrors the web enum so staff queue operations are auditable from core.
 */
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

/**
 * Input for manually reordering a patient within the queue (staff action).
 * `allowedStaffIds` scopes the action: when non-empty, the target entry must
 * belong to one of these staff members (per-provider queue enforcement).
 */
export interface ReorderQueueDTO {
  appointmentId: string;
  newPosition: number;
  performedBy: string;
  reason: string;
  allowedStaffIds?: string[];
}

// ============================================================================
// PATIENT TYPES
// ============================================================================
export interface Patient {
  id: string;
  fullName: string;
  phoneNumber?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  city?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PatientProfile extends Patient {
  medicalHistory?: string;
  allergies?: string[];
  insuranceInfo?: {
    provider?: string;
    policyNumber?: string;
  };
  preferredLanguage?: string;
  notificationPreferences?: Record<string, unknown>;
  noShowCount?: number;
}

/** Origin of a patient record. */
export enum PatientSource {
  APP = 'app',
  WALK_IN = 'walk_in',
}

/** Who provided consent when a (walk-in) patient record was created. */
export enum ConsentGivenBy {
  PATIENT_APP = 'patient_app',
  PATIENT_VERBAL = 'patient_verbal',
}

/**
 * A walk-in (receptionist-entered) patient — lives in the unified `patients`
 * table with `source != 'app'`. PII is decrypted via RPC on read.
 */
export interface WalkInPatient {
  id: string;
  phoneNumber: string;
  fullName: string;
  source: string;
  isClaimed: boolean;
  claimedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of resolving a patient by phone, creating a walk-in if none exists. */
export interface FindOrCreatePatientResult {
  patientId: string | null;
  isNew: boolean;
}

// ============================================================================
// CLINIC TYPES
// ============================================================================
export interface Clinic {
  id: string;
  name: string;
  nameAr?: string;
  ownerId?: string;
  practiceType?: string;
  specialty?: string;
  address?: string;
  city?: string;
  /** Maps to DB column `phone`. */
  phoneNumber?: string;
  email?: string;
  logoUrl?: string;
  settings?: ClinicSettings;
  subscriptionTier?: string;
  isActive?: boolean;
  queueMode?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Clinic settings are stored as opaque JSON in the DB (`clinics.settings`), so
 * the canonical contract is "an open record". These are the known, optional
 * fields; the index signature reflects that the DB column may carry additional
 * keys (e.g. snake_case keys written by the web layer) that core passes through
 * untouched. Type honestly mirrors the repository, which casts raw JSON here.
 */
export interface ClinicSettings {
  defaultSlotDuration?: number;
  maxDailyAppointments?: number;
  workingHours?: {
    start: string;
    end: string;
  };
  queueMode?: QueueMode;
  appointmentTypes?: AppointmentType[];
  [key: string]: unknown;
}

export interface AppointmentType {
  name: string;
  label: string;
  duration: number;
}

// ============================================================================
// STAFF TYPES
// ============================================================================
export interface Staff {
  id: string;
  clinicId: string;
  userId: string;
  role: StaffRole;
  fullName: string;
  email?: string;
  specialization?: string;
  isActive: boolean;
}

export type StaffRole = 'doctor' | 'nurse' | 'receptionist' | 'admin' | 'owner';

// ============================================================================
// DOCTOR DISCOVERY (public provider listing for patient-facing search)
// ============================================================================
/** A public, patient-facing provider listing (active staff at an active clinic). */
export interface DoctorListing {
  staffId: string;
  clinicId: string;
  fullName: string;
  role: string;
  specialization?: string;
  clinicName: string;
  clinicSpecialty?: string;
  city?: string;
}

export interface DoctorSearchParams {
  city?: string;
  specialty?: string;
  name?: string;
  limit?: number;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================
export interface NotificationRequest {
  recipientId: string;
  type: NotificationType;
  channel: NotificationChannel;
  template: string;
  data: Record<string, unknown>;
}

export type NotificationType = 
  | 'appointment_reminder' 
  | 'queue_update' 
  | 'appointment_confirmation'
  | 'appointment_cancellation';

export type NotificationChannel = 'sms' | 'email' | 'whatsapp' | 'push';


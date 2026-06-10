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
  createdAt: string;
}

export interface PatientProfile extends Patient {
  medicalHistory?: string;
  allergies?: string[];
  insuranceInfo?: {
    provider?: string;
    policyNumber?: string;
  };
}

// ============================================================================
// CLINIC TYPES
// ============================================================================
export interface Clinic {
  id: string;
  name: string;
  specialty?: string;
  address?: string;
  city?: string;
  phoneNumber?: string;
  email?: string;
  settings?: ClinicSettings;
  createdAt: string;
}

export interface ClinicSettings {
  defaultSlotDuration?: number;
  maxDailyAppointments?: number;
  workingHours?: {
    start: string;
    end: string;
  };
  queueMode?: QueueMode;
  appointmentTypes?: AppointmentType[];
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


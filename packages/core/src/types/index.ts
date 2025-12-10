/**
 * Core Types - Shared type definitions
 */

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
export type QueueMode = 'fluid' | 'slotted' | null;

export type AppointmentStatus = 
  | 'scheduled' 
  | 'checked_in' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled' 
  | 'no_show';

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


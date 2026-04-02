/**
 * Database Types
 * 
 * Type definitions for database tables used by the MCP server.
 * These mirror the main app's types but are kept separate for independence.
 */

// ============================================
// CLINIC TYPES
// ============================================

export interface ClinicRow {
  id: string;
  name: string;
  name_ar: string | null;
  owner_id: string;
  practice_type: string;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  email: string | null;
  logo_url: string | null;
  settings: ClinicSettings | null;
  subscription_tier: string;
  is_active: boolean;
  queue_mode: string | null;
  grace_period_minutes: number | null;
  allow_overflow: boolean | null;
  daily_capacity_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicSettings {
  bufferTime?: number;
  workingHours?: Record<string, WorkingHoursDay>;
  allowWalkIns?: boolean;
  maxQueueSize?: number;
  requiresAppointment?: boolean;
  averageAppointmentDuration?: number;
  appointmentTypes?: AppointmentType[];
  paymentMethods?: PaymentMethods;
}

export interface WorkingHoursDay {
  open?: string;
  close?: string;
  closed?: boolean;
}

export interface AppointmentType {
  name: string;
  label: string;
  duration: number;
  price?: number;
}

export interface PaymentMethods {
  cash?: boolean;
  card?: boolean;
  online?: boolean;
  insurance?: boolean;
}

// ============================================
// APPOINTMENT TYPES
// ============================================

export interface AppointmentRow {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  staff_id: string | null;
  appointment_date: string;
  scheduled_time: string | null;
  time_slot: string | null;
  queue_position: number | null;
  status: AppointmentStatus;
  appointment_type: string | null;
  reason_for_visit: string | null;
  checked_in_at: string | null;
  actual_end_time: string | null;
  actual_duration: number | null;
  estimated_duration: number | null;
  predicted_wait_time: number | null;
  predicted_start_time: string | null;
  prediction_confidence: number | null;
  last_prediction_update: string | null;
  is_walk_in: boolean;
  is_present: boolean;
  priority_score: number | null;
  is_gap_filler: boolean | null;
  promoted_from_waitlist: boolean | null;
  late_arrival_converted: boolean | null;
  original_slot_time: string | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

// ============================================
// PATIENT TYPES
// ============================================

/**
 * Patient row (from patients table with encrypted PII).
 * Direct SELECT returns encrypted blobs; use get_patient_decrypted RPC for readable data.
 */
export interface PatientRow {
  id: string;
  user_id: string | null;
  display_name: string;
  phone_number_hash: string;
  source: 'app' | 'walk_in' | 'phone';
  is_claimed: boolean;
  is_anonymized: boolean;
  consent_sms: boolean;
  consent_data_processing: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Profile row (from profiles table - auth metadata, not PII).
 */
export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  city: string | null;
  preferred_language: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// STAFF TYPES
// ============================================

export interface StaffRow {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  specialization: string | null;
  license_number: string | null;
  working_hours: Record<string, unknown> | null;
  average_consultation_duration: number | null;
  patients_per_day_avg: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// AVAILABLE SLOT TYPES
// ============================================

export interface AvailableSlot {
  time: string;
  available: boolean;
  remainingCapacity?: number;
  bookedCount?: number;
}

export interface AvailableSlotsResponse {
  available: boolean;
  slots?: AvailableSlot[];
  mode?: "fluid" | "slotted";
}


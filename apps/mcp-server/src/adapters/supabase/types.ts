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
  operating_mode: string;
  estimation_mode: string;
  ml_enabled: boolean | null;
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
  guest_patient_id: string | null;
  staff_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string | null;
  queue_position: number | null;
  status: AppointmentStatus;
  appointment_type: string | null;
  reason_for_visit: string | null;
  checked_in_at: string | null;
  actual_end_time: string | null;
  predicted_wait_time: number | null;
  predicted_start_time: string | null;
  prediction_mode: string | null;
  is_walk_in: boolean;
  is_present: boolean;
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
  | "absent";

// ============================================
// PATIENT TYPES
// ============================================

export interface PatientProfileRow {
  id: string;
  phone_number: string;
  full_name: string;
  email: string | null;
  city: string | null;
  preferred_language: string | null;
  notification_preferences: Record<string, unknown> | null;
  no_show_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface GuestPatientRow {
  id: string;
  phone_number: string;
  full_name: string;
  claimed_by: string | null;
  claimed_at: string | null;
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


/**
 * Patient Domain Models
 * Enums and types matching the patients DB table schema.
 */

// ============================================
// ENUMS (matching DB CHECK constraints)
// ============================================

export enum PatientSource {
  APP = 'app',
  WALK_IN = 'walk_in',
  PHONE = 'phone',
}

export enum ConsentGivenBy {
  PATIENT_APP = 'patient_app',
  PATIENT_VERBAL = 'patient_verbal',
  GUARDIAN = 'guardian',
}

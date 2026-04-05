export enum GrantStatus {
  PENDING_OTP = 'pending_otp',
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

export enum ConsentMethod {
  OTP_SMS = 'otp_sms',
  OTP_EMAIL = 'otp_email',
  IN_APP_CONFIRM = 'in_app_confirm',
  OTP_VERBAL = 'otp_verbal',
}

export enum RecordType {
  APPOINTMENT_HISTORY = 'appointment_history',
  APPOINTMENT_DETAIL = 'appointment_detail',
  DOCTOR_NOTES = 'doctor_notes',
  LAB_RESULTS = 'lab_results',
  PRESCRIPTION = 'prescription',
}

export interface GrantScope {
  type: 'full_history' | 'date_range' | 'specific_appointments';
  from?: string;
  to?: string;
  appointmentIds?: string[];
}

export interface AccessGrant {
  id: string;
  patientId: string;
  granteeUserId: string;
  clinicId: string;
  appointmentId?: string;
  status: GrantStatus;
  grantedAt?: Date;
  expiresAt?: Date;
  durationSeconds?: number;
  scope: GrantScope;
  consentMethod?: ConsentMethod;
  consentRecordedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
}

export interface ActiveShare {
  id: string;
  granteeName: string;
  clinicName: string;
  status: GrantStatus;
  grantedAt?: Date;
  expiresAt?: Date;
  consentMethod?: ConsentMethod;
  scope: GrantScope;
  accessCount: number;
}

export interface ActiveGrantCheck {
  hasAccess: boolean;
  grantId?: string;
  expiresAt?: Date;
}

export interface AccessRequestResult {
  grantId: string;
  deliveryChannel: 'sms' | 'email';
  patientHasApp: boolean;
  deliveryStatus: 'pending' | 'sending' | 'sent' | 'failed';
  otpTtlSeconds: number;
}

export interface OtpValidationResult {
  success: boolean;
  grantId?: string;
  expiresAt?: Date;
  error?: string;
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

export interface SharedAppointmentSummary {
  appointmentId: string;
  date: string;
  clinicName: string;
  doctorName: string;
  appointmentType: string;
  status: string;
  hasDiagnoses: boolean;
  hasNotes: boolean;
  hasPrescriptions: boolean;
  hasLabResults: boolean;
}

export interface DiagnosisItem {
  id: string;
  diagnosisCode?: string;
  diagnosisLabel: string;
  diagnosisNotes?: string;
}

export interface PrescriptionItem {
  id: string;
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
}

export interface LabResultItem {
  id: string;
  testName: string;
  resultValue?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
}

export interface SharedAppointmentDetail extends SharedAppointmentSummary {
  reasonForVisit?: string;
  notes?: string;
  durationMinutes?: number;
  diagnoses: DiagnosisItem[];
  prescriptions: PrescriptionItem[];
  labResults: LabResultItem[];
}

export interface AccessLogEntry {
  id: string;
  accessedBy: string;
  accessedByName: string;
  clinicName: string;
  recordType: RecordType;
  action: string;
  accessedAt: Date;
}

export const DURATION_PRESETS = {
  THIS_APPOINTMENT: 3600,
  TWENTY_FOUR_HOURS: 86400,
  ONE_WEEK: 604800,
} as const;

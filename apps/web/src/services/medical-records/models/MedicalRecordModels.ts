import type { JSONContent } from '@tiptap/react';

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
  DIAGNOSIS = 'diagnosis',
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
  hasProcedureReports: boolean;
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

export interface SharedProcedureReportImage {
  id: string;
  storagePath: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  createdAt?: Date;
  signedUrl?: string;
}

export interface SharedProcedureReport {
  id: string;
  title: string;
  status: string;
  finalizedAt?: Date;
  createdAt?: Date;
  contentPlainText?: string;
  images: SharedProcedureReportImage[];
}

export interface SharedAppointmentDetail extends SharedAppointmentSummary {
  reasonForVisit?: string;
  notes?: string;
  durationMinutes?: number;
  diagnoses: DiagnosisItem[];
  prescriptions: PrescriptionItem[];
  labResults: LabResultItem[];
  procedureReports: SharedProcedureReport[];
}

export interface ConsultationNotesPayload {
  reasonForVisit: string;
  notes: string;
}

export interface ConsultationDiagnosis {
  id: string;
  diagnosisCode?: string;
  diagnosisLabel: string;
  diagnosisNotes?: string;
  isPatientVisible: boolean;
}

export interface ConsultationDiagnosisInput {
  id?: string;
  diagnosisCode?: string;
  diagnosisLabel: string;
  diagnosisNotes?: string;
  isPatientVisible: boolean;
}

export interface ConsultationPrescription {
  id: string;
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
  isPatientVisible: boolean;
}

export interface ConsultationPrescriptionInput {
  id?: string;
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
  isPatientVisible: boolean;
}

export interface MedicationCatalogEntry {
  id: string;
  clinicId: string;
  canonicalName: string;
  aliases: string[];
  usageCount: number;
  lastUsedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicationCatalogSearchInput {
  clinicId: string;
  query?: string;
  includeInactive?: boolean;
  limit?: number;
}

export interface MedicationCatalogUpdateInput {
  canonicalName?: string;
  aliases?: string[];
  isActive?: boolean;
  updatedBy: string;
}

export interface ConsultationLabResult {
  id: string;
  testName: string;
  resultValue?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  isPatientVisible: boolean;
}

export interface ConsultationLabResultInput {
  id?: string;
  testName: string;
  resultValue?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  isPatientVisible: boolean;
}

export interface ClinicPrintInfo {
  name: string;
  specialty?: string;
  address?: string;
  city?: string;
  phone?: string;
  logoUrl?: string;
}

export interface DoctorPrintInfo {
  fullName: string;
  specialization?: string;
  licenseNumber?: string;
}

export interface ConsultationPrintMetadata {
  clinic: ClinicPrintInfo;
  doctor: DoctorPrintInfo;
}

export interface ConsultationRecordBundle {
  appointmentId: string;
  patientId: string;
  revision: string;
  notes: ConsultationNotesPayload;
  diagnoses: ConsultationDiagnosis[];
  prescriptions: ConsultationPrescription[];
  labResults: ConsultationLabResult[];
  printMetadata: ConsultationPrintMetadata;
}

export type MedicalTemplateScope = 'system' | 'clinic' | 'personal';

export type MedicalTemplateType =
  | 'procedure_report'
  | 'consultation_note'
  | 'prescription_combo'
  | 'report_section';

export type RichContent = JSONContent;

export interface PrescriptionComboTemplateItem {
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
  isPatientVisible?: boolean;
}

export type MedicalTemplateContent = RichContent | PrescriptionComboTemplateItem[];

export interface MedicalTemplate {
  id: string;
  createdBy?: string;
  clinicId?: string;
  scope: MedicalTemplateScope;
  templateType: MedicalTemplateType;
  specialty?: string;
  title: string;
  titleAr?: string;
  description?: string;
  content: MedicalTemplateContent;
  tags: string[];
  usageCount: number;
  lastUsedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicalTemplateSearchInput {
  clinicId?: string;
  userId?: string;
  templateType: MedicalTemplateType;
  specialty?: string;
  query?: string;
  limit?: number;
}

export interface MedicalTemplateCreateInput {
  clinicId?: string;
  createdBy: string;
  scope: Exclude<MedicalTemplateScope, 'system'>;
  templateType: MedicalTemplateType;
  specialty?: string;
  title: string;
  titleAr?: string;
  description?: string;
  content: MedicalTemplateContent;
  tags?: string[];
}

export interface TemplateVariableContext {
  patientName?: string;
  doctorName?: string;
  clinicName?: string;
  date?: string;
  [key: string]: string | undefined;
}

export type ProcedureReportStatus = 'draft' | 'finalized';

export interface MedicalProcedureReport {
  id: string;
  appointmentId: string;
  patientId: string;
  clinicId: string;
  authoredBy: string;
  title: string;
  content: RichContent;
  contentPlainText?: string;
  templateId?: string;
  isPatientVisible: boolean;
  status: ProcedureReportStatus;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicalProcedureReportUpsertInput {
  id?: string;
  appointmentId: string;
  patientId: string;
  clinicId: string;
  authoredBy: string;
  title: string;
  content: RichContent;
  contentPlainText?: string;
  templateId?: string;
  isPatientVisible: boolean;
  status?: ProcedureReportStatus;
}

export interface MedicalReportImage {
  id: string;
  reportId: string;
  uploadedBy: string;
  clinicId: string;
  storagePath: string;
  signedUrl?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
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

export type PatientMedicalEntrySource = 'patient' | 'clinician';

export interface PatientPassportAllergy {
  id: string;
  substance: string;
  severity: 'mild' | 'moderate' | 'severe' | 'unknown';
  reaction?: string;
  notes?: string;
  recordedAt: Date;
}

export interface PatientProblem {
  id: string;
  patientId: string;
  clinicId?: string;
  problemName: string;
  icd10Code?: string;
  notes?: string;
  onsetDate?: string;
  source: PatientMedicalEntrySource;
  recordedBy?: string;
  recordedAt: Date;
  isActive: boolean;
  resolvedAt?: Date;
  resolutionNotes?: string;
}

export interface CreatePatientProblemInput {
  patientId: string;
  clinicId?: string;
  problemName: string;
  icd10Code?: string;
  notes?: string;
  onsetDate?: string;
  source: PatientMedicalEntrySource;
  recordedBy: string;
}

export interface ResolvePatientProblemInput {
  problemId: string;
  resolvedBy: string;
  resolutionNotes?: string;
}

export interface PatientCurrentMedication {
  id: string;
  patientId: string;
  clinicId?: string;
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  instructions?: string;
  startedOn?: string;
  expectedEndOn?: string;
  source: PatientMedicalEntrySource;
  recordedBy?: string;
  recordedAt: Date;
  isActive: boolean;
  stoppedAt?: Date;
  stopReason?: string;
}

export interface CreatePatientCurrentMedicationInput {
  patientId: string;
  clinicId?: string;
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  instructions?: string;
  startedOn?: string;
  expectedEndOn?: string;
  source: PatientMedicalEntrySource;
  recordedBy: string;
}

export interface StopPatientCurrentMedicationInput {
  medicationId: string;
  stoppedBy: string;
  stopReason?: string;
}

export interface PatientMedicalPassport {
  patientId: string;
  allergies: PatientPassportAllergy[];
  activeProblems: PatientProblem[];
  currentMedications: PatientCurrentMedication[];
  counts: {
    allergies: number;
    activeProblems: number;
    currentMedications: number;
  };
}

export const DURATION_PRESETS = {
  THIS_APPOINTMENT: 3600,
  TWENTY_FOUR_HOURS: 86400,
  ONE_WEEK: 604800,
} as const;

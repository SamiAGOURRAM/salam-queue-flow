import { ValidationError } from '@/services/shared/errors';
import { logger } from '@/services/shared/logging/Logger';
import { CONSULTATION_ERROR_CODES } from './constants/ConsultationErrorCodes';
import type {
  ConsultationDiagnosis,
  ConsultationDiagnosisInput,
  ConsultationLabResult,
  ConsultationLabResultInput,
  MedicationCatalogEntry,
  MedicationCatalogSearchInput,
  MedicationCatalogUpdateInput,
  ConsultationNotesPayload,
  ConsultationPrescription,
  ConsultationPrescriptionInput,
  ConsultationRecordBundle,
} from './models/MedicalRecordModels';
import { MedicalRecordWriteRepository } from './repositories/MedicalRecordWriteRepository';

interface ConsultationWriteContext {
  appointmentId: string;
  patientId: string;
  clinicId: string;
  doctorUserId: string;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeDuration(value: number | undefined): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  return Math.max(1, Math.round(value));
}

function normalizeDiagnosesInput(items: ConsultationDiagnosisInput[]): ConsultationDiagnosisInput[] {
  const normalizedItems: ConsultationDiagnosisInput[] = [];

  for (const item of items) {
    const diagnosisLabel = item.diagnosisLabel.trim();
    if (!diagnosisLabel) {
      if (item.id) {
        throw new ValidationError(CONSULTATION_ERROR_CODES.DIAGNOSIS_LABEL_REQUIRED);
      }
      continue;
    }

    normalizedItems.push({
      id: item.id,
      diagnosisCode: normalizeText(item.diagnosisCode),
      diagnosisLabel,
      diagnosisNotes: normalizeText(item.diagnosisNotes),
      isPatientVisible: item.isPatientVisible,
    });
  }

  return normalizedItems;
}

function normalizePrescriptionsInput(items: ConsultationPrescriptionInput[]): ConsultationPrescriptionInput[] {
  const normalizedItems: ConsultationPrescriptionInput[] = [];

  for (const item of items) {
    const medicationName = item.medicationName.trim();
    if (!medicationName) {
      if (item.id) {
        throw new ValidationError(CONSULTATION_ERROR_CODES.MEDICATION_NAME_REQUIRED);
      }
      continue;
    }

    normalizedItems.push({
      id: item.id,
      medicationName,
      dosage: normalizeText(item.dosage),
      route: normalizeText(item.route),
      frequency: normalizeText(item.frequency),
      durationDays: normalizeDuration(item.durationDays),
      instructions: normalizeText(item.instructions),
      isPatientVisible: item.isPatientVisible,
    });
  }

  return normalizedItems;
}

function normalizeLabResultsInput(items: ConsultationLabResultInput[]): ConsultationLabResultInput[] {
  const normalizedItems: ConsultationLabResultInput[] = [];

  for (const item of items) {
    const testName = item.testName.trim();
    if (!testName) {
      if (item.id) {
        throw new ValidationError(CONSULTATION_ERROR_CODES.TEST_NAME_REQUIRED);
      }
      continue;
    }

    normalizedItems.push({
      id: item.id,
      testName,
      resultValue: normalizeText(item.resultValue),
      unit: normalizeText(item.unit),
      referenceRange: normalizeText(item.referenceRange),
      interpretation: normalizeText(item.interpretation),
      isPatientVisible: item.isPatientVisible,
    });
  }

  return normalizedItems;
}

export class MedicalRecordWriteService {
  private repository: MedicalRecordWriteRepository;

  constructor(repository?: MedicalRecordWriteRepository) {
    this.repository = repository || new MedicalRecordWriteRepository();
  }

  async loadConsultationRecords(
    appointmentId: string,
    clinicId: string,
    doctorUserId: string
  ): Promise<ConsultationRecordBundle> {
    const [appointmentNotes, diagnoses, prescriptions, labResults, printMetadata] = await Promise.all([
      this.repository.getAppointmentNotes(appointmentId),
      this.repository.getDiagnosesByAppointment(appointmentId),
      this.repository.getPrescriptionsByAppointment(appointmentId),
      this.repository.getLabResultsByAppointment(appointmentId),
      this.repository.getPrintMetadata(clinicId, doctorUserId),
    ]);

    return {
      appointmentId,
      patientId: appointmentNotes.patientId,
      revision: appointmentNotes.revision,
      notes: appointmentNotes.notes,
      diagnoses,
      prescriptions,
      labResults,
      printMetadata,
    };
  }

  async saveNotes(
    appointmentId: string,
    payload: ConsultationNotesPayload,
    expectedRevision: string
  ): Promise<{ notes: ConsultationNotesPayload; revision: string }> {
    const result = await this.repository.updateAppointmentNotes(
      appointmentId,
      {
        reasonForVisit: payload.reasonForVisit,
        notes: payload.notes,
      },
      expectedRevision
    );
    return {
      notes: result.notes,
      revision: result.revision,
    };
  }

  async saveDiagnoses(
    context: ConsultationWriteContext,
    items: ConsultationDiagnosisInput[],
    expectedRevision: string
  ): Promise<{ diagnoses: ConsultationDiagnosis[]; revision: string }> {
    const normalizedItems = normalizeDiagnosesInput(items);
    const revision = await this.repository.claimAppointmentRevision(context.appointmentId, expectedRevision);
    const saved = await this.repository.saveDiagnosesBatch(context, normalizedItems);

    return {
      diagnoses: saved,
      revision,
    };
  }

  async savePrescriptions(
    context: ConsultationWriteContext,
    items: ConsultationPrescriptionInput[],
    expectedRevision: string
  ): Promise<{ prescriptions: ConsultationPrescription[]; revision: string }> {
    const normalizedItems = normalizePrescriptionsInput(items);
    const revision = await this.repository.claimAppointmentRevision(context.appointmentId, expectedRevision);
    const saved = await this.repository.savePrescriptionsBatch(context, normalizedItems);

    if (normalizedItems.length > 0) {
      try {
        await this.repository.upsertMedicationCatalogUsage(
          context.clinicId,
          context.doctorUserId,
          normalizedItems.map((item) => item.medicationName)
        );
      } catch (catalogError) {
        logger.warn('Failed to sync medication catalog from prescription save', {
          clinicId: context.clinicId,
          appointmentId: context.appointmentId,
          error:
            catalogError instanceof Error
              ? catalogError.message
              : 'Unknown medication catalog sync error',
        });
      }
    }

    return {
      prescriptions: saved,
      revision,
    };
  }

  async searchMedicationCatalog(input: MedicationCatalogSearchInput): Promise<MedicationCatalogEntry[]> {
    return this.repository.searchMedicationCatalog(input);
  }

  async updateMedicationCatalogEntry(
    entryId: string,
    clinicId: string,
    updates: MedicationCatalogUpdateInput
  ): Promise<MedicationCatalogEntry> {
    if (updates.canonicalName !== undefined && !updates.canonicalName.trim()) {
      throw new ValidationError(CONSULTATION_ERROR_CODES.MEDICATION_NAME_REQUIRED);
    }

    return this.repository.updateMedicationCatalogEntry(entryId, clinicId, updates);
  }

  async getMedicationCatalog(clinicId: string, limit: number = 120): Promise<string[]> {
    if (!clinicId.trim()) {
      return [];
    }

    return this.repository.getMedicationCatalog(clinicId, limit);
  }

  async saveLabResults(
    context: ConsultationWriteContext,
    items: ConsultationLabResultInput[],
    expectedRevision: string
  ): Promise<{ labResults: ConsultationLabResult[]; revision: string }> {
    const normalizedItems = normalizeLabResultsInput(items);
    const revision = await this.repository.claimAppointmentRevision(context.appointmentId, expectedRevision);
    const saved = await this.repository.saveLabResultsBatch(context, normalizedItems);

    return {
      labResults: saved,
      revision,
    };
  }
}

export const medicalRecordWriteService = new MedicalRecordWriteService();

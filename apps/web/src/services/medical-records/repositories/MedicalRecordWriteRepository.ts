import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { ConflictError, DatabaseError, NotFoundError } from '@/services/shared/errors';
import { CONSULTATION_ERROR_CODES } from '../constants/ConsultationErrorCodes';
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
  ConsultationPrintMetadata,
} from '../models/MedicalRecordModels';

type DiagnosisRow = Database['public']['Tables']['medical_record_diagnoses']['Row'];
type PrescriptionRow = Database['public']['Tables']['medical_record_prescriptions']['Row'];
type LabResultRow = Database['public']['Tables']['medical_record_lab_results']['Row'];
type MedicationCatalogRow = Database['public']['Tables']['medical_medication_catalog']['Row'];
type DiagnosisInsert = Database['public']['Tables']['medical_record_diagnoses']['Insert'];
type PrescriptionInsert = Database['public']['Tables']['medical_record_prescriptions']['Insert'];
type LabResultInsert = Database['public']['Tables']['medical_record_lab_results']['Insert'];
type MedicationCatalogInsert = Database['public']['Tables']['medical_medication_catalog']['Insert'];

interface WriteContext {
  appointmentId: string;
  patientId: string;
  clinicId: string;
  doctorUserId: string;
}

interface AppointmentNotesRow {
  id: string;
  patient_id: string;
  reason_for_visit: string | null;
  notes: string | null;
  updated_at: string | null;
}

function asOptional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toNullable(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeMedicationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function medicationNameKey(value: string): string {
  return normalizeMedicationName(value).toLocaleLowerCase();
}

function normalizeAliases(value: string[] | null | undefined, canonicalName: string): string[] {
  const canonicalKey = medicationNameKey(canonicalName);
  const deduped = new Map<string, string>();

  for (const alias of value ?? []) {
    const normalizedAlias = normalizeMedicationName(alias);
    if (!normalizedAlias) continue;

    const aliasKey = normalizedAlias.toLocaleLowerCase();
    if (aliasKey === canonicalKey) continue;

    if (!deduped.has(aliasKey)) {
      deduped.set(aliasKey, normalizedAlias);
    }
  }

  return Array.from(deduped.values());
}

function mapDiagnosis(row: DiagnosisRow): ConsultationDiagnosis {
  return {
    id: row.id,
    diagnosisCode: asOptional(row.diagnosis_code),
    diagnosisLabel: row.diagnosis_label,
    diagnosisNotes: asOptional(row.diagnosis_notes),
    isPatientVisible: row.is_patient_visible,
  };
}

function mapPrescription(row: PrescriptionRow): ConsultationPrescription {
  return {
    id: row.id,
    medicationName: row.medication_name,
    dosage: asOptional(row.dosage),
    route: asOptional(row.route),
    frequency: asOptional(row.frequency),
    durationDays: row.duration_days ?? undefined,
    instructions: asOptional(row.instructions),
    isPatientVisible: row.is_patient_visible,
  };
}

function mapLabResult(row: LabResultRow): ConsultationLabResult {
  return {
    id: row.id,
    testName: row.test_name,
    resultValue: asOptional(row.result_value),
    unit: asOptional(row.unit),
    referenceRange: asOptional(row.reference_range),
    interpretation: asOptional(row.interpretation),
    isPatientVisible: row.is_patient_visible,
  };
}

function mapMedicationCatalog(row: MedicationCatalogRow): MedicationCatalogEntry {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    canonicalName: row.canonical_name,
    aliases: normalizeAliases(row.aliases, row.canonical_name),
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class MedicalRecordWriteRepository {
  private async throwConflictIfAppointmentExists(appointmentId: string, message: string): Promise<never> {
    const { data, error } = await supabase.from('appointments').select('id').eq('id', appointmentId).maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to verify appointment state', error as unknown as Error, { appointmentId });
    }

    if (!data) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    throw new ConflictError(message, {
      appointmentId,
    });
  }

  async claimAppointmentRevision(appointmentId: string, expectedRevision: string): Promise<string> {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .eq('updated_at', expectedRevision)
      .select('updated_at')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to claim appointment revision', error as unknown as Error, {
        appointmentId,
      });
    }

    if (!data) {
      return this.throwConflictIfAppointmentExists(
        appointmentId,
        CONSULTATION_ERROR_CODES.CONFLICT_RELOAD
      );
    }

    return data.updated_at ?? new Date().toISOString();
  }

  async getAppointmentNotes(
    appointmentId: string
  ): Promise<{ patientId: string; notes: ConsultationNotesPayload; revision: string }> {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, patient_id, reason_for_visit, notes, updated_at')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to fetch appointment notes', error as unknown as Error, { appointmentId });
    }

    if (!data) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    const row = data as AppointmentNotesRow;
    return {
      patientId: row.patient_id,
      revision: row.updated_at ?? new Date(0).toISOString(),
      notes: {
        reasonForVisit: row.reason_for_visit ?? '',
        notes: row.notes ?? '',
      },
    };
  }

  async updateAppointmentNotes(
    appointmentId: string,
    notes: ConsultationNotesPayload,
    expectedRevision: string
  ): Promise<{ patientId: string; notes: ConsultationNotesPayload; revision: string }> {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        reason_for_visit: toNullable(notes.reasonForVisit),
        notes: toNullable(notes.notes),
      })
      .eq('id', appointmentId)
      .eq('updated_at', expectedRevision)
      .select('id, patient_id, reason_for_visit, notes, updated_at')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to save consultation notes', error as unknown as Error, { appointmentId });
    }

    if (!data) {
      return this.throwConflictIfAppointmentExists(
        appointmentId,
        CONSULTATION_ERROR_CODES.NOTES_CONFLICT_RELOAD
      );
    }

    const row = data as AppointmentNotesRow;
    return {
      patientId: row.patient_id,
      revision: row.updated_at ?? new Date().toISOString(),
      notes: {
        reasonForVisit: row.reason_for_visit ?? '',
        notes: row.notes ?? '',
      },
    };
  }

  async getDiagnosesByAppointment(appointmentId: string): Promise<ConsultationDiagnosis[]> {
    const { data, error } = await supabase
      .from('medical_record_diagnoses')
      .select('id, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible, created_at')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new DatabaseError('Failed to load diagnoses', error as unknown as Error, { appointmentId });
    }

    return (data as DiagnosisRow[]).map(mapDiagnosis);
  }

  async saveDiagnosesBatch(context: WriteContext, inputs: ConsultationDiagnosisInput[]): Promise<ConsultationDiagnosis[]> {
    if (inputs.length === 0) return [];

    const payload: DiagnosisInsert[] = inputs.map((input) => ({
      id: input.id,
      appointment_id: context.appointmentId,
      clinic_id: context.clinicId,
      patient_id: context.patientId,
      diagnosed_by: context.doctorUserId,
      diagnosis_code: toNullable(input.diagnosisCode),
      diagnosis_label: input.diagnosisLabel.trim(),
      diagnosis_notes: toNullable(input.diagnosisNotes),
      is_patient_visible: input.isPatientVisible,
    }));

    const { data, error } = await supabase
      .from('medical_record_diagnoses')
      .upsert(payload, { onConflict: 'id' })
      .select('id, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible');

    if (error) {
      throw new DatabaseError('Failed to save diagnoses batch', error as unknown as Error, {
        appointmentId: context.appointmentId,
        count: payload.length,
      });
    }

    return (data as DiagnosisRow[]).map(mapDiagnosis);
  }

  async createDiagnosis(context: WriteContext, input: ConsultationDiagnosisInput): Promise<ConsultationDiagnosis> {
    const { data, error } = await supabase
      .from('medical_record_diagnoses')
      .insert({
        appointment_id: context.appointmentId,
        clinic_id: context.clinicId,
        patient_id: context.patientId,
        diagnosed_by: context.doctorUserId,
        diagnosis_code: toNullable(input.diagnosisCode),
        diagnosis_label: input.diagnosisLabel.trim(),
        diagnosis_notes: toNullable(input.diagnosisNotes),
        is_patient_visible: input.isPatientVisible,
      })
      .select('id, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible')
      .single();

    if (error) {
      throw new DatabaseError('Failed to create diagnosis', error as unknown as Error, {
        appointmentId: context.appointmentId,
      });
    }

    return mapDiagnosis(data as DiagnosisRow);
  }

  async updateDiagnosis(
    diagnosisId: string,
    doctorUserId: string,
    input: ConsultationDiagnosisInput
  ): Promise<ConsultationDiagnosis> {
    const { data, error } = await supabase
      .from('medical_record_diagnoses')
      .update({
        diagnosed_by: doctorUserId,
        diagnosis_code: toNullable(input.diagnosisCode),
        diagnosis_label: input.diagnosisLabel.trim(),
        diagnosis_notes: toNullable(input.diagnosisNotes),
        is_patient_visible: input.isPatientVisible,
      })
      .eq('id', diagnosisId)
      .select('id, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to update diagnosis', error as unknown as Error, { diagnosisId });
    }

    if (!data) {
      throw new NotFoundError('Diagnosis', diagnosisId);
    }

    return mapDiagnosis(data as DiagnosisRow);
  }

  async getPrescriptionsByAppointment(appointmentId: string): Promise<ConsultationPrescription[]> {
    const { data, error } = await supabase
      .from('medical_record_prescriptions')
      .select('id, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible, created_at')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new DatabaseError('Failed to load prescriptions', error as unknown as Error, { appointmentId });
    }

    return (data as PrescriptionRow[]).map(mapPrescription);
  }

  async searchMedicationCatalog(input: MedicationCatalogSearchInput): Promise<MedicationCatalogEntry[]> {
    const cappedLimit = Math.min(Math.max(Math.round(input.limit ?? 120), 1), 300);

    const { data, error } = await supabase
      .from('medical_medication_catalog')
      .select('*')
      .eq('clinic_id', input.clinicId)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('canonical_name', { ascending: true })
      .limit(input.query?.trim() ? Math.max(cappedLimit * 4, 160) : cappedLimit);

    if (error) {
      throw new DatabaseError('Failed to search medication catalog', error as unknown as Error, {
        clinicId: input.clinicId,
      });
    }

    const queryText = input.query?.trim().toLocaleLowerCase() ?? '';
    const baseRows = ((data as MedicationCatalogRow[] | null) ?? []).filter((row) =>
      input.includeInactive ? true : row.is_active
    );

    const filteredRows = queryText
      ? baseRows.filter((row) => {
          const aliases = Array.isArray(row.aliases) ? row.aliases : [];
          const haystack = [row.canonical_name, ...aliases].join(' ').toLocaleLowerCase();
          return haystack.includes(queryText);
        })
      : baseRows;

    return filteredRows.slice(0, cappedLimit).map(mapMedicationCatalog);
  }

  async upsertMedicationCatalogUsage(clinicId: string, userId: string, names: string[]): Promise<void> {
    const normalizedEntries = new Map<string, { canonicalName: string; count: number }>();

    for (const value of names) {
      const canonicalName = normalizeMedicationName(value);
      if (!canonicalName) continue;

      const key = medicationNameKey(canonicalName);
      const existing = normalizedEntries.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        normalizedEntries.set(key, { canonicalName, count: 1 });
      }
    }

    if (normalizedEntries.size === 0) {
      return;
    }

    const keys = Array.from(normalizedEntries.keys());

    const { data: existingData, error: existingError } = await supabase
      .from('medical_medication_catalog')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('name_key', keys);

    if (existingError) {
      throw new DatabaseError('Failed to load existing medication catalog rows', existingError as unknown as Error, {
        clinicId,
      });
    }

    const existingRows = new Map(
      (((existingData as MedicationCatalogRow[] | null) ?? []).map((row) => [row.name_key, row]))
    );

    const nowIso = new Date().toISOString();
    const payload: MedicationCatalogInsert[] = keys.map((key) => {
      const incoming = normalizedEntries.get(key)!;
      const existing = existingRows.get(key);

      if (existing) {
        return {
          id: existing.id,
          clinic_id: clinicId,
          canonical_name: incoming.canonicalName,
          name_key: key,
          aliases: normalizeAliases(existing.aliases, incoming.canonicalName),
          usage_count: (existing.usage_count ?? 0) + incoming.count,
          last_used_at: nowIso,
          is_active: true,
          created_by: existing.created_by,
          updated_by: userId,
          created_at: existing.created_at,
          updated_at: nowIso,
        };
      }

      return {
        clinic_id: clinicId,
        canonical_name: incoming.canonicalName,
        name_key: key,
        aliases: [],
        usage_count: incoming.count,
        last_used_at: nowIso,
        is_active: true,
        created_by: userId,
        updated_by: userId,
        created_at: nowIso,
        updated_at: nowIso,
      };
    });

    const { error: upsertError } = await supabase
      .from('medical_medication_catalog')
      .upsert(payload, { onConflict: 'clinic_id,name_key' });

    if (upsertError) {
      throw new DatabaseError('Failed to upsert medication catalog usage', upsertError as unknown as Error, {
        clinicId,
      });
    }
  }

  async updateMedicationCatalogEntry(
    entryId: string,
    clinicId: string,
    updates: MedicationCatalogUpdateInput
  ): Promise<MedicationCatalogEntry> {
    const { data: currentData, error: currentError } = await supabase
      .from('medical_medication_catalog')
      .select('*')
      .eq('id', entryId)
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (currentError) {
      throw new DatabaseError('Failed to load medication catalog entry before update', currentError as unknown as Error, {
        entryId,
        clinicId,
      });
    }

    if (!currentData) {
      throw new NotFoundError('Medication catalog entry', entryId);
    }

    const current = currentData as MedicationCatalogRow;
    const nextCanonicalName =
      updates.canonicalName !== undefined
        ? normalizeMedicationName(updates.canonicalName)
        : current.canonical_name;

    const payload: Database['public']['Tables']['medical_medication_catalog']['Update'] = {
      updated_by: updates.updatedBy,
    };

    if (updates.canonicalName !== undefined) {
      payload.canonical_name = nextCanonicalName;
      payload.name_key = medicationNameKey(nextCanonicalName);
    }

    if (updates.aliases !== undefined) {
      payload.aliases = normalizeAliases(updates.aliases, nextCanonicalName);
    }

    if (updates.isActive !== undefined) {
      payload.is_active = updates.isActive;
    }

    const { data, error } = await supabase
      .from('medical_medication_catalog')
      .update(payload)
      .eq('id', entryId)
      .eq('clinic_id', clinicId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to update medication catalog entry', error as unknown as Error, {
        entryId,
        clinicId,
      });
    }

    if (!data) {
      throw new NotFoundError('Medication catalog entry', entryId);
    }

    return mapMedicationCatalog(data as MedicationCatalogRow);
  }

  async getMedicationCatalog(clinicId: string, limit: number = 120): Promise<string[]> {
    const cappedLimit = Math.min(Math.max(Math.round(limit), 1), 300);
    const catalogEntries = await this.searchMedicationCatalog({
      clinicId,
      limit: cappedLimit,
      includeInactive: false,
    });

    const deduped = new Map<string, string>();
    for (const entry of catalogEntries) {
      const names = [entry.canonicalName, ...entry.aliases];
      for (const name of names) {
        const normalized = normalizeMedicationName(name);
        if (!normalized) continue;

        const key = normalized.toLocaleLowerCase();
        if (!deduped.has(key)) {
          deduped.set(key, normalized);
        }

        if (deduped.size >= cappedLimit) {
          return Array.from(deduped.values());
        }
      }
    }

    return Array.from(deduped.values());
  }

  async savePrescriptionsBatch(
    context: WriteContext,
    inputs: ConsultationPrescriptionInput[]
  ): Promise<ConsultationPrescription[]> {
    if (inputs.length === 0) return [];

    const payload: PrescriptionInsert[] = inputs.map((input) => ({
      id: input.id,
      appointment_id: context.appointmentId,
      clinic_id: context.clinicId,
      patient_id: context.patientId,
      prescribed_by: context.doctorUserId,
      medication_name: input.medicationName.trim(),
      dosage: toNullable(input.dosage),
      route: toNullable(input.route),
      frequency: toNullable(input.frequency),
      duration_days:
        typeof input.durationDays === 'number' && Number.isFinite(input.durationDays)
          ? Math.max(1, Math.round(input.durationDays))
          : null,
      instructions: toNullable(input.instructions),
      is_patient_visible: input.isPatientVisible,
    }));

    const { data, error } = await supabase
      .from('medical_record_prescriptions')
      .upsert(payload, { onConflict: 'id' })
      .select('id, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible');

    if (error) {
      throw new DatabaseError('Failed to save prescriptions batch', error as unknown as Error, {
        appointmentId: context.appointmentId,
        count: payload.length,
      });
    }

    return (data as PrescriptionRow[]).map(mapPrescription);
  }

  async createPrescription(context: WriteContext, input: ConsultationPrescriptionInput): Promise<ConsultationPrescription> {
    const { data, error } = await supabase
      .from('medical_record_prescriptions')
      .insert({
        appointment_id: context.appointmentId,
        clinic_id: context.clinicId,
        patient_id: context.patientId,
        prescribed_by: context.doctorUserId,
        medication_name: input.medicationName.trim(),
        dosage: toNullable(input.dosage),
        route: toNullable(input.route),
        frequency: toNullable(input.frequency),
        duration_days:
          typeof input.durationDays === 'number' && Number.isFinite(input.durationDays)
            ? Math.max(1, Math.round(input.durationDays))
            : null,
        instructions: toNullable(input.instructions),
        is_patient_visible: input.isPatientVisible,
      })
      .select('id, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible')
      .single();

    if (error) {
      throw new DatabaseError('Failed to create prescription', error as unknown as Error, {
        appointmentId: context.appointmentId,
      });
    }

    return mapPrescription(data as PrescriptionRow);
  }

  async updatePrescription(
    prescriptionId: string,
    doctorUserId: string,
    input: ConsultationPrescriptionInput
  ): Promise<ConsultationPrescription> {
    const { data, error } = await supabase
      .from('medical_record_prescriptions')
      .update({
        prescribed_by: doctorUserId,
        medication_name: input.medicationName.trim(),
        dosage: toNullable(input.dosage),
        route: toNullable(input.route),
        frequency: toNullable(input.frequency),
        duration_days:
          typeof input.durationDays === 'number' && Number.isFinite(input.durationDays)
            ? Math.max(1, Math.round(input.durationDays))
            : null,
        instructions: toNullable(input.instructions),
        is_patient_visible: input.isPatientVisible,
      })
      .eq('id', prescriptionId)
      .select('id, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to update prescription', error as unknown as Error, { prescriptionId });
    }

    if (!data) {
      throw new NotFoundError('Prescription', prescriptionId);
    }

    return mapPrescription(data as PrescriptionRow);
  }

  async getLabResultsByAppointment(appointmentId: string): Promise<ConsultationLabResult[]> {
    const { data, error } = await supabase
      .from('medical_record_lab_results')
      .select('id, test_name, result_value, unit, reference_range, interpretation, is_patient_visible, created_at')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new DatabaseError('Failed to load lab results', error as unknown as Error, { appointmentId });
    }

    return (data as LabResultRow[]).map(mapLabResult);
  }

  async saveLabResultsBatch(context: WriteContext, inputs: ConsultationLabResultInput[]): Promise<ConsultationLabResult[]> {
    if (inputs.length === 0) return [];

    const payload: LabResultInsert[] = inputs.map((input) => ({
      id: input.id,
      appointment_id: context.appointmentId,
      clinic_id: context.clinicId,
      patient_id: context.patientId,
      recorded_by: context.doctorUserId,
      test_name: input.testName.trim(),
      result_value: toNullable(input.resultValue),
      unit: toNullable(input.unit),
      reference_range: toNullable(input.referenceRange),
      interpretation: toNullable(input.interpretation),
      is_patient_visible: input.isPatientVisible,
    }));

    const { data, error } = await supabase
      .from('medical_record_lab_results')
      .upsert(payload, { onConflict: 'id' })
      .select('id, test_name, result_value, unit, reference_range, interpretation, is_patient_visible');

    if (error) {
      throw new DatabaseError('Failed to save lab results batch', error as unknown as Error, {
        appointmentId: context.appointmentId,
        count: payload.length,
      });
    }

    return (data as LabResultRow[]).map(mapLabResult);
  }

  async createLabResult(context: WriteContext, input: ConsultationLabResultInput): Promise<ConsultationLabResult> {
    const { data, error } = await supabase
      .from('medical_record_lab_results')
      .insert({
        appointment_id: context.appointmentId,
        clinic_id: context.clinicId,
        patient_id: context.patientId,
        recorded_by: context.doctorUserId,
        test_name: input.testName.trim(),
        result_value: toNullable(input.resultValue),
        unit: toNullable(input.unit),
        reference_range: toNullable(input.referenceRange),
        interpretation: toNullable(input.interpretation),
        is_patient_visible: input.isPatientVisible,
      })
      .select('id, test_name, result_value, unit, reference_range, interpretation, is_patient_visible')
      .single();

    if (error) {
      throw new DatabaseError('Failed to create lab result', error as unknown as Error, {
        appointmentId: context.appointmentId,
      });
    }

    return mapLabResult(data as LabResultRow);
  }

  async updateLabResult(
    labResultId: string,
    doctorUserId: string,
    input: ConsultationLabResultInput
  ): Promise<ConsultationLabResult> {
    const { data, error } = await supabase
      .from('medical_record_lab_results')
      .update({
        recorded_by: doctorUserId,
        test_name: input.testName.trim(),
        result_value: toNullable(input.resultValue),
        unit: toNullable(input.unit),
        reference_range: toNullable(input.referenceRange),
        interpretation: toNullable(input.interpretation),
        is_patient_visible: input.isPatientVisible,
      })
      .eq('id', labResultId)
      .select('id, test_name, result_value, unit, reference_range, interpretation, is_patient_visible')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to update lab result', error as unknown as Error, { labResultId });
    }

    if (!data) {
      throw new NotFoundError('Lab result', labResultId);
    }

    return mapLabResult(data as LabResultRow);
  }

  async getPrintMetadata(clinicId: string, doctorUserId: string): Promise<ConsultationPrintMetadata> {
    const [clinicRes, profileRes, clinicStaffRes] = await Promise.all([
      supabase
        .from('clinics')
        .select('name, specialty, address, city, phone, logo_url')
        .eq('id', clinicId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', doctorUserId)
        .maybeSingle(),
      supabase
        .from('clinic_staff')
        .select('specialization, license_number')
        .eq('clinic_id', clinicId)
        .eq('user_id', doctorUserId)
        .maybeSingle(),
    ]);

    if (clinicRes.error) {
      throw new DatabaseError('Failed to load clinic metadata for print', clinicRes.error as unknown as Error, {
        clinicId,
      });
    }

    if (profileRes.error) {
      throw new DatabaseError('Failed to load doctor profile for print', profileRes.error as unknown as Error, {
        doctorUserId,
      });
    }

    if (clinicStaffRes.error) {
      throw new DatabaseError('Failed to load clinic staff metadata for print', clinicStaffRes.error as unknown as Error, {
        clinicId,
        doctorUserId,
      });
    }

    if (!clinicRes.data) {
      throw new NotFoundError('Clinic', clinicId);
    }

    return {
      clinic: {
        name: clinicRes.data.name,
        specialty: asOptional(clinicRes.data.specialty),
        address: asOptional(clinicRes.data.address),
        city: asOptional(clinicRes.data.city),
        phone: asOptional(clinicRes.data.phone),
        logoUrl: asOptional(clinicRes.data.logo_url),
      },
      doctor: {
        fullName: profileRes.data?.full_name ?? 'Doctor',
        specialization: asOptional(clinicStaffRes.data?.specialization),
        licenseNumber: asOptional(clinicStaffRes.data?.license_number),
      },
    };
  }
}

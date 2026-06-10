import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { DatabaseError, NotFoundError } from '@/services/shared/errors';
import type {
  CreatePatientCurrentMedicationInput,
  CreatePatientProblemInput,
  PatientCurrentMedication,
  PatientMedicalPassport,
  PatientPassportAllergy,
  PatientProblem,
  ResolvePatientProblemInput,
  StopPatientCurrentMedicationInput,
} from './models/MedicalRecordModels';

type ProblemRow = Database['public']['Tables']['patient_problem_list']['Row'];
type MedicationRow = Database['public']['Tables']['patient_current_medications']['Row'];

type PassportRpcResult = {
  patientId?: string;
  allergies?: unknown[];
  activeProblems?: unknown[];
  currentMedications?: unknown[];
  counts?: {
    allergies?: number;
    activeProblems?: number;
    currentMedications?: number;
  };
};

function asOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toNullable(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDateString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function mapProblem(row: ProblemRow): PatientProblem {
  return {
    id: row.id,
    patientId: row.patient_id,
    clinicId: row.clinic_id ?? undefined,
    problemName: row.problem_name,
    icd10Code: asOptionalText(row.icd10_code),
    notes: asOptionalText(row.notes),
    onsetDate: row.onset_date ?? undefined,
    source: row.source,
    recordedBy: row.recorded_by ?? undefined,
    recordedAt: new Date(row.recorded_at),
    isActive: row.is_active,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    resolutionNotes: asOptionalText(row.resolution_notes),
  };
}

function mapMedication(row: MedicationRow): PatientCurrentMedication {
  return {
    id: row.id,
    patientId: row.patient_id,
    clinicId: row.clinic_id ?? undefined,
    medicationName: row.medication_name,
    dosage: asOptionalText(row.dosage),
    route: asOptionalText(row.route),
    frequency: asOptionalText(row.frequency),
    instructions: asOptionalText(row.instructions),
    startedOn: row.started_on ?? undefined,
    expectedEndOn: row.expected_end_on ?? undefined,
    source: row.source,
    recordedBy: row.recorded_by ?? undefined,
    recordedAt: new Date(row.recorded_at),
    isActive: row.is_active,
    stoppedAt: row.stopped_at ? new Date(row.stopped_at) : undefined,
    stopReason: asOptionalText(row.stop_reason),
  };
}

function mapPassportAllergy(value: unknown): PatientPassportAllergy {
  const row = asObject(value);

  const severityRaw = asString(row.severity) ?? 'unknown';
  const severity =
    severityRaw === 'severe' || severityRaw === 'moderate' || severityRaw === 'mild'
      ? severityRaw
      : 'unknown';

  return {
    id: asString(row.id) ?? '',
    substance: asString(row.substance) ?? 'Unknown allergy',
    severity,
    reaction: asString(row.reaction),
    notes: asString(row.notes),
    recordedAt: asDate(row.recordedAt) ?? new Date(),
  };
}

function mapPassportProblem(value: unknown, patientId: string): PatientProblem {
  const row = asObject(value);

  return {
    id: asString(row.id) ?? '',
    patientId,
    clinicId: undefined,
    problemName: asString(row.problemName) ?? 'Unknown problem',
    icd10Code: asString(row.icd10Code),
    notes: asString(row.notes),
    onsetDate: asString(row.onsetDate),
    source: (asString(row.source) === 'patient' ? 'patient' : 'clinician'),
    recordedBy: undefined,
    recordedAt: asDate(row.recordedAt) ?? new Date(),
    isActive: true,
    resolvedAt: undefined,
    resolutionNotes: undefined,
  };
}

function mapPassportMedication(value: unknown, patientId: string): PatientCurrentMedication {
  const row = asObject(value);

  return {
    id: asString(row.id) ?? '',
    patientId,
    clinicId: undefined,
    medicationName: asString(row.medicationName) ?? 'Unknown medication',
    dosage: asString(row.dosage),
    route: asString(row.route),
    frequency: asString(row.frequency),
    instructions: asString(row.instructions),
    startedOn: asString(row.startedOn),
    expectedEndOn: asString(row.expectedEndOn),
    source: (asString(row.source) === 'patient' ? 'patient' : 'clinician'),
    recordedBy: undefined,
    recordedAt: asDate(row.recordedAt) ?? new Date(),
    isActive: true,
    stoppedAt: undefined,
    stopReason: undefined,
  };
}

export class PatientMedicalPassportService {
  async getMedicalPassport(patientId: string): Promise<PatientMedicalPassport> {
    const { data, error } = await supabase.rpc('get_patient_medical_passport', {
      p_patient_id: patientId,
    });

    if (error) {
      throw new DatabaseError('Failed to load patient medical passport', error as unknown as Error, {
        patientId,
      });
    }

    const payload = (data as PassportRpcResult | null) ?? {};
    const resolvedPatientId = payload.patientId ?? patientId;
    const allergies = Array.isArray(payload.allergies)
      ? payload.allergies.map(mapPassportAllergy)
      : [];
    const activeProblems = Array.isArray(payload.activeProblems)
      ? payload.activeProblems.map((entry) => mapPassportProblem(entry, resolvedPatientId))
      : [];
    const currentMedications = Array.isArray(payload.currentMedications)
      ? payload.currentMedications.map((entry) => mapPassportMedication(entry, resolvedPatientId))
      : [];

    return {
      patientId: resolvedPatientId,
      allergies,
      activeProblems,
      currentMedications,
      counts: {
        allergies: asNumber(payload.counts?.allergies) ?? allergies.length,
        activeProblems: asNumber(payload.counts?.activeProblems) ?? activeProblems.length,
        currentMedications: asNumber(payload.counts?.currentMedications) ?? currentMedications.length,
      },
    };
  }

  async listActiveProblems(patientId: string): Promise<PatientProblem[]> {
    const { data, error } = await supabase
      .from('patient_problem_list')
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .order('recorded_at', { ascending: false });

    if (error) {
      throw new DatabaseError('Failed to load active problem list', error as unknown as Error, {
        patientId,
      });
    }

    return ((data as ProblemRow[] | null) ?? []).map(mapProblem);
  }

  async addProblem(input: CreatePatientProblemInput): Promise<PatientProblem> {
    const problemName = input.problemName.trim();
    if (!problemName) {
      throw new Error('Problem name is required');
    }

    const { data, error } = await supabase
      .from('patient_problem_list')
      .insert({
        patient_id: input.patientId,
        clinic_id: input.clinicId ?? null,
        problem_name: problemName,
        icd10_code: toNullable(input.icd10Code),
        notes: toNullable(input.notes),
        onset_date: normalizeDateString(input.onsetDate) ?? null,
        source: input.source,
        recorded_by: input.recordedBy,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to add patient problem', error as unknown as Error, {
        patientId: input.patientId,
      });
    }

    if (!data) {
      throw new NotFoundError('Patient problem', input.patientId);
    }

    return mapProblem(data as ProblemRow);
  }

  async resolveProblem(input: ResolvePatientProblemInput): Promise<PatientProblem> {
    const { data, error } = await supabase
      .from('patient_problem_list')
      .update({
        is_active: false,
        resolved_at: new Date().toISOString(),
        resolved_by: input.resolvedBy,
        resolution_notes: toNullable(input.resolutionNotes),
      })
      .eq('id', input.problemId)
      .eq('is_active', true)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to resolve patient problem', error as unknown as Error, {
        problemId: input.problemId,
      });
    }

    if (!data) {
      throw new NotFoundError('Patient problem', input.problemId);
    }

    return mapProblem(data as ProblemRow);
  }

  async listCurrentMedications(patientId: string): Promise<PatientCurrentMedication[]> {
    const { data, error } = await supabase
      .from('patient_current_medications')
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .order('recorded_at', { ascending: false });

    if (error) {
      throw new DatabaseError('Failed to load current medications', error as unknown as Error, {
        patientId,
      });
    }

    return ((data as MedicationRow[] | null) ?? []).map(mapMedication);
  }

  async addCurrentMedication(input: CreatePatientCurrentMedicationInput): Promise<PatientCurrentMedication> {
    const medicationName = input.medicationName.trim();
    if (!medicationName) {
      throw new Error('Medication name is required');
    }

    const { data, error } = await supabase
      .from('patient_current_medications')
      .insert({
        patient_id: input.patientId,
        clinic_id: input.clinicId ?? null,
        medication_name: medicationName,
        dosage: toNullable(input.dosage),
        route: toNullable(input.route),
        frequency: toNullable(input.frequency),
        instructions: toNullable(input.instructions),
        started_on: normalizeDateString(input.startedOn) ?? null,
        expected_end_on: normalizeDateString(input.expectedEndOn) ?? null,
        source: input.source,
        recorded_by: input.recordedBy,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to add current medication', error as unknown as Error, {
        patientId: input.patientId,
      });
    }

    if (!data) {
      throw new NotFoundError('Current medication', input.patientId);
    }

    return mapMedication(data as MedicationRow);
  }

  async stopCurrentMedication(input: StopPatientCurrentMedicationInput): Promise<PatientCurrentMedication> {
    const { data, error } = await supabase
      .from('patient_current_medications')
      .update({
        is_active: false,
        stopped_at: new Date().toISOString(),
        stopped_by: input.stoppedBy,
        stop_reason: toNullable(input.stopReason),
      })
      .eq('id', input.medicationId)
      .eq('is_active', true)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to stop current medication', error as unknown as Error, {
        medicationId: input.medicationId,
      });
    }

    if (!data) {
      throw new NotFoundError('Current medication', input.medicationId);
    }

    return mapMedication(data as MedicationRow);
  }
}

export const patientMedicalPassportService = new PatientMedicalPassportService();

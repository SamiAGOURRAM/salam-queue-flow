import { supabase } from '@/integrations/supabase/client';
import { DatabaseError, NotFoundError } from '@/services/shared/errors';

export type PatientAllergySeverity = 'mild' | 'moderate' | 'severe' | 'unknown';
export type PatientAllergySource = 'patient' | 'clinician';

export interface PatientAllergy {
  id: string;
  patientId: string;
  substance: string;
  severity: PatientAllergySeverity;
  reaction?: string;
  notes?: string;
  source: PatientAllergySource;
  recordedBy?: string;
  recordedAt: Date;
  isActive: boolean;
  deactivatedAt?: Date;
  deactivationReason?: string;
}

export interface CreatePatientAllergyInput {
  patientId: string;
  substance: string;
  severity?: PatientAllergySeverity;
  reaction?: string;
  notes?: string;
  source: PatientAllergySource;
  recordedBy: string;
}

export interface DeactivateAllergyInput {
  allergyId: string;
  userId: string;
  reason?: string;
}

interface PatientAllergyRow {
  id: string;
  patient_id: string;
  substance: string;
  severity: PatientAllergySeverity;
  reaction: string | null;
  notes: string | null;
  source: PatientAllergySource;
  recorded_by: string | null;
  recorded_at: string;
  is_active: boolean;
  deactivated_at: string | null;
  deactivation_reason: string | null;
}

const ALLERGY_SELECT =
  'id, patient_id, substance, severity, reaction, notes, source, recorded_by, recorded_at, is_active, deactivated_at, deactivation_reason';

function optional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapAllergy(row: PatientAllergyRow): PatientAllergy {
  return {
    id: row.id,
    patientId: row.patient_id,
    substance: row.substance,
    severity: row.severity,
    reaction: optional(row.reaction),
    notes: optional(row.notes),
    source: row.source,
    recordedBy: optional(row.recorded_by),
    recordedAt: new Date(row.recorded_at),
    isActive: row.is_active,
    deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at) : undefined,
    deactivationReason: optional(row.deactivation_reason),
  };
}

export class PatientAllergyService {
  async listActive(patientId: string): Promise<PatientAllergy[]> {
    const { data, error } = await supabase
      .from('patient_allergies' as never)
      .select(ALLERGY_SELECT)
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .order('severity', { ascending: false })
      .order('recorded_at', { ascending: false });

    if (error) {
      throw new DatabaseError('Failed to load patient allergies', error as unknown as Error, { patientId });
    }

    return ((data as unknown as PatientAllergyRow[]) ?? []).map(mapAllergy);
  }

  async listAll(patientId: string): Promise<PatientAllergy[]> {
    const { data, error } = await supabase
      .from('patient_allergies' as never)
      .select(ALLERGY_SELECT)
      .eq('patient_id', patientId)
      .order('is_active', { ascending: false })
      .order('recorded_at', { ascending: false });

    if (error) {
      throw new DatabaseError('Failed to load patient allergy history', error as unknown as Error, { patientId });
    }

    return ((data as unknown as PatientAllergyRow[]) ?? []).map(mapAllergy);
  }

  async create(input: CreatePatientAllergyInput): Promise<PatientAllergy> {
    const substance = input.substance.trim();
    if (!substance) {
      throw new Error('Allergy substance is required');
    }

    const payload = {
      patient_id: input.patientId,
      substance,
      severity: input.severity ?? 'unknown',
      reaction: nullable(input.reaction),
      notes: nullable(input.notes),
      source: input.source,
      recorded_by: input.recordedBy,
    };

    const { data, error } = await supabase
      .from('patient_allergies' as never)
      .insert(payload as never)
      .select(ALLERGY_SELECT)
      .single();

    if (error) {
      throw new DatabaseError('Failed to record allergy', error as unknown as Error, {
        patientId: input.patientId,
        substance,
      });
    }

    return mapAllergy(data as unknown as PatientAllergyRow);
  }

  async deactivate(input: DeactivateAllergyInput): Promise<PatientAllergy> {
    const { data, error } = await supabase
      .from('patient_allergies' as never)
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: input.userId,
        deactivation_reason: nullable(input.reason),
      } as never)
      .eq('id', input.allergyId)
      .select(ALLERGY_SELECT)
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to deactivate allergy', error as unknown as Error, {
        allergyId: input.allergyId,
      });
    }

    if (!data) {
      throw new NotFoundError('PatientAllergy', input.allergyId);
    }

    return mapAllergy(data as unknown as PatientAllergyRow);
  }
}

export const patientAllergyService = new PatientAllergyService();

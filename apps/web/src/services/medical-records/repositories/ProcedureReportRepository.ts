import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { DatabaseError, NotFoundError } from '@/services/shared/errors';
import type {
  MedicalProcedureReport,
  MedicalProcedureReportUpsertInput,
  ProcedureReportStatus,
  RichContent,
} from '../models/MedicalRecordModels';

type ProcedureReportRow = Database['public']['Tables']['medical_procedure_reports']['Row'];
type ProcedureReportInsert = Database['public']['Tables']['medical_procedure_reports']['Insert'];
type ProcedureReportUpdate = Database['public']['Tables']['medical_procedure_reports']['Update'];

function asDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toRichContent(content: ProcedureReportRow['content']): RichContent {
  if (content && typeof content === 'object' && !Array.isArray(content) && typeof content.type === 'string') {
    return content as RichContent;
  }

  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  } satisfies RichContent;
}

function mapProcedureReport(row: ProcedureReportRow): MedicalProcedureReport {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    patientId: row.patient_id,
    clinicId: row.clinic_id,
    authoredBy: row.authored_by,
    title: row.title,
    content: toRichContent(row.content),
    contentPlainText: row.content_plain_text ?? undefined,
    templateId: row.template_id ?? undefined,
    isPatientVisible: row.is_patient_visible,
    status: row.status as ProcedureReportStatus,
    finalizedAt: asDate(row.finalized_at),
    createdAt: asDate(row.created_at) ?? new Date(0),
    updatedAt: asDate(row.updated_at) ?? new Date(0),
  };
}

export class ProcedureReportRepository {
  async getLatestByAppointment(appointmentId: string): Promise<MedicalProcedureReport | null> {
    const { data, error } = await supabase
      .from('medical_procedure_reports')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new DatabaseError('Failed to load procedure report', error as unknown as Error, {
        appointmentId,
      });
    }

    if (!data || data.length === 0) {
      return null;
    }

    return mapProcedureReport(data[0] as ProcedureReportRow);
  }

  async upsertReport(input: MedicalProcedureReportUpsertInput): Promise<MedicalProcedureReport> {
    if (input.id) {
      const payload: ProcedureReportUpdate = {
        title: input.title.trim(),
        content: input.content as ProcedureReportUpdate['content'],
        content_plain_text: input.contentPlainText?.trim() || null,
        template_id: input.templateId ?? null,
        is_patient_visible: input.isPatientVisible,
        status: input.status ?? 'draft',
        finalized_at: input.status === 'finalized' ? new Date().toISOString() : null,
      };

      const { data, error } = await supabase
        .from('medical_procedure_reports')
        .update(payload)
        .eq('id', input.id)
        .select('*')
        .maybeSingle();

      if (error) {
        throw new DatabaseError('Failed to update procedure report', error as unknown as Error, {
          reportId: input.id,
        });
      }

      if (!data) {
        throw new NotFoundError('Procedure report', input.id);
      }

      return mapProcedureReport(data as ProcedureReportRow);
    }

    const payload: ProcedureReportInsert = {
      appointment_id: input.appointmentId,
      patient_id: input.patientId,
      clinic_id: input.clinicId,
      authored_by: input.authoredBy,
      title: input.title.trim(),
      content: input.content as ProcedureReportInsert['content'],
      content_plain_text: input.contentPlainText?.trim() || null,
      template_id: input.templateId ?? null,
      is_patient_visible: input.isPatientVisible,
      status: input.status ?? 'draft',
      finalized_at: input.status === 'finalized' ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase.from('medical_procedure_reports').insert(payload).select('*').single();

    if (error) {
      throw new DatabaseError('Failed to create procedure report', error as unknown as Error, {
        appointmentId: input.appointmentId,
      });
    }

    return mapProcedureReport(data as ProcedureReportRow);
  }

  async finalizeReport(reportId: string): Promise<MedicalProcedureReport> {
    const { data, error } = await supabase
      .from('medical_procedure_reports')
      .update({
        status: 'finalized',
        finalized_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to finalize procedure report', error as unknown as Error, { reportId });
    }

    if (!data) {
      throw new NotFoundError('Procedure report', reportId);
    }

    return mapProcedureReport(data as ProcedureReportRow);
  }
}

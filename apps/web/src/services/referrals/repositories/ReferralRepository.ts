import { supabase } from '@/integrations/supabase/client';
import type { CreateReferralInput, Referral, ReferralResponseInput } from '../models/ReferralModels';

function mapRawReferral(raw: Record<string, unknown>): Referral {
  return {
    id: raw.id as string,
    patientId: raw.patientId as string,
    clinicId: raw.clinicId as string,
    sourceStaffId: raw.sourceStaffId as string,
    sourceDoctorName: raw.sourceDoctorName as string,
    targetDoctorName: raw.targetDoctorName as string,
    targetSpecialty: (raw.targetSpecialty as string) ?? null,
    targetClinicId: (raw.targetClinicId as string) ?? null,
    targetClinicName: (raw.targetClinicName as string) ?? null,
    reason: raw.reason as string,
    notes: (raw.notes as string) ?? null,
    status: raw.status as Referral['status'],
    linkedAppointmentId: (raw.linkedAppointmentId as string) ?? null,
    responseNotes: (raw.responseNotes as string) ?? null,
    respondedAt: (raw.respondedAt as string) ?? null,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
}

export class ReferralRepository {
  async create(input: CreateReferralInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_patient_referral', {
      p_patient_id: input.patientId,
      p_clinic_id: input.clinicId,
      p_source_staff_id: input.sourceStaffId,
      p_target_doctor_name: input.targetDoctorName,
      p_reason: input.reason,
      p_target_specialty: input.targetSpecialty ?? null,
      p_target_clinic_id: input.targetClinicId ?? null,
      p_target_clinic_name: input.targetClinicName ?? null,
      p_notes: input.notes ?? null,
      p_linked_appointment_id: input.linkedAppointmentId ?? null,
    });

    if (error) throw error;
    return data as string;
  }

  async respond(input: ReferralResponseInput): Promise<boolean> {
    const { data, error } = await supabase.rpc('respond_to_referral', {
      p_referral_id: input.referralId,
      p_new_status: input.newStatus,
      p_response_notes: input.responseNotes ?? null,
    });

    if (error) throw error;
    return data as boolean;
  }

  async cancel(referralId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('cancel_referral', {
      p_referral_id: referralId,
    });

    if (error) throw error;
    return data as boolean;
  }

  async getByPatient(patientId: string, clinicId: string): Promise<Referral[]> {
    const { data, error } = await supabase.rpc('get_patient_referrals', {
      p_patient_id: patientId,
      p_clinic_id: clinicId,
    });

    if (error) throw error;
    return ((data as unknown as Record<string, unknown>[]) ?? []).map(mapRawReferral);
  }
}

export const referralRepository = new ReferralRepository();

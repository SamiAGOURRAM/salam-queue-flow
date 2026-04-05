import { supabase } from '@/integrations/supabase/client';
import { DatabaseError, ExternalServiceError, RateLimitError, ValidationError } from '@/services/shared/errors';
import { logger } from '@/services/shared/logging/Logger';
import type {
  AccessLogEntry,
  ActiveShare,
  AccessRequestResult,
  ActiveGrantCheck,
  OtpValidationResult,
  SharedAppointmentDetail,
  SharedAppointmentSummary,
  GrantScope,
} from '../models/MedicalRecordModels';

type RpcError = {
  message: string;
  code?: string;
};

type RpcInvoker = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asString(value: unknown, fallback: string = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseScope(value: unknown): GrantScope {
  const scope = asRecord(value);
  const scopeType = asString(scope.type, 'full_history');
  const normalizedType =
    scopeType === 'date_range' || scopeType === 'specific_appointments' || scopeType === 'full_history'
      ? scopeType
      : 'full_history';

  const appointmentIdsRaw = Array.isArray(scope.appointment_ids)
    ? scope.appointment_ids
    : Array.isArray(scope.appointmentIds)
    ? scope.appointmentIds
    : [];

  return {
    type: normalizedType,
    from: asString(scope.from) || undefined,
    to: asString(scope.to) || undefined,
    appointmentIds: appointmentIdsRaw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item),
  };
}

export class MedicalRecordSharingRepository {
  private rpcClient: RpcInvoker;

  constructor() {
    this.rpcClient = supabase as unknown as RpcInvoker;
  }

  async requestAccess(
    patientId: string,
    appointmentId: string,
    clinicId: string,
    ownerOverrideReason?: string
  ): Promise<AccessRequestResult> {
    const { data, error } = await this.rpcClient.rpc('request_medical_record_access', {
      p_patient_id: patientId,
      p_appointment_id: appointmentId,
      p_clinic_id: clinicId,
      p_owner_override_reason: ownerOverrideReason ?? null,
    });

    if (error) {
      if (error.code === 'P0429') {
        throw new RateLimitError('Too many OTP requests. Please wait before retrying.');
      }
      logger.error('Failed to request medical record access', error as unknown as Error, {
        patientId,
        appointmentId,
        clinicId,
      });
      throw new DatabaseError('Failed to request medical record access', error as unknown as Error);
    }

    const payload = asRecord(data);

    if (payload.error) {
      const message = asString(payload.message, asString(payload.error));
      if (asString(payload.error) === 'rate_limited') {
        throw new RateLimitError(message || 'Rate limited while requesting OTP');
      }
      throw new ValidationError(message || 'Medical record access request failed');
    }

    return {
      grantId: asString(payload.grant_id),
      deliveryChannel: asString(payload.delivery_channel, 'sms') as 'sms' | 'email',
      patientHasApp: Boolean(payload.patient_has_app),
      deliveryStatus: asString(payload.delivery_status, 'pending') as 'pending' | 'sending' | 'sent' | 'failed',
      otpTtlSeconds: Number(payload.otp_ttl_seconds ?? 300),
    };
  }

  async deliverOtp(grantId: string): Promise<{ success: boolean; deliveryChannel: 'sms' | 'email' }> {
    const { data, error } = await supabase.functions.invoke('deliver-record-access-otp', {
      body: { grant_id: grantId },
    });

    if (error) {
      logger.error('Failed to deliver medical record OTP', error as unknown as Error, { grantId });
      throw new ExternalServiceError('deliver-record-access-otp', 'Failed to deliver OTP', error as unknown as Error);
    }

    const payload = asRecord(data);
    if (payload.error) {
      throw new ExternalServiceError('deliver-record-access-otp', asString(payload.error), undefined);
    }

    return {
      success: Boolean(payload.success),
      deliveryChannel: asString(payload.delivery_channel, 'sms') as 'sms' | 'email',
    };
  }

  async resendOtp(grantId: string): Promise<{ readyForDelivery: boolean; retryAfterSeconds?: number }> {
    const { data, error } = await this.rpcClient.rpc('resend_medical_record_otp', {
      p_grant_id: grantId,
    });

    if (error) {
      logger.error('Failed to resend OTP for medical record access', error as unknown as Error, { grantId });
      throw new DatabaseError('Failed to resend OTP', error as unknown as Error);
    }

    const payload = asRecord(data);
    if (asString(payload.error) === 'cooldown') {
      return {
        readyForDelivery: false,
        retryAfterSeconds: Number(payload.retry_after_seconds ?? 0),
      };
    }

    return {
      readyForDelivery: Boolean(payload.ready_for_delivery),
    };
  }

  async validateOtp(grantId: string, code: string, durationSeconds: number): Promise<OtpValidationResult> {
    const { data, error } = await this.rpcClient.rpc('validate_medical_record_otp', {
      p_grant_id: grantId,
      p_code: code,
      p_duration_seconds: durationSeconds,
    });

    if (error) {
      logger.error('Failed to validate OTP for medical record access', error as unknown as Error, {
        grantId,
      });
      throw new DatabaseError('Failed to validate OTP', error as unknown as Error);
    }

    const payload = asRecord(data);

    if (payload.error) {
      return {
        success: false,
        error: asString(payload.error),
        attemptsRemaining: Number(payload.attempts_remaining ?? 0),
        lockedUntil: asDate(payload.locked_until),
      };
    }

    return {
      success: Boolean(payload.success),
      grantId: asString(payload.grant_id),
      expiresAt: asDate(payload.expires_at),
    };
  }

  async checkActiveAccess(patientId: string): Promise<ActiveGrantCheck> {
    const { data, error } = await this.rpcClient.rpc('check_active_grant_for_patient', {
      p_patient_id: patientId,
    });

    if (error) {
      logger.error('Failed to check active medical record grant', error as unknown as Error, { patientId });
      throw new DatabaseError('Failed to check active access grant', error as unknown as Error);
    }

    const payload = asRecord(data);

    return {
      hasAccess: Boolean(payload.has_access),
      grantId: asString(payload.grant_id) || undefined,
      expiresAt: asDate(payload.expires_at),
    };
  }

  async getSharedHistory(grantId: string): Promise<SharedAppointmentSummary[]> {
    const { data, error } = await this.rpcClient.rpc('get_shared_appointment_history', {
      p_grant_id: grantId,
    });

    if (error) {
      logger.error('Failed to fetch shared appointment history', error as unknown as Error, { grantId });
      throw new DatabaseError('Failed to fetch shared appointment history', error as unknown as Error);
    }

    return asArray(data).map((item) => ({
      appointmentId: asString(item.appointment_id),
      date: asString(item.date),
      clinicName: asString(item.clinic_name, 'Clinic'),
      doctorName: asString(item.doctor_name, 'Staff Member'),
      appointmentType: asString(item.appointment_type, 'consultation'),
      status: asString(item.status, 'completed'),
      hasDiagnoses: Boolean(item.has_diagnoses),
      hasNotes: Boolean(item.has_notes),
      hasPrescriptions: Boolean(item.has_prescriptions),
      hasLabResults: Boolean(item.has_lab_results),
    }));
  }

  async getSharedDetail(grantId: string, appointmentId: string): Promise<SharedAppointmentDetail> {
    const { data, error } = await this.rpcClient.rpc('get_shared_appointment_detail', {
      p_grant_id: grantId,
      p_appointment_id: appointmentId,
    });

    if (error) {
      logger.error('Failed to fetch shared appointment detail', error as unknown as Error, {
        grantId,
        appointmentId,
      });
      throw new DatabaseError('Failed to fetch shared appointment detail', error as unknown as Error);
    }

    const payload = asRecord(data);

    return {
      appointmentId: asString(payload.appointment_id),
      date: asString(payload.date),
      clinicName: asString(payload.clinic_name, 'Clinic'),
      doctorName: asString(payload.doctor_name, 'Staff Member'),
      appointmentType: asString(payload.appointment_type, 'consultation'),
      status: asString(payload.status, 'completed'),
      hasDiagnoses: Boolean(payload.has_diagnoses),
      hasNotes: Boolean(payload.has_notes),
      hasPrescriptions: Boolean(payload.has_prescriptions),
      hasLabResults: Boolean(payload.has_lab_results),
      reasonForVisit: asString(payload.reason_for_visit) || undefined,
      notes: asString(payload.notes) || undefined,
      durationMinutes: typeof payload.duration_minutes === 'number' ? payload.duration_minutes : undefined,
      diagnoses: asArray(payload.diagnoses).map((diagnosis) => ({
        id: asString(diagnosis.id),
        diagnosisCode: asString(diagnosis.diagnosisCode || diagnosis.diagnosis_code) || undefined,
        diagnosisLabel: asString(diagnosis.diagnosisLabel || diagnosis.diagnosis_label),
        diagnosisNotes: asString(diagnosis.diagnosisNotes || diagnosis.diagnosis_notes) || undefined,
      })),
      prescriptions: asArray(payload.prescriptions).map((prescription) => ({
        id: asString(prescription.id),
        medicationName: asString(prescription.medicationName || prescription.medication_name),
        dosage: asString(prescription.dosage) || undefined,
        route: asString(prescription.route) || undefined,
        frequency: asString(prescription.frequency) || undefined,
        durationDays:
          typeof prescription.durationDays === 'number'
            ? prescription.durationDays
            : typeof prescription.duration_days === 'number'
            ? prescription.duration_days
            : undefined,
        instructions: asString(prescription.instructions) || undefined,
      })),
      labResults: asArray(payload.lab_results).map((lab) => ({
        id: asString(lab.id),
        testName: asString(lab.testName || lab.test_name),
        resultValue: asString(lab.resultValue || lab.result_value) || undefined,
        unit: asString(lab.unit) || undefined,
        referenceRange: asString(lab.referenceRange || lab.reference_range) || undefined,
        interpretation: asString(lab.interpretation) || undefined,
      })),
    };
  }

  async getMyActiveShares(): Promise<ActiveShare[]> {
    const { data, error } = await this.rpcClient.rpc('get_my_active_shares');

    if (error) {
      logger.error('Failed to fetch my active medical record shares', error as unknown as Error);
      throw new DatabaseError('Failed to fetch active shares', error as unknown as Error);
    }

    return asArray(data).map((item) => ({
      id: asString(item.id),
      granteeName: asString(item.grantee_name, 'Staff Member'),
      clinicName: asString(item.clinic_name, 'Clinic'),
      status: asString(item.status, 'pending_otp') as ActiveShare['status'],
      grantedAt: asDate(item.granted_at),
      expiresAt: asDate(item.expires_at),
      consentMethod: asString(item.consent_method) as ActiveShare['consentMethod'],
      scope: parseScope(item.scope),
      accessCount: Number(item.access_count ?? 0),
    }));
  }

  async approveAccess(grantId: string, durationSeconds: number): Promise<void> {
    const { data, error } = await this.rpcClient.rpc('approve_medical_record_access', {
      p_grant_id: grantId,
      p_duration_seconds: durationSeconds,
    });

    if (error) {
      logger.error('Failed to approve medical record access grant', error as unknown as Error, {
        grantId,
        durationSeconds,
      });
      throw new DatabaseError('Failed to approve share', error as unknown as Error);
    }

    const payload = asRecord(data);
    if (!payload.success) {
      throw new ValidationError(asString(payload.error, 'Failed to approve share'));
    }
  }

  async revokeAccess(grantId: string): Promise<void> {
    const { data, error } = await this.rpcClient.rpc('revoke_medical_record_access', {
      p_grant_id: grantId,
    });

    if (error) {
      logger.error('Failed to revoke medical record access grant', error as unknown as Error, { grantId });
      throw new DatabaseError('Failed to revoke share', error as unknown as Error);
    }

    const payload = asRecord(data);
    if (!payload.success) {
      throw new ValidationError(asString(payload.error, 'Failed to revoke share'));
    }
  }

  async revokeAllAccess(): Promise<number> {
    const { data, error } = await this.rpcClient.rpc('revoke_all_medical_record_access');

    if (error) {
      logger.error('Failed to revoke all medical record access grants', error as unknown as Error);
      throw new DatabaseError('Failed to revoke all shares', error as unknown as Error);
    }

    const payload = asRecord(data);
    if (!payload.success) {
      throw new ValidationError(asString(payload.error, 'Failed to revoke all shares'));
    }

    return Number(payload.revoked_count ?? 0);
  }

  async getMyAccessAuditLog(limit: number, offset: number): Promise<AccessLogEntry[]> {
    const { data, error } = await this.rpcClient.rpc('get_my_medical_record_access_log', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      logger.error('Failed to fetch medical record access audit log', error as unknown as Error, {
        limit,
        offset,
      });
      throw new DatabaseError('Failed to fetch access audit log', error as unknown as Error);
    }

    return asArray(data).map((item) => ({
      id: asString(item.id),
      accessedBy: asString(item.accessed_by),
      accessedByName: asString(item.accessed_by_name, 'Staff Member'),
      clinicName: asString(item.clinic_name, 'Clinic'),
      recordType: asString(item.record_type, 'appointment_history') as AccessLogEntry['recordType'],
      action: asString(item.action, 'view'),
      accessedAt: asDate(item.accessed_at) ?? new Date(),
    }));
  }
}

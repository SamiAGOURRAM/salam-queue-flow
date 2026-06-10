import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  medicalRecordSharingService,
  type AccessRequestResult,
  type ActiveGrantCheck,
  type GrantScope,
  type OtpValidationResult,
  type SharedAppointmentDetail,
  type SharedAppointmentSummary,
} from '@/services/medical-records';
import { logger } from '@/services/shared/logging/Logger';

interface UseMedicalRecordAccessState {
  hasAccess: boolean;
  activeGrantId: string | null;
  expiresAt: Date | null;
  lastRequest: AccessRequestResult | null;
  sharedHistory: SharedAppointmentSummary[];
  loading: boolean;
  error: string | null;
}

export function useMedicalRecordAccess(patientId: string | undefined) {
  const service = useMemo(() => medicalRecordSharingService, []);

  const [state, setState] = useState<UseMedicalRecordAccessState>({
    hasAccess: false,
    activeGrantId: null,
    expiresAt: null,
    lastRequest: null,
    sharedHistory: [],
    loading: false,
    error: null,
  });

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    setState((prev) => ({ ...prev, error: message }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const syncActiveGrant = useCallback(
    async (targetPatientId: string): Promise<ActiveGrantCheck | null> => {
      try {
        const check = await service.checkActiveAccess(targetPatientId);
        setState((prev) => ({
          ...prev,
          hasAccess: check.hasAccess,
          activeGrantId: check.grantId ?? null,
          expiresAt: check.expiresAt ?? null,
        }));
        return check;
      } catch (error) {
        logger.error('Failed to sync active medical record grant', error as Error, { patientId: targetPatientId });
        setError(error);
        return null;
      }
    },
    [service, setError]
  );

  useEffect(() => {
    if (!patientId) {
      setState((prev) => ({
        ...prev,
        hasAccess: false,
        activeGrantId: null,
        expiresAt: null,
        lastRequest: null,
        sharedHistory: [],
      }));
      return;
    }

    void syncActiveGrant(patientId);
  }, [patientId, syncActiveGrant]);

  const requestAccess = useCallback(
    async (
      appointmentId: string,
      clinicId: string,
      ownerOverrideReason?: string,
      scope?: GrantScope
    ): Promise<AccessRequestResult> => {
      if (!patientId) {
        throw new Error('No patient selected');
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await service.requestAccess(patientId, appointmentId, clinicId, ownerOverrideReason, scope);
        setState((prev) => ({
          ...prev,
          loading: false,
          lastRequest: result,
          activeGrantId: result.grantId,
        }));
        return result;
      } catch (error) {
        setError(error);
        setState((prev) => ({ ...prev, loading: false }));
        throw error;
      }
    },
    [patientId, service, setError]
  );

  const resendOtp = useCallback(async (): Promise<{ sent: boolean; retryAfterSeconds?: number }> => {
    if (!state.activeGrantId) {
      throw new Error('No active grant request to resend');
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await service.resendOtp(state.activeGrantId);
      setState((prev) => ({ ...prev, loading: false }));
      return result;
    } catch (error) {
      setError(error);
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  }, [service, setError, state.activeGrantId]);

  const validateOtp = useCallback(
    async (code: string, durationSeconds: number): Promise<OtpValidationResult> => {
      if (!state.activeGrantId) {
        throw new Error('No grant request available to validate');
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await service.validateOtp(state.activeGrantId, code, durationSeconds);
        setState((prev) => ({
          ...prev,
          loading: false,
          hasAccess: result.success ? true : prev.hasAccess,
          expiresAt: result.expiresAt ?? prev.expiresAt,
          activeGrantId: result.grantId ?? prev.activeGrantId,
        }));
        return result;
      } catch (error) {
        setError(error);
        setState((prev) => ({ ...prev, loading: false }));
        throw error;
      }
    },
    [service, setError, state.activeGrantId]
  );

  const loadHistory = useCallback(async (): Promise<SharedAppointmentSummary[]> => {
    if (!state.activeGrantId) return [];

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const history = await service.getSharedHistory(state.activeGrantId);
      setState((prev) => ({ ...prev, loading: false, sharedHistory: history }));
      return history;
    } catch (error) {
      setError(error);
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  }, [service, setError, state.activeGrantId]);

  const loadDetail = useCallback(
    async (appointmentId: string): Promise<SharedAppointmentDetail> => {
      if (!state.activeGrantId) {
        throw new Error('No active grant available');
      }
      return service.getSharedDetail(state.activeGrantId, appointmentId);
    },
    [service, state.activeGrantId]
  );

  return {
    hasAccess: state.hasAccess,
    activeGrantId: state.activeGrantId,
    expiresAt: state.expiresAt,
    lastRequest: state.lastRequest,
    sharedHistory: state.sharedHistory,
    loading: state.loading,
    error: state.error,
    requestAccess,
    validateOtp,
    resendOtp,
    loadHistory,
    loadDetail,
    refreshActiveGrant: () => (patientId ? syncActiveGrant(patientId) : Promise.resolve(null)),
    clearError,
  };
}

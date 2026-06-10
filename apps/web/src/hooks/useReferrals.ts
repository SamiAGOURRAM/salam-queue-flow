import { useCallback, useEffect, useState } from 'react';
import { referralService } from '@/services/referrals';
import type { CreateReferralInput, Referral, ReferralResponseInput } from '@/services/referrals';

interface UseReferralsState {
  referrals: Referral[];
  loading: boolean;
  error: string | null;
}

export function useReferrals(patientId?: string, clinicId?: string) {
  const [state, setState] = useState<UseReferralsState>({
    referrals: [],
    loading: false,
    error: null,
  });

  const loadReferrals = useCallback(async () => {
    if (!patientId || !clinicId) {
      setState({ referrals: [], loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const referrals = await referralService.getPatientReferrals(patientId, clinicId);
      setState({ referrals, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load referrals';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, [patientId, clinicId]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

  const createReferral = useCallback(
    async (input: Omit<CreateReferralInput, 'patientId' | 'clinicId'>) => {
      if (!patientId || !clinicId) {
        throw new Error('Patient and clinic context required');
      }

      await referralService.createReferral({
        ...input,
        patientId,
        clinicId,
      });

      await loadReferrals();
    },
    [patientId, clinicId, loadReferrals]
  );

  const respondToReferral = useCallback(
    async (input: ReferralResponseInput) => {
      await referralService.respondToReferral(input);
      await loadReferrals();
    },
    [loadReferrals]
  );

  const cancelReferral = useCallback(
    async (referralId: string) => {
      await referralService.cancelReferral(referralId);
      await loadReferrals();
    },
    [loadReferrals]
  );

  return {
    ...state,
    createReferral,
    respondToReferral,
    cancelReferral,
    reload: loadReferrals,
  };
}

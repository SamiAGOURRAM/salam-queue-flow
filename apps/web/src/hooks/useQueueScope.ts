import { useCallback, useEffect, useMemo, useState } from 'react';
import { staffService, type StaffQueueScope } from '@/services/staff';
import { logger } from '@/services/shared/logging/Logger';

export type QueueScopeSelection = 'clinic' | 'personal';

const DEFAULT_SCOPE: StaffQueueScope = {
  clinicId: '',
  scopeMode: 'clinic',
  isClinicWide: true,
  isOwner: false,
  isProvider: false,
  allowedStaffIds: [],
};

interface UseQueueScopeOptions {
  clinicId?: string;
  staffId?: string;
  initialSelection?: QueueScopeSelection;
}

interface UseQueueScopeResult {
  loading: boolean;
  error: string | null;
  resolvedScope: StaffQueueScope;
  selection: QueueScopeSelection;
  setSelection: (selection: QueueScopeSelection) => void;
  canSwitchQueueScope: boolean;
  effectiveSelection: QueueScopeSelection;
  useClinicWide: boolean;
  allowedStaffIds?: string[];
}

export function useQueueScope({
  clinicId,
  staffId,
  initialSelection = 'clinic',
}: UseQueueScopeOptions): UseQueueScopeResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedScope, setResolvedScope] = useState<StaffQueueScope>(DEFAULT_SCOPE);
  const [selection, setSelection] = useState<QueueScopeSelection>(initialSelection);

  const resolveScope = useCallback(async () => {
    if (!clinicId || !staffId) {
      setResolvedScope({
        ...DEFAULT_SCOPE,
        clinicId: clinicId || '',
      });
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const scope = await staffService.resolveQueueScope(staffId);

      if (scope.clinicId && scope.clinicId !== clinicId) {
        logger.warn('Resolved queue scope clinic mismatch', {
          requestedClinicId: clinicId,
          resolvedClinicId: scope.clinicId,
          staffId,
        });
      }

      setResolvedScope(scope);
      setError(null);
    } catch (scopeError) {
      logger.error(
        'Failed to resolve queue scope',
        scopeError instanceof Error ? scopeError : new Error(String(scopeError)),
        { clinicId, staffId }
      );
      setResolvedScope({
        ...DEFAULT_SCOPE,
        clinicId,
      });
      setError(scopeError instanceof Error ? scopeError.message : 'Failed to resolve queue scope');
    } finally {
      setLoading(false);
    }
  }, [clinicId, staffId]);

  useEffect(() => {
    void resolveScope();
  }, [resolveScope]);

  useEffect(() => {
    if (resolvedScope.scopeMode === 'provider' && selection !== 'personal') {
      setSelection('personal');
      return;
    }

    if (resolvedScope.scopeMode === 'restricted' && selection !== 'clinic') {
      setSelection('clinic');
      return;
    }

    if (!resolvedScope.requesterStaffId && selection === 'personal') {
      setSelection('clinic');
      return;
    }

    if (
      resolvedScope.scopeMode === 'clinic' &&
      !resolvedScope.isOwner &&
      selection !== 'clinic'
    ) {
      setSelection('clinic');
    }
  }, [resolvedScope.isOwner, resolvedScope.requesterStaffId, resolvedScope.scopeMode, selection]);

  const canSwitchQueueScope = useMemo(
    () =>
      resolvedScope.scopeMode === 'clinic' &&
      resolvedScope.isOwner &&
      Boolean(resolvedScope.requesterStaffId),
    [resolvedScope.isOwner, resolvedScope.requesterStaffId, resolvedScope.scopeMode]
  );

  const effectiveSelection = useMemo<QueueScopeSelection>(() => {
    if (resolvedScope.scopeMode === 'provider') {
      return 'personal';
    }

    if (resolvedScope.scopeMode === 'restricted') {
      return 'clinic';
    }

    return selection;
  }, [resolvedScope.scopeMode, selection]);

  const useClinicWide = effectiveSelection === 'clinic';

  const allowedStaffIds = useMemo(() => {
    if (useClinicWide) {
      if (resolvedScope.scopeMode === 'restricted' && resolvedScope.allowedStaffIds.length > 0) {
        return resolvedScope.allowedStaffIds;
      }
      return undefined;
    }

    if (!resolvedScope.requesterStaffId) {
      return undefined;
    }

    return [resolvedScope.requesterStaffId];
  }, [resolvedScope.allowedStaffIds, resolvedScope.requesterStaffId, resolvedScope.scopeMode, useClinicWide]);

  return {
    loading,
    error,
    resolvedScope,
    selection,
    setSelection,
    canSwitchQueueScope,
    effectiveSelection,
    useClinicWide,
    allowedStaffIds,
  };
}

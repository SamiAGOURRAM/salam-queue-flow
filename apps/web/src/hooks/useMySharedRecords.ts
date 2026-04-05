import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DURATION_PRESETS,
  GrantStatus,
  medicalRecordSharingService,
  type AccessLogEntry,
  type ActiveShare,
} from '@/services/medical-records';
import { logger } from '@/services/shared/logging/Logger';

const AUDIT_PAGE_SIZE = 10;

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
};

export function useMySharedRecords(patientUserId?: string) {
  const service = useMemo(() => medicalRecordSharingService, []);

  const [activeShares, setActiveShares] = useState<ActiveShare[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ActiveShare[]>([]);
  const [latestPendingRequest, setLatestPendingRequest] = useState<ActiveShare | null>(null);
  const [auditLog, setAuditLog] = useState<AccessLogEntry[]>([]);
  const [hasMoreAuditLog, setHasMoreAuditLog] = useState(true);
  const [auditOffset, setAuditOffset] = useState(0);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loadingShares, setLoadingShares] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const splitShares = useCallback((shares: ActiveShare[]) => {
    const nextPending = shares.filter((share) => share.status === GrantStatus.PENDING_OTP);
    const nextActive = shares.filter((share) => share.status === GrantStatus.ACTIVE);
    return { nextPending, nextActive };
  }, []);

  const loadShares = useCallback(
    async (captureLatestPending: boolean = true) => {
      setLoadingShares(true);
      setError(null);
      try {
        const shares = await service.getMyActiveShares();
        const { nextPending, nextActive } = splitShares(shares);

        setPendingRequests(nextPending);
        setActiveShares(nextActive);

        if (!nextPending.length) {
          setLatestPendingRequest(null);
        } else if (captureLatestPending) {
          setLatestPendingRequest(nextPending[0]);
        }

        return { nextPending, nextActive };
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load shared records';
        logger.error('Failed to load active shares', loadError as Error);
        setError(message);
        return { nextPending: [], nextActive: [] };
      } finally {
        setLoadingShares(false);
      }
    },
    [service, splitShares]
  );

  const loadAuditLogPage = useCallback(
    async (offset: number, reset: boolean) => {
      setLoadingAudit(true);
      setAuditError(null);

      try {
        const entries = await service.getAuditLog(AUDIT_PAGE_SIZE, offset);
        setHasMoreAuditLog(entries.length === AUDIT_PAGE_SIZE);
        setAuditOffset(offset + entries.length);

        if (reset) {
          setAuditLog(entries);
        } else {
          setAuditLog((prev) => [...prev, ...entries]);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load access audit log';
        logger.error('Failed to load medical record access audit log', loadError as Error);
        setAuditError(message);
      } finally {
        setLoadingAudit(false);
      }
    },
    [service]
  );

  useEffect(() => {
    if (!patientUserId) {
      setPatientId(null);
      return;
    }

    const resolvePatientId = async () => {
      const { data, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', patientUserId)
        .eq('is_anonymized', false)
        .maybeSingle();

      if (patientError) {
        logger.error('Failed to resolve patient ID for shared records realtime', patientError as Error, {
          patientUserId,
        });
        setPatientId(null);
        return;
      }

      setPatientId(data?.id ?? null);
    };

    void resolvePatientId();
  }, [patientUserId]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  useEffect(() => {
    void loadAuditLogPage(0, true);
  }, [loadAuditLogPage]);

  useEffect(() => {
    if (!patientId) return;

    const channel = supabase
      .channel(`medical-shares-${patientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medical_record_access_grants',
          filter: `patient_id=eq.${patientId}`,
        },
        async (payload) => {
          const typedPayload = payload as unknown as RealtimePayload;
          const updated = await loadShares(typedPayload.eventType !== 'UPDATE');

          if (typedPayload.eventType === 'INSERT') {
            const insertedId = typeof typedPayload.new.id === 'string' ? typedPayload.new.id : null;
            if (insertedId) {
              const insertedPending = updated.nextPending.find((request) => request.id === insertedId);
              if (insertedPending) {
                setLatestPendingRequest(insertedPending);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadShares, patientId]);

  useEffect(() => {
    if (!patientId) return;

    const auditChannel = supabase
      .channel(`medical-share-audit-${patientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medical_record_access_log',
          filter: `patient_id=eq.${patientId}`,
        },
        async () => {
          await loadAuditLogPage(0, true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auditChannel);
    };
  }, [loadAuditLogPage, patientId]);

  const approve = useCallback(
    async (grantId: string, durationSeconds: number = DURATION_PRESETS.THIS_APPOINTMENT) => {
      setLoadingActions(true);
      setError(null);
      try {
        await service.approveAccess(grantId, durationSeconds);
        await loadShares(false);
      } catch (approveError) {
        const message = approveError instanceof Error ? approveError.message : 'Failed to approve share';
        setError(message);
        throw approveError;
      } finally {
        setLoadingActions(false);
      }
    },
    [service, loadShares]
  );

  const deny = useCallback(
    async (grantId: string) => {
      setLoadingActions(true);
      setError(null);
      try {
        await service.revokeAccess(grantId);
        await loadShares(false);
      } catch (denyError) {
        const message = denyError instanceof Error ? denyError.message : 'Failed to deny request';
        setError(message);
        throw denyError;
      } finally {
        setLoadingActions(false);
      }
    },
    [service, loadShares]
  );

  const revoke = useCallback(
    async (grantId: string) => {
      setLoadingActions(true);
      setError(null);
      try {
        await service.revokeAccess(grantId);
        await loadShares(false);
      } catch (revokeError) {
        const message = revokeError instanceof Error ? revokeError.message : 'Failed to revoke share';
        setError(message);
        throw revokeError;
      } finally {
        setLoadingActions(false);
      }
    },
    [service, loadShares]
  );

  const revokeAll = useCallback(async (): Promise<number> => {
    setLoadingActions(true);
    setError(null);
    try {
      const count = await service.revokeAll();
      await loadShares(false);
      return count;
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : 'Failed to revoke all shares';
      setError(message);
      throw revokeError;
    } finally {
      setLoadingActions(false);
    }
  }, [service, loadShares]);

  return {
    activeShares,
    pendingRequests,
    latestPendingRequest,
    auditLog,
    hasMoreAuditLog,
    loading: loadingShares || loadingActions,
    loadingAudit,
    error,
    auditError,
    refresh: () => loadShares(false),
    refreshAudit: () => loadAuditLogPage(0, true),
    loadMoreAuditLog: () => loadAuditLogPage(auditOffset, false),
    approve,
    deny,
    revoke,
    revokeAll,
    dismissPendingRequest: () => setLatestPendingRequest(null),
  };
}

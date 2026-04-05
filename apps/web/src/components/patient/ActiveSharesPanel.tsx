import { AlertTriangle, Loader2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ActiveShare } from '@/services/medical-records';
import { useTranslation } from 'react-i18next';

function formatExpiry(expiresAt: Date | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!expiresAt) return t('medicalSharing.patient.activeShares.noExpiry');

  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return t('medicalSharing.patient.activeShares.expired');

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return t('medicalSharing.patient.activeShares.minRemaining', { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return t('medicalSharing.patient.activeShares.hourMinRemaining', {
    hours,
    minutes: remMinutes,
  });
}

interface ActiveSharesPanelProps {
  pendingRequests: ActiveShare[];
  activeShares: ActiveShare[];
  loading?: boolean;
  error?: string | null;
  onReviewRequest: (grantId: string) => void;
  onRevoke: (grantId: string) => void;
  onRevokeAll: () => void;
}

export function ActiveSharesPanel({
  pendingRequests,
  activeShares,
  loading = false,
  error,
  onReviewRequest,
  onRevoke,
  onRevokeAll,
}: ActiveSharesPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-border bg-card p-5 mt-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {t('medicalSharing.patient.activeShares.title')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('medicalSharing.patient.activeShares.subtitle')}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="rounded-full"
          onClick={onRevokeAll}
          disabled={loading || activeShares.length === 0}
        >
          <ShieldAlert className="h-4 w-4 mr-1" />
          {t('medicalSharing.patient.activeShares.revokeAll')}
        </Button>
      </div>

      {pendingRequests.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('medicalSharing.patient.activeShares.pendingTitle')}
          </p>
          {pendingRequests.map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{request.granteeName}</p>
                <p className="text-xs text-muted-foreground truncate">{request.clinicName}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
                onClick={() => onReviewRequest(request.id)}
              >
                {t('medicalSharing.patient.activeShares.review')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {loading && activeShares.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {t('medicalSharing.patient.activeShares.loading')}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : activeShares.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('medicalSharing.patient.activeShares.empty')}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {activeShares.map((share) => (
            <div key={share.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{share.granteeName}</p>
                <p className="text-xs text-muted-foreground truncate">{share.clinicName}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatExpiry(share.expiresAt, t)}</p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  <Shield className="h-3 w-3 mr-1" />
                  {share.status.replace('_', ' ')}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => onRevoke(share.id)}
                  disabled={loading}
                >
                  {t('medicalSharing.patient.activeShares.revoke')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

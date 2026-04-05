import { AlertTriangle, Loader2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ActiveShare } from '@/services/medical-records';

function formatExpiry(expiresAt?: Date): string {
  if (!expiresAt) return 'No expiry';

  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min remaining`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m remaining`;
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

  return (
    <section className="rounded-2xl border border-border bg-card p-5 mt-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Who can see your medical records
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You can revoke any share instantly. Revocation takes effect immediately.
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
          Revoke All Access
        </Button>
      </div>

      {pendingRequests.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending Requests</p>
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
                Review
              </Button>
            </div>
          ))}
        </div>
      )}

      {loading && activeShares.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading active shares...
        </div>
      ) : error ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : activeShares.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No active medical record shares.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {activeShares.map((share) => (
            <div key={share.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{share.granteeName}</p>
                <p className="text-xs text-muted-foreground truncate">{share.clinicName}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatExpiry(share.expiresAt)}</p>
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
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

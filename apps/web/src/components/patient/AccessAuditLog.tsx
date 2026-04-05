import { AlertTriangle, Loader2, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccessLogEntry } from '@/services/medical-records';

interface AccessAuditLogProps {
  entries: AccessLogEntry[];
  loading?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore: () => void;
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function AccessAuditLog({
  entries,
  loading = false,
  error,
  hasMore = false,
  onLoadMore,
}: AccessAuditLogProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 mt-6">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-blue-600" />
        Access Audit Log
      </p>

      {error ? (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-2">No one has accessed your records yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{entry.accessedByName}</p>
                <span className="text-xs text-muted-foreground">{formatTimestamp(entry.accessedAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{entry.clinicName}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">
                {entry.recordType.replace('_', ' ')} · {entry.action}
              </p>
            </div>
          ))}

          {hasMore && (
            <Button variant="outline" className="w-full" onClick={onLoadMore} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load More
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

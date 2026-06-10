import { useState } from 'react';
import { AccessRequestNotification } from '@/components/patient/AccessRequestNotification';
import { ActiveSharesPanel } from '@/components/patient/ActiveSharesPanel';
import { Button } from '@/components/ui/button';
import { GrantStatus, type ActiveShare } from '@/services/medical-records';

const INITIAL_PENDING_REQUESTS: ActiveShare[] = [
  {
    id: '00000000-0000-0000-0000-00000000pa01',
    granteeName: 'Dr. Nadia Atlas',
    clinicName: 'Salam Queue Clinic',
    status: GrantStatus.PENDING_OTP,
    scope: { type: 'full_history' },
    accessCount: 0,
  },
  {
    id: '00000000-0000-0000-0000-00000000pa02',
    granteeName: 'Dr. Youssef Zahra',
    clinicName: 'Atlas Family Care',
    status: GrantStatus.PENDING_OTP,
    scope: { type: 'full_history' },
    accessCount: 0,
  },
];

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function logEntry(action: string, grantId: string, meta?: string) {
  return meta ? `${action}:${grantId}:${meta}` : `${action}:${grantId}`;
}

export default function PatientMedicalSharingE2EHarness() {
  const [pendingRequests, setPendingRequests] = useState<ActiveShare[]>(INITIAL_PENDING_REQUESTS);
  const [activeShares, setActiveShares] = useState<ActiveShare[]>([]);
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  const selectedRequest = pendingRequests.find((request) => request.id === selectedGrantId) ?? null;

  const appendEvent = (entry: string) => {
    setEvents((prev) => [...prev, entry]);
  };

  const handleReviewRequest = (grantId: string) => {
    setSelectedGrantId(grantId);
    appendEvent(logEntry('reviewed', grantId));
  };

  const handleApprove = async (durationSeconds: number) => {
    if (!selectedRequest) return;

    setLoading(true);
    await delay(60);

    setPendingRequests((prev) => prev.filter((request) => request.id !== selectedRequest.id));
    setActiveShares((prev) => [
      {
        ...selectedRequest,
        status: GrantStatus.ACTIVE,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + durationSeconds * 1000),
      },
      ...prev,
    ]);
    setSelectedGrantId(null);
    setLoading(false);
    appendEvent(logEntry('approved', selectedRequest.id, String(durationSeconds)));
  };

  const handleDeny = async () => {
    if (!selectedRequest) return;

    setLoading(true);
    await delay(60);

    setPendingRequests((prev) => prev.filter((request) => request.id !== selectedRequest.id));
    setSelectedGrantId(null);
    setLoading(false);
    appendEvent(logEntry('denied', selectedRequest.id));
  };

  const handleRevoke = async (grantId: string) => {
    setLoading(true);
    await delay(50);

    setActiveShares((prev) => prev.filter((share) => share.id !== grantId));
    setLoading(false);
    appendEvent(logEntry('revoked', grantId));
  };

  const handleRevokeAll = async () => {
    setLoading(true);
    await delay(50);

    setActiveShares([]);
    setLoading(false);
    appendEvent('revoked_all');
  };

  const handleReset = () => {
    setPendingRequests(INITIAL_PENDING_REQUESTS);
    setActiveShares([]);
    setSelectedGrantId(null);
    setLoading(false);
    setEvents([]);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6" data-testid="patient-medical-sharing-e2e-harness">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Patient Medical Sharing E2E Harness</h1>
        <p className="text-sm text-muted-foreground">
          This page simulates patient in-app approval workflow with deterministic state transitions for browser E2E tests.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleReset}>
          Reset Harness State
        </Button>
      </div>

      <ActiveSharesPanel
        pendingRequests={pendingRequests}
        activeShares={activeShares}
        loading={loading}
        onReviewRequest={handleReviewRequest}
        onRevoke={handleRevoke}
        onRevokeAll={handleRevokeAll}
      />

      <AccessRequestNotification
        open={Boolean(selectedRequest)}
        doctorName={selectedRequest?.granteeName ?? ''}
        clinicName={selectedRequest?.clinicName ?? ''}
        loading={loading}
        onApprove={handleApprove}
        onDeny={handleDeny}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGrantId(null);
          }
        }}
      />

      <section className="rounded-lg border border-border bg-muted/20 p-4" data-testid="patient-e2e-event-log">
        <h2 className="text-sm font-semibold">Event log</h2>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="event-log-list">
          {events.length === 0 ? <li>no-events</li> : null}
          {events.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

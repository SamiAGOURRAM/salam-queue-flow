import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useReferrals } from '@/hooks/useReferrals';
import { CreateReferralDialog } from './CreateReferralDialog';
import type { Referral } from '@/services/referrals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  accepted: 'default',
  declined: 'destructive',
  completed: 'outline',
  cancelled: 'outline',
};

interface ReferralTabProps {
  patientId: string;
  clinicId: string;
  sourceStaffId: string;
  doctorUserId: string;
}

export function ReferralTab({ patientId, clinicId, sourceStaffId }: ReferralTabProps) {
  const { t } = useTranslation();
  const {
    referrals,
    loading,
    error,
    createReferral,
    respondToReferral,
    cancelReferral,
  } = useReferrals(patientId, clinicId);

  const handleCreate = async (data: {
    targetDoctorName: string;
    reason: string;
    targetSpecialty?: string;
    targetClinicName?: string;
    notes?: string;
  }) => {
    await createReferral({
      sourceStaffId,
      ...data,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {referrals.length === 0
            ? t('referral.empty')
            : t('referral.count', { count: referrals.length })}
        </p>
        <CreateReferralDialog onSave={handleCreate} />
      </div>

      {referrals.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <ExternalLink className="h-10 w-10" />
          <p className="text-sm">{t('referral.emptyDescription')}</p>
        </div>
      )}

      <div className="space-y-3">
        {referrals.map((referral) => (
          <ReferralCard
            key={referral.id}
            referral={referral}
            onRespond={respondToReferral}
            onCancel={cancelReferral}
          />
        ))}
      </div>
    </div>
  );
}

function ReferralCard({
  referral,
  onRespond,
  onCancel,
}: {
  referral: Referral;
  onRespond: (input: { referralId: string; newStatus: 'accepted' | 'declined'; responseNotes?: string }) => Promise<void>;
  onCancel: (referralId: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <Card data-testid={`referral-card-${referral.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-medium">
              {referral.targetDoctorName}
            </CardTitle>
            {referral.targetSpecialty && (
              <p className="text-xs text-muted-foreground">{referral.targetSpecialty}</p>
            )}
          </div>
          <Badge variant={STATUS_VARIANTS[referral.status] ?? 'outline'}>
            {t(`referral.status.${referral.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-foreground">{referral.reason}</p>

        {referral.targetClinicName && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('referral.card.targetClinic')}: {referral.targetClinicName}
          </p>
        )}

        {referral.notes && (
          <p className="mt-1 text-xs italic text-muted-foreground">{referral.notes}</p>
        )}

        {referral.responseNotes && (
          <div className="mt-2 rounded bg-muted p-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('referral.card.response')}:
            </p>
            <p className="text-xs text-muted-foreground">{referral.responseNotes}</p>
          </div>
        )}

        {referral.status === 'pending' && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => onRespond({ referralId: referral.id, newStatus: 'accepted' })}
              data-testid={`referral-accept-${referral.id}`}
            >
              {t('referral.actions.accept')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onRespond({ referralId: referral.id, newStatus: 'declined' })}
              data-testid={`referral-decline-${referral.id}`}
            >
              {t('referral.actions.decline')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(referral.id)}
              data-testid={`referral-cancel-${referral.id}`}
            >
              {t('referral.actions.cancel')}
            </Button>
          </div>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground">
          {t('referral.card.createdAt')}: {new Date(referral.createdAt).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}

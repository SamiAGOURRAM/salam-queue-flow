import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useMedicalRecordAccess } from '@/hooks/useMedicalRecordAccess';
import { DURATION_PRESETS, type GrantScope } from '@/services/medical-records';
import { useTranslation } from 'react-i18next';

interface RequestMedicalHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  patientId?: string;
  appointmentId?: string;
  patientName?: string;
  onAccessActivated?: (grantId: string, expiresAt?: Date) => void;
}

export function RequestMedicalHistoryDialog({
  open,
  onOpenChange,
  clinicId,
  patientId,
  appointmentId,
  patientName,
  onAccessActivated,
}: RequestMedicalHistoryDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [otpCode, setOtpCode] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(DURATION_PRESETS.THIS_APPOINTMENT);
  const [requestScopeType, setRequestScopeType] = useState<GrantScope['type']>('specific_appointments');
  const [otpStepVisible, setOtpStepVisible] = useState(false);

  const {
    loading,
    error,
    lastRequest,
    activeGrantId,
    requestAccess,
    validateOtp,
    resendOtp,
    clearError,
  } = useMedicalRecordAccess(patientId);

  const durationOptions = useMemo(
    () => [
      {
        label: t('medicalSharing.doctor.requestDialog.durationOptions.thisAppointment'),
        value: DURATION_PRESETS.THIS_APPOINTMENT,
      },
      {
        label: t('medicalSharing.doctor.requestDialog.durationOptions.hours24'),
        value: DURATION_PRESETS.TWENTY_FOUR_HOURS,
      },
      {
        label: t('medicalSharing.doctor.requestDialog.durationOptions.oneWeek'),
        value: DURATION_PRESETS.ONE_WEEK,
      },
    ],
    [t]
  );

  const scopeOptions = useMemo(
    () => [
      {
        label: t('medicalSharing.doctor.requestDialog.scopeOptions.thisAppointment'),
        value: 'specific_appointments' as const,
      },
      {
        label: t('medicalSharing.doctor.requestDialog.scopeOptions.fullHistory'),
        value: 'full_history' as const,
      },
    ],
    [t]
  );

  useEffect(() => {
    if (!open) {
      setOtpCode('');
      setDurationSeconds(DURATION_PRESETS.THIS_APPOINTMENT);
      setRequestScopeType('specific_appointments');
      setOtpStepVisible(false);
      clearError();
    }
  }, [open, clearError]);

  const handleRequest = async () => {
    if (!patientId || !appointmentId) {
      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.missingContextTitle'),
        description: t('medicalSharing.doctor.requestDialog.toasts.missingContextDescription'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const requestScope: GrantScope =
        requestScopeType === 'full_history'
          ? { type: 'full_history' }
          : {
              type: 'specific_appointments',
              appointmentIds: [appointmentId],
            };

      const result = await requestAccess(appointmentId, clinicId, undefined, requestScope);
      setOtpStepVisible(true);
      if (result.deliveryStatus === 'failed') {
        toast({
          title: t('medicalSharing.doctor.requestDialog.toasts.deliveryPendingTitle'),
          description: t('medicalSharing.doctor.requestDialog.toasts.deliveryPendingDescription'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('medicalSharing.doctor.requestDialog.toasts.codeSentTitle'),
          description: t('medicalSharing.doctor.requestDialog.toasts.codeSentDescription', {
            channel: result.deliveryChannel.toUpperCase(),
          }),
        });
      }
    } catch (requestError) {
      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.requestFailedTitle'),
        description:
          requestError instanceof Error
            ? requestError.message
            : t('medicalSharing.doctor.requestDialog.toasts.unexpectedError'),
        variant: 'destructive',
      });
    }
  };

  const handleResend = async () => {
    try {
      const result = await resendOtp();
      if (!result.sent) {
        toast({
          title: t('medicalSharing.doctor.requestDialog.toasts.waitBeforeRetryTitle'),
          description: result.retryAfterSeconds
            ? t('medicalSharing.doctor.requestDialog.toasts.retryInSeconds', {
                seconds: result.retryAfterSeconds,
              })
            : t('medicalSharing.doctor.requestDialog.toasts.cooldownActiveDescription'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.newCodeSentTitle'),
        description: t('medicalSharing.doctor.requestDialog.toasts.newCodeSentDescription'),
      });
    } catch (resendError) {
      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.resendFailedTitle'),
        description:
          resendError instanceof Error
            ? resendError.message
            : t('medicalSharing.doctor.requestDialog.toasts.unexpectedError'),
        variant: 'destructive',
      });
    }
  };

  const handleValidate = async () => {
    if (otpCode.length !== 6) {
      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.enterCodeTitle'),
        description: t('medicalSharing.doctor.requestDialog.toasts.enterCodeDescription'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await validateOtp(otpCode, durationSeconds);

      if (!result.success) {
        if (result.error === 'invalid_code') {
          toast({
            title: t('medicalSharing.doctor.requestDialog.toasts.invalidCodeTitle'),
            description:
              typeof result.attemptsRemaining === 'number'
                ? t('medicalSharing.doctor.requestDialog.toasts.attemptsRemainingDescription', {
                    count: result.attemptsRemaining,
                  })
                : t('medicalSharing.doctor.requestDialog.toasts.verifyCodeDescription'),
            variant: 'destructive',
          });
          return;
        }

        if (result.error === 'locked' && result.lockedUntil) {
          toast({
            title: t('medicalSharing.doctor.requestDialog.toasts.codeLockedTitle'),
            description: t('medicalSharing.doctor.requestDialog.toasts.retryAfterTimeDescription', {
              time: result.lockedUntil.toLocaleTimeString(),
            }),
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: t('medicalSharing.doctor.requestDialog.toasts.validateFailedTitle'),
          description: result.error || t('medicalSharing.doctor.requestDialog.toasts.tryAgainDescription'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.unlockedTitle'),
        description: t('medicalSharing.doctor.requestDialog.toasts.unlockedDescription'),
      });

      if (result.grantId && onAccessActivated) {
        onAccessActivated(result.grantId, result.expiresAt);
      }

      onOpenChange(false);
    } catch (validationError) {
      toast({
        title: t('medicalSharing.doctor.requestDialog.toasts.validateRequestFailedTitle'),
        description:
          validationError instanceof Error
            ? validationError.message
            : t('medicalSharing.doctor.requestDialog.toasts.unexpectedError'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {t('medicalSharing.doctor.requestDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {patientName
              ? t('medicalSharing.doctor.requestDialog.descriptionWithPatient', { patientName })
              : t('medicalSharing.doctor.requestDialog.descriptionDefault')}
          </DialogDescription>
        </DialogHeader>

        {!otpStepVisible ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {t('medicalSharing.doctor.requestDialog.intro')}
            </div>

            <div className="space-y-2">
              <Label>{t('medicalSharing.doctor.requestDialog.accessScopeLabel')}</Label>
              <RadioGroup
                value={requestScopeType}
                onValueChange={(value) => setRequestScopeType(value as GrantScope['type'])}
              >
                {scopeOptions.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                    data-testid={`scope-option-${option.value}`}
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`scope-${option.value}`}
                      data-testid={`scope-radio-${option.value}`}
                    />
                    <Label htmlFor={`scope-${option.value}`} className="cursor-pointer">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleRequest} disabled={loading || !patientId || !appointmentId}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('medicalSharing.doctor.requestDialog.actions.sendAccessCode')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>{t('medicalSharing.doctor.requestDialog.patientCodeLabel')}</Label>
              <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs text-muted-foreground">
                {lastRequest?.patientHasApp
                  ? t('medicalSharing.doctor.requestDialog.patientHasAppHint')
                  : t('medicalSharing.doctor.requestDialog.patientNoAppHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('medicalSharing.doctor.requestDialog.accessDurationLabel')}</Label>
              <RadioGroup
                value={String(durationSeconds)}
                onValueChange={(value) => setDurationSeconds(Number(value))}
              >
                {durationOptions.map((option) => (
                  <div key={option.value} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <RadioGroupItem value={String(option.value)} id={`duration-${option.value}`} />
                    <Label htmlFor={`duration-${option.value}`} className="cursor-pointer">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleResend} disabled={loading || !activeGrantId}>
                {t('medicalSharing.doctor.requestDialog.actions.resendCode')}
              </Button>
              <Button type="button" onClick={handleValidate} disabled={loading || otpCode.length !== 6}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('medicalSharing.doctor.requestDialog.actions.verifyAndOpen')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

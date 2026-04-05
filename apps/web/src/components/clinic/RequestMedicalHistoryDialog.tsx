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
import { DURATION_PRESETS } from '@/services/medical-records';

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
  const [otpCode, setOtpCode] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(DURATION_PRESETS.THIS_APPOINTMENT);
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
      { label: 'This appointment (1 hour)', value: DURATION_PRESETS.THIS_APPOINTMENT },
      { label: '24 hours', value: DURATION_PRESETS.TWENTY_FOUR_HOURS },
      { label: '1 week', value: DURATION_PRESETS.ONE_WEEK },
    ],
    []
  );

  useEffect(() => {
    if (!open) {
      setOtpCode('');
      setDurationSeconds(DURATION_PRESETS.THIS_APPOINTMENT);
      setOtpStepVisible(false);
      clearError();
    }
  }, [open, clearError]);

  const handleRequest = async () => {
    if (!patientId || !appointmentId) {
      toast({
        title: 'Cannot request access',
        description: 'Missing patient or appointment context.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await requestAccess(appointmentId, clinicId);
      setOtpStepVisible(true);
      if (result.deliveryStatus === 'failed') {
        toast({
          title: 'Code delivery pending',
          description: 'Delivery failed. You can retry sending the code.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Access code sent',
          description: `A one-time code was sent via ${result.deliveryChannel.toUpperCase()}.`,
        });
      }
    } catch (requestError) {
      toast({
        title: 'Failed to request medical history',
        description: requestError instanceof Error ? requestError.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const handleResend = async () => {
    try {
      const result = await resendOtp();
      if (!result.sent) {
        toast({
          title: 'Please wait before retrying',
          description: result.retryAfterSeconds
            ? `Try again in ${result.retryAfterSeconds} seconds.`
            : 'Resend cooldown is active.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'A new code was sent',
        description: 'Please ask the patient for the new 6-digit code.',
      });
    } catch (resendError) {
      toast({
        title: 'Failed to resend code',
        description: resendError instanceof Error ? resendError.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const handleValidate = async () => {
    if (otpCode.length !== 6) {
      toast({
        title: 'Enter a 6-digit code',
        description: 'Please enter the full code provided by the patient.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await validateOtp(otpCode, durationSeconds);

      if (!result.success) {
        if (result.error === 'invalid_code') {
          toast({
            title: 'Invalid code',
            description:
              typeof result.attemptsRemaining === 'number'
                ? `${result.attemptsRemaining} attempts remaining.`
                : 'Please verify the code and try again.',
            variant: 'destructive',
          });
          return;
        }

        if (result.error === 'locked' && result.lockedUntil) {
          toast({
            title: 'Code entry locked',
            description: `Retry after ${result.lockedUntil.toLocaleTimeString()}.`,
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: 'Unable to validate code',
          description: result.error || 'Please try again.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Medical history unlocked',
        description: 'Access is now active for the selected duration.',
      });

      if (result.grantId && onAccessActivated) {
        onAccessActivated(result.grantId, result.expiresAt);
      }

      onOpenChange(false);
    } catch (validationError) {
      toast({
        title: 'Failed to validate code',
        description: validationError instanceof Error ? validationError.message : 'Unexpected error',
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
            Request Medical History
          </DialogTitle>
          <DialogDescription>
            {patientName ? `Requesting access for ${patientName}.` : 'Request temporary access to patient history.'}
          </DialogDescription>
        </DialogHeader>

        {!otpStepVisible ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              A one-time verification code will be sent to the patient. Access remains time-limited and revocable.
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleRequest} disabled={loading || !patientId || !appointmentId}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Access Code
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Patient code</Label>
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
                  ? 'Patient can also approve in-app. OTP remains available as fallback.'
                  : 'Ask the patient to read the 6-digit code from SMS or email.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Access duration</Label>
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
                Resend code
              </Button>
              <Button type="button" onClick={handleValidate} disabled={loading || otpCode.length !== 6}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & Open History
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

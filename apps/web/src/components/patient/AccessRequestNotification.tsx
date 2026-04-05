import { useMemo, useState } from 'react';
import { BellRing, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DURATION_PRESETS } from '@/services/medical-records';

interface AccessRequestNotificationProps {
  open: boolean;
  doctorName: string;
  clinicName: string;
  loading?: boolean;
  onApprove: (durationSeconds: number) => Promise<void> | void;
  onDeny: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
}

export function AccessRequestNotification({
  open,
  doctorName,
  clinicName,
  loading = false,
  onApprove,
  onDeny,
  onOpenChange,
}: AccessRequestNotificationProps) {
  const [durationSeconds, setDurationSeconds] = useState<number>(DURATION_PRESETS.THIS_APPOINTMENT);

  const durationOptions = useMemo(
    () => [
      { label: 'This appointment (1 hour)', value: DURATION_PRESETS.THIS_APPOINTMENT },
      { label: '24 hours', value: DURATION_PRESETS.TWENTY_FOUR_HOURS },
      { label: '1 week', value: DURATION_PRESETS.ONE_WEEK },
    ],
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-blue-600" />
            Medical records access request
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{doctorName}</span> at{' '}
            <span className="font-medium text-foreground">{clinicName}</span> is requesting temporary access.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Approving grants temporary, revocable access. You can revoke any active share anytime.
        </div>

        <div className="space-y-2">
          <Label>Access duration</Label>
          <RadioGroup
            value={String(durationSeconds)}
            onValueChange={(value) => setDurationSeconds(Number(value))}
          >
            {durationOptions.map((option) => (
              <div key={option.value} className="flex items-center gap-2 rounded-md border border-border p-2">
                <RadioGroupItem value={String(option.value)} id={`notify-duration-${option.value}`} />
                <Label htmlFor={`notify-duration-${option.value}`} className="cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDeny} disabled={loading}>
            Deny
          </Button>
          <Button onClick={() => onApprove(durationSeconds)} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

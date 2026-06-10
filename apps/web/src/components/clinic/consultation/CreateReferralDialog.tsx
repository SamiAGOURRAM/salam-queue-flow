import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ExternalLink } from 'lucide-react';

interface CreateReferralDialogProps {
  onSave: (data: {
    targetDoctorName: string;
    reason: string;
    targetSpecialty?: string;
    targetClinicName?: string;
    notes?: string;
  }) => Promise<void>;
}

export function CreateReferralDialog({ onSave }: CreateReferralDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetDoctorName, setTargetDoctorName] = useState('');
  const [targetSpecialty, setTargetSpecialty] = useState('');
  const [targetClinicName, setTargetClinicName] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    if (!targetDoctorName.trim()) {
      setError(t('referral.validation.doctorNameRequired'));
      return;
    }

    if (!reason.trim()) {
      setError(t('referral.validation.reasonRequired'));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        targetDoctorName: targetDoctorName.trim(),
        reason: reason.trim(),
        targetSpecialty: targetSpecialty.trim() || undefined,
        targetClinicName: targetClinicName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('referral.errors.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setTargetDoctorName('');
    setTargetSpecialty('');
    setTargetClinicName('');
    setReason('');
    setNotes('');
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => { setOpen(newOpen); if (!newOpen) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="create-referral-trigger">
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('referral.actions.create')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('referral.dialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="target-doctor">{t('referral.dialog.targetDoctor')} *</Label>
            <Input
              id="target-doctor"
              value={targetDoctorName}
              onChange={(e) => setTargetDoctorName(e.target.value)}
              placeholder={t('referral.dialog.targetDoctorPlaceholder')}
              data-testid="referral-target-doctor"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="target-specialty">{t('referral.dialog.targetSpecialty')}</Label>
            <Input
              id="target-specialty"
              value={targetSpecialty}
              onChange={(e) => setTargetSpecialty(e.target.value)}
              placeholder={t('referral.dialog.targetSpecialtyPlaceholder')}
              data-testid="referral-target-specialty"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="target-clinic">{t('referral.dialog.targetClinic')}</Label>
            <Input
              id="target-clinic"
              value={targetClinicName}
              onChange={(e) => setTargetClinicName(e.target.value)}
              placeholder={t('referral.dialog.targetClinicPlaceholder')}
              data-testid="referral-target-clinic"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">{t('referral.dialog.reason')} *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('referral.dialog.reasonPlaceholder')}
              data-testid="referral-reason"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">{t('referral.dialog.notes')}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('referral.dialog.notesPlaceholder')}
              data-testid="referral-notes"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" data-testid="referral-error">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            {t('referral.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="referral-save">
            {saving ? t('referral.actions.saving') : t('referral.actions.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

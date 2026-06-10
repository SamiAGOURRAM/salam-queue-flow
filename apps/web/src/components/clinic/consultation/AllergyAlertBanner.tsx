import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  patientAllergyService,
  type PatientAllergy,
  type PatientAllergySeverity,
} from '@/services/medical-records';

interface AllergyAlertBannerProps {
  patientId: string;
  doctorUserId: string;
}

const SEVERITY_ORDER: Record<PatientAllergySeverity, number> = {
  severe: 0,
  moderate: 1,
  mild: 2,
  unknown: 3,
};

function severityBadgeClass(severity: PatientAllergySeverity): string {
  switch (severity) {
    case 'severe':
      return 'bg-red-600 text-white hover:bg-red-600';
    case 'moderate':
      return 'bg-amber-500 text-white hover:bg-amber-500';
    case 'mild':
      return 'bg-yellow-200 text-yellow-900 hover:bg-yellow-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function AllergyAlertBanner({ patientId, doctorUserId }: AllergyAlertBannerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const [substance, setSubstance] = useState('');
  const [severity, setSeverity] = useState<PatientAllergySeverity>('unknown');
  const [reaction, setReaction] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    patientAllergyService
      .listActive(patientId)
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        );
        setAllergies(sorted);
      })
      .catch(() => {
        if (cancelled) return;
        toast({
          title: t('allergies.errors.loadTitle', 'Could not load allergies'),
          description: t('allergies.errors.loadDescription', 'Refresh to try again.'),
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, t, toast]);

  const highestSeverity = useMemo<PatientAllergySeverity | null>(() => {
    if (allergies.length === 0) return null;
    return allergies[0].severity;
  }, [allergies]);

  const bannerTone = useMemo(() => {
    if (!highestSeverity) return 'none';
    if (highestSeverity === 'severe') return 'severe';
    if (highestSeverity === 'moderate' || highestSeverity === 'mild') return 'warning';
    return 'info';
  }, [highestSeverity]);

  const resetForm = () => {
    setSubstance('');
    setSeverity('unknown');
    setReaction('');
  };

  const handleCreate = async () => {
    const trimmed = substance.trim();
    if (!trimmed) {
      toast({
        title: t('allergies.errors.substanceRequired', 'Substance is required'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const created = await patientAllergyService.create({
        patientId,
        substance: trimmed,
        severity,
        reaction: reaction.trim() || undefined,
        source: 'clinician',
        recordedBy: doctorUserId,
      });

      setAllergies((prev) =>
        [...prev, created].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        )
      );
      resetForm();
      setAddOpen(false);
      toast({
        title: t('allergies.toasts.addedTitle', 'Allergy recorded'),
      });
    } catch {
      toast({
        title: t('allergies.errors.saveTitle', 'Could not save allergy'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (allergyId: string) => {
    try {
      await patientAllergyService.deactivate({
        allergyId,
        userId: doctorUserId,
      });
      setAllergies((prev) => prev.filter((a) => a.id !== allergyId));
    } catch {
      toast({
        title: t('allergies.errors.removeTitle', 'Could not remove allergy'),
        variant: 'destructive',
      });
    }
  };

  if (loading) return null;

  const containerClass =
    bannerTone === 'severe'
      ? 'border-red-300 bg-red-50 text-red-900'
      : bannerTone === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : bannerTone === 'info'
          ? 'border-slate-200 bg-slate-50 text-slate-800'
          : 'border-dashed border-slate-200 bg-white text-slate-600';

  const Icon = bannerTone === 'severe' ? ShieldAlert : AlertTriangle;

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${containerClass}`} data-testid="allergy-banner">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">
              {allergies.length === 0
                ? t('allergies.banner.none', 'No known allergies on file')
                : t('allergies.banner.title', 'Known allergies')}
            </div>
            {allergies.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {allergies.map((allergy) => (
                  <Badge
                    key={allergy.id}
                    className={`gap-1 rounded-full pl-2 pr-1 ${severityBadgeClass(allergy.severity)}`}
                  >
                    <span>{allergy.substance}</span>
                    {allergy.reaction && (
                      <span className="opacity-80">· {allergy.reaction}</span>
                    )}
                    <button
                      type="button"
                      aria-label={t('allergies.banner.remove', 'Remove')}
                      onClick={() => void handleDeactivate(allergy.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={bannerTone === 'severe' ? 'secondary' : 'outline'}
          onClick={() => setAddOpen(true)}
          data-testid="allergy-banner-add"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('allergies.banner.add', 'Add')}
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={(open) => { if (!saving) setAddOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('allergies.dialog.title', 'Record allergy')}</DialogTitle>
            <DialogDescription>
              {t('allergies.dialog.description', 'Safety-first: recorded allergies are visible on every future visit.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="allergy-substance">
                {t('allergies.dialog.substance', 'Substance')}
              </Label>
              <Input
                id="allergy-substance"
                value={substance}
                onChange={(e) => setSubstance(e.target.value)}
                placeholder={t('allergies.dialog.substancePlaceholder', 'e.g. Penicillin, Peanuts') as string}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="allergy-severity">
                {t('allergies.dialog.severity', 'Severity')}
              </Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as PatientAllergySeverity)}>
                <SelectTrigger id="allergy-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="severe">{t('allergies.severity.severe', 'Severe')}</SelectItem>
                  <SelectItem value="moderate">{t('allergies.severity.moderate', 'Moderate')}</SelectItem>
                  <SelectItem value="mild">{t('allergies.severity.mild', 'Mild')}</SelectItem>
                  <SelectItem value="unknown">{t('allergies.severity.unknown', 'Unknown')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="allergy-reaction">
                {t('allergies.dialog.reaction', 'Reaction (optional)')}
              </Label>
              <Input
                id="allergy-reaction"
                value={reaction}
                onChange={(e) => setReaction(e.target.value)}
                placeholder={t('allergies.dialog.reactionPlaceholder', 'e.g. Rash, Anaphylaxis') as string}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !substance.trim()}>
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
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
import { toast } from '@/hooks/use-toast';
import {
  patientAllergyService,
  type PatientAllergy,
  type PatientAllergySeverity,
} from '@/services/medical-records';

interface PatientAllergySectionProps {
  userId: string;
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

export function PatientAllergySection({ userId }: PatientAllergySectionProps) {
  const { t } = useTranslation();

  const [patientRowId, setPatientRowId] = useState<string | null>(null);
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const [substance, setSubstance] = useState('');
  const [severity, setSeverity] = useState<PatientAllergySeverity>('unknown');
  const [reaction, setReaction] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data: patientRow, error } = await supabase
          .from('patients')
          .select('id')
          .eq('user_id', userId)
          .eq('is_anonymized', false)
          .maybeSingle();

        if (error || !patientRow) {
          if (!cancelled) setAllergies([]);
          return;
        }

        if (cancelled) return;
        setPatientRowId(patientRow.id);

        const items = await patientAllergyService.listActive(patientRow.id);
        if (cancelled) return;
        setAllergies(
          [...items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        );
      } catch {
        if (!cancelled) {
          toast({
            title: t('allergies.errors.loadTitle', 'Could not load allergies'),
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  const resetForm = () => {
    setSubstance('');
    setSeverity('unknown');
    setReaction('');
  };

  const handleCreate = async () => {
    if (!patientRowId) return;
    const trimmed = substance.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const created = await patientAllergyService.create({
        patientId: patientRowId,
        substance: trimmed,
        severity,
        reaction: reaction.trim() || undefined,
        source: 'patient',
        recordedBy: userId,
      });
      setAllergies((prev) =>
        [...prev, created].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        )
      );
      resetForm();
      setAddOpen(false);
      toast({ title: t('allergies.toasts.addedTitle', 'Allergy recorded') });
    } catch {
      toast({
        title: t('allergies.errors.saveTitle', 'Could not save allergy'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (allergyId: string) => {
    try {
      await patientAllergyService.deactivate({ allergyId, userId });
      setAllergies((prev) => prev.filter((a) => a.id !== allergyId));
    } catch {
      toast({
        title: t('allergies.errors.removeTitle', 'Could not remove allergy'),
        variant: 'destructive',
      });
    }
  };

  if (loading || !patientRowId) return null;

  const hasSevere = allergies.some((a) => a.severity === 'severe');
  const Icon = hasSevere ? ShieldAlert : AlertTriangle;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('allergies.section.title', 'Allergies')}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="patient-allergy-add">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('allergies.banner.add', 'Add')}
        </Button>
      </div>

      {allergies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('allergies.section.emptyPatient', 'Add any allergies so every clinic you visit can see them right away.')}
        </div>
      ) : (
        <div
          className={`rounded-2xl border px-4 py-3 ${
            hasSevere
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-wrap items-center gap-1.5">
              {allergies.map((allergy) => (
                <Badge
                  key={allergy.id}
                  className={`gap-1 rounded-full pl-2 pr-1 ${severityBadgeClass(allergy.severity)}`}
                >
                  <span>{allergy.substance}</span>
                  {allergy.reaction && <span className="opacity-80">· {allergy.reaction}</span>}
                  <button
                    type="button"
                    aria-label={t('allergies.banner.remove', 'Remove')}
                    onClick={() => void handleRemove(allergy.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(open) => { if (!saving) setAddOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('allergies.dialog.title', 'Record allergy')}</DialogTitle>
            <DialogDescription>
              {t('allergies.dialog.descriptionPatient', 'Any clinic you visit will see these to keep you safe.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="patient-allergy-substance">
                {t('allergies.dialog.substance', 'Substance')}
              </Label>
              <Input
                id="patient-allergy-substance"
                value={substance}
                onChange={(e) => setSubstance(e.target.value)}
                placeholder={t('allergies.dialog.substancePlaceholder', 'e.g. Penicillin, Peanuts') as string}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="patient-allergy-severity">
                {t('allergies.dialog.severity', 'Severity')}
              </Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as PatientAllergySeverity)}>
                <SelectTrigger id="patient-allergy-severity">
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
              <Label htmlFor="patient-allergy-reaction">
                {t('allergies.dialog.reaction', 'Reaction (optional)')}
              </Label>
              <Input
                id="patient-allergy-reaction"
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

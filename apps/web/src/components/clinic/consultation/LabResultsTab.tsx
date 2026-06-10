import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { searchLabPanelSuggestions, findLabPanelByName } from '@/lib/moroccan-lab-panels';
import type { ConsultationLabResultInput } from '@/services/medical-records';

interface LabResultsTabProps {
  labResults: ConsultationLabResultInput[];
  saving: boolean;
  onChange: (items: ConsultationLabResultInput[]) => void;
  onSave: () => Promise<void>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEmptyLabResult(defaultInterpretation: string): ConsultationLabResultInput {
  return {
    testName: '',
    resultValue: '',
    unit: '',
    referenceRange: '',
    interpretation: defaultInterpretation,
    isPatientVisible: true,
  };
}

export function LabResultsTab({ labResults, saving, onChange, onSave }: LabResultsTabProps) {
  const { t } = useTranslation();

  const interpretationOptions = useMemo(() => {
    const translated = t('medicalSharing.doctor.consultation.labs.interpretationOptions', {
      returnObjects: true,
    });
    return asStringArray(translated);
  }, [t]);

  const testNameSuggestions = useMemo(() => {
    if (labResults.length === 0) {
      return searchLabPanelSuggestions('', 30).map((item) => item.testName);
    }

    const fromRows = labResults.flatMap((item) => searchLabPanelSuggestions(item.testName || '', 16).map((x) => x.testName));

    return fromRows.filter(
      (value, index, source) => source.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index
    );
  }, [labResults]);

  const updateItem = (
    index: number,
    field: keyof ConsultationLabResultInput,
    value: string | boolean | undefined
  ) => {
    const next = labResults.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      return {
        ...item,
        [field]: value,
      };
    });
    onChange(next);
  };

  const handleTestNameChange = (index: number, testName: string) => {
    const suggestion = findLabPanelByName(testName);
    const next = labResults.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      return {
        ...item,
        testName,
        unit: item.unit || suggestion?.unit || '',
        referenceRange: item.referenceRange || suggestion?.referenceRange || '',
      };
    });
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {labResults.map((item, index) => (
          <div key={item.id ?? `lab-result-${index}`} className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {t('medicalSharing.doctor.consultation.labs.rowTitle', { number: index + 1 })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-red-600 hover:text-red-700"
                onClick={() => onChange(labResults.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('medicalSharing.doctor.consultation.actions.remove')}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>{t('medicalSharing.doctor.consultation.labs.testLabel')}</Label>
                <Input
                  list="consultation-lab-test-suggestions"
                  value={item.testName}
                  onChange={(event) => handleTestNameChange(index, event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.labs.testPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.labs.resultValueLabel')}</Label>
                <Input
                  value={item.resultValue ?? ''}
                  onChange={(event) => updateItem(index, 'resultValue', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.labs.resultValuePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.labs.unitLabel')}</Label>
                <Input
                  value={item.unit ?? ''}
                  onChange={(event) => updateItem(index, 'unit', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.labs.unitPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.labs.referenceRangeLabel')}</Label>
                <Input
                  value={item.referenceRange ?? ''}
                  onChange={(event) => updateItem(index, 'referenceRange', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.labs.referenceRangePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.labs.interpretationLabel')}</Label>
                <Input
                  list="consultation-lab-interpretation-suggestions"
                  value={item.interpretation ?? ''}
                  onChange={(event) => updateItem(index, 'interpretation', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.labs.interpretationPlaceholder')}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label className="text-sm">{t('medicalSharing.doctor.consultation.visibility.patientVisible')}</Label>
              <Switch
                checked={item.isPatientVisible}
                onCheckedChange={(checked) => updateItem(index, 'isPatientVisible', checked)}
              />
            </div>
          </div>
        ))}

        {labResults.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('medicalSharing.doctor.consultation.labs.empty')}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...labResults, createEmptyLabResult(interpretationOptions[0] ?? '')])}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('medicalSharing.doctor.consultation.actions.addLabResult')}
        </Button>

        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving
            ? t('medicalSharing.doctor.consultation.actions.savingSection')
            : t('medicalSharing.doctor.consultation.actions.saveLabResults')}
        </Button>
      </div>

      <datalist id="consultation-lab-test-suggestions">
        {testNameSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="consultation-lab-interpretation-suggestions">
        {interpretationOptions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </div>
  );
}

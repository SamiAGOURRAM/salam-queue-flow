import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ConsultationDiagnosisInput } from '@/services/medical-records';

interface DiagnosesTabProps {
  diagnoses: ConsultationDiagnosisInput[];
  saving: boolean;
  onChange: (items: ConsultationDiagnosisInput[]) => void;
  onSave: () => Promise<void>;
}

function createEmptyDiagnosis(): ConsultationDiagnosisInput {
  return {
    diagnosisCode: '',
    diagnosisLabel: '',
    diagnosisNotes: '',
    isPatientVisible: true,
  };
}

export function DiagnosesTab({ diagnoses, saving, onChange, onSave }: DiagnosesTabProps) {
  const { t } = useTranslation();

  const handleFieldChange = (
    index: number,
    field: keyof ConsultationDiagnosisInput,
    value: string | boolean | undefined
  ) => {
    const next = diagnoses.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      return {
        ...item,
        [field]: value,
      };
    });
    onChange(next);
  };

  const handleAdd = () => {
    onChange([...diagnoses, createEmptyDiagnosis()]);
  };

  const handleRemove = (index: number) => {
    onChange(diagnoses.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {diagnoses.map((item, index) => (
          <div key={item.id ?? `diagnosis-${index}`} className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {t('medicalSharing.doctor.consultation.diagnoses.rowTitle', { number: index + 1 })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-red-600 hover:text-red-700"
                onClick={() => handleRemove(index)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('medicalSharing.doctor.consultation.actions.remove')}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.diagnoses.codeLabel')}</Label>
                <Input
                  value={item.diagnosisCode ?? ''}
                  onChange={(event) => handleFieldChange(index, 'diagnosisCode', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.diagnoses.codePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.diagnoses.labelLabel')}</Label>
                <Input
                  value={item.diagnosisLabel}
                  onChange={(event) => handleFieldChange(index, 'diagnosisLabel', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.diagnoses.labelPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('medicalSharing.doctor.consultation.diagnoses.notesLabel')}</Label>
              <Textarea
                value={item.diagnosisNotes ?? ''}
                onChange={(event) => handleFieldChange(index, 'diagnosisNotes', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.diagnoses.notesPlaceholder')}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label className="text-sm">{t('medicalSharing.doctor.consultation.visibility.patientVisible')}</Label>
              <Switch
                checked={item.isPatientVisible}
                onCheckedChange={(checked) => handleFieldChange(index, 'isPatientVisible', checked)}
              />
            </div>
          </div>
        ))}

        {diagnoses.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('medicalSharing.doctor.consultation.diagnoses.empty')}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          {t('medicalSharing.doctor.consultation.actions.addDiagnosis')}
        </Button>

        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving
            ? t('medicalSharing.doctor.consultation.actions.savingSection')
            : t('medicalSharing.doctor.consultation.actions.saveDiagnoses')}
        </Button>
      </div>
    </div>
  );
}

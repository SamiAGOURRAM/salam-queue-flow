import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMedicationCatalog } from '@/hooks/useMedicationCatalog';
import { useTemplates } from '@/hooks/useTemplates';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getMedicationSuggestions, saveMedicationHistory } from '@/lib/medication-autocomplete';
import type {
  ConsultationPrescriptionInput,
  ConsultationPrintMetadata,
} from '@/services/medical-records';
import { PrescriptionComboDialog } from './editor/PrescriptionComboDialog';
import { OrdonnancePrintLayout } from './OrdonnancePrintLayout';

interface OrdonnanceTabProps {
  prescriptions: ConsultationPrescriptionInput[];
  saving: boolean;
  patientName?: string;
  printMetadata: ConsultationPrintMetadata | null;
  onChange: (items: ConsultationPrescriptionInput[]) => void;
  onSave: (items: ConsultationPrescriptionInput[]) => Promise<void>;
  onPrintTriggered?: () => void;
  onPrinted: () => void;
  onPendingPrintChange: (hasPending: boolean) => void;
  clinicId: string;
  doctorUserId: string;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEmptyPrescription(): ConsultationPrescriptionInput {
  return {
    medicationName: '',
    dosage: '',
    route: '',
    frequency: '',
    durationDays: undefined,
    instructions: '',
    isPatientVisible: true,
  };
}

function getPrescriptionSignature(items: ConsultationPrescriptionInput[]): string {
  const normalized = items
    .filter((item) => item.medicationName.trim())
    .map((item) => ({
      id: item.id,
      medicationName: item.medicationName.trim(),
      dosage: item.dosage?.trim(),
      route: item.route?.trim(),
      frequency: item.frequency?.trim(),
      durationDays: item.durationDays,
      instructions: item.instructions?.trim(),
      isPatientVisible: item.isPatientVisible,
    }));

  return JSON.stringify(normalized);
}

export function OrdonnanceTab({
  prescriptions,
  saving,
  patientName,
  printMetadata,
  onChange,
  onSave,
  onPrintTriggered,
  onPrinted,
  onPendingPrintChange,
  clinicId,
  doctorUserId,
}: OrdonnanceTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [printedSignature, setPrintedSignature] = useState<string | null>(null);
  const [comboDialogOpen, setComboDialogOpen] = useState(false);

  const {
    templates: comboTemplates,
    loading: comboLoading,
    error: comboError,
    query: comboQuery,
    setQuery: setComboQuery,
    markTemplateUsed,
    toPrescriptionItems,
  } = useTemplates({
    clinicId,
    userId: doctorUserId,
    templateType: 'prescription_combo',
    limit: 20,
  });

  const { suggestions: catalogSuggestions, refreshCatalog } = useMedicationCatalog({
    clinicId,
    limit: 120,
  });

  const routeOptions = useMemo(() => {
    const translated = t('medicalSharing.doctor.consultation.ordonnance.routeOptions', {
      returnObjects: true,
    });
    return asStringArray(translated);
  }, [t]);

  const frequencyOptions = useMemo(() => {
    const translated = t('medicalSharing.doctor.consultation.ordonnance.frequencyOptions', {
      returnObjects: true,
    });
    return asStringArray(translated);
  }, [t]);

  const currentSignature = useMemo(() => getPrescriptionSignature(prescriptions), [prescriptions]);
  const hasPrintableItems = useMemo(
    () => prescriptions.some((item) => item.medicationName.trim()),
    [prescriptions]
  );

  const medicationSuggestions = useMemo(() => {
    const fromRows = prescriptions
      .map((item) => item.medicationName.trim())
      .filter(Boolean)
      .slice(0, 12);
    const fromHistory = getMedicationSuggestions('', 12);
    const fromCatalog = catalogSuggestions.slice(0, 80);

    return [...fromRows, ...fromHistory, ...fromCatalog].filter(
      (value, index, source) => source.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index
    );
  }, [catalogSuggestions, prescriptions]);

  useEffect(() => {
    const hasPending = hasPrintableItems && printedSignature !== currentSignature;
    onPendingPrintChange(hasPending);
  }, [currentSignature, hasPrintableItems, onPendingPrintChange, printedSignature]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: t('medicalSharing.doctor.consultation.print.documentTitle', {
      patientName: patientName ?? t('medicalSharing.doctor.consultation.print.patientFallback'),
    }),
    onAfterPrint: () => {
      setPrintedSignature(currentSignature);
      onPrinted();
    },
  });

  const updateItem = (
    index: number,
    field: keyof ConsultationPrescriptionInput,
    value: string | boolean | number | undefined
  ) => {
    const next = prescriptions.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      return {
        ...item,
        [field]: value,
      };
    });
    onChange(next);
  };

  const handleSave = async () => {
    const cleaned = prescriptions.map((item) => ({
      ...item,
      medicationName: item.medicationName.trim(),
      dosage: item.dosage?.trim(),
      route: item.route?.trim(),
      frequency: item.frequency?.trim(),
      durationDays: item.durationDays,
      instructions: item.instructions?.trim(),
    }));

    await onSave(cleaned);

    const medicationNames = cleaned
      .map((item) => item.medicationName)
      .filter(Boolean);
    if (medicationNames.length > 0) {
      saveMedicationHistory(medicationNames);
      void refreshCatalog();
    }

    setPrintedSignature(null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {prescriptions.map((item, index) => (
          <div key={item.id ?? `prescription-${index}`} className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {t('medicalSharing.doctor.consultation.ordonnance.rowTitle', { number: index + 1 })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-red-600 hover:text-red-700"
                onClick={() => onChange(prescriptions.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('medicalSharing.doctor.consultation.actions.remove')}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>{t('medicalSharing.doctor.consultation.ordonnance.medicationLabel')}</Label>
                <Input
                  list="consultation-medication-suggestions"
                  value={item.medicationName}
                  onChange={(event) => updateItem(index, 'medicationName', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.ordonnance.medicationPlaceholder')}
                  data-testid={`consultation-medication-input-${index}`}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.ordonnance.dosageLabel')}</Label>
                <Input
                  value={item.dosage ?? ''}
                  onChange={(event) => updateItem(index, 'dosage', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.ordonnance.dosagePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.ordonnance.routeLabel')}</Label>
                <Input
                  list="consultation-route-suggestions"
                  value={item.route ?? ''}
                  onChange={(event) => updateItem(index, 'route', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.ordonnance.routePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.ordonnance.frequencyLabel')}</Label>
                <Input
                  list="consultation-frequency-suggestions"
                  value={item.frequency ?? ''}
                  onChange={(event) => updateItem(index, 'frequency', event.target.value)}
                  placeholder={t('medicalSharing.doctor.consultation.ordonnance.frequencyPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('medicalSharing.doctor.consultation.ordonnance.durationLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.durationDays ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    updateItem(index, 'durationDays', nextValue ? Number(nextValue) : undefined);
                  }}
                  placeholder={t('medicalSharing.doctor.consultation.ordonnance.durationPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.instructionsLabel')}</Label>
              <Textarea
                rows={2}
                value={item.instructions ?? ''}
                onChange={(event) => updateItem(index, 'instructions', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.instructionsPlaceholder')}
              />
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

        {prescriptions.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('medicalSharing.doctor.consultation.ordonnance.empty')}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onChange([...prescriptions, createEmptyPrescription()])}>
            <Plus className="h-4 w-4 mr-1" />
            {t('medicalSharing.doctor.consultation.actions.addPrescription')}
          </Button>

          <Button type="button" variant="outline" onClick={() => setComboDialogOpen(true)}>
            {t('medicalSharing.doctor.consultation.actions.insertPrescriptionPreset')}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (printMetadata && hasPrintableItems) {
                onPrintTriggered?.();
                void handlePrint();
              }
            }}
            disabled={!printMetadata || !hasPrintableItems}
            data-testid="consultation-print-ordonnance-btn"
          >
            <Printer className="h-4 w-4 mr-1" />
            {t('medicalSharing.doctor.consultation.actions.printOrdonnance')}
          </Button>
        </div>

        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          data-testid="consultation-save-ordonnance-btn"
        >
          {saving
            ? t('medicalSharing.doctor.consultation.actions.savingSection')
            : t('medicalSharing.doctor.consultation.actions.saveOrdonnance')}
        </Button>
      </div>

      <datalist id="consultation-medication-suggestions">
        {medicationSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="consultation-route-suggestions">
        {routeOptions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="consultation-frequency-suggestions">
        {frequencyOptions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      {printMetadata && (
        <div className="absolute -left-[9999px] top-auto">
          <OrdonnancePrintLayout
            ref={printRef}
            clinic={printMetadata.clinic}
            doctor={printMetadata.doctor}
            patientName={patientName ?? t('medicalSharing.doctor.consultation.print.patientFallback')}
            issuedAt={new Date()}
            prescriptions={prescriptions}
          />
        </div>
      )}

      <PrescriptionComboDialog
        open={comboDialogOpen}
        loading={comboLoading}
        error={comboError}
        query={comboQuery}
        templates={comboTemplates}
        onOpenChange={setComboDialogOpen}
        onQueryChange={setComboQuery}
        onSelect={(template) => {
          const comboItems = toPrescriptionItems(template);

          if (comboItems.length === 0) {
            toast({
              title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
              description: t('medicalSharing.doctor.consultation.toasts.comboInsertEmpty'),
              variant: 'destructive',
            });
            return;
          }

          onChange([
            ...prescriptions,
            ...comboItems.map((item) => ({
              ...item,
              id: undefined,
            })),
          ]);

          void markTemplateUsed(template.id);
          toast({
            title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
            description: t('medicalSharing.doctor.consultation.toasts.comboInserted', {
              count: comboItems.length,
            }),
          });
        }}
      />
    </div>
  );
}

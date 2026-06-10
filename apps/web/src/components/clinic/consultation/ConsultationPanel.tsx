import { useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useConsultationRecords } from '@/hooks/useConsultationRecords';
import type {
  ConsultationDiagnosisInput,
  ConsultationLabResultInput,
  ConsultationPrescriptionInput,
} from '@/services/medical-records';
import { CONSULTATION_ERROR_CODES } from '@/services/medical-records/constants/ConsultationErrorCodes';
import { ConsultationNotesTab } from './ConsultationNotesTab';
import { DiagnosesTab } from './DiagnosesTab';
import { OrdonnanceTab } from './OrdonnanceTab';
import { LabResultsTab } from './LabResultsTab';
import { ProcedureReportTab } from './ProcedureReportTab';
import { ReferralTab } from './ReferralTab';
import { MedicalPassportHeader } from './MedicalPassportHeader';

interface ConsultationPanelProps {
  appointmentId: string;
  patientId: string;
  clinicId: string;
  doctorUserId: string;
  sourceStaffId?: string;
  patientName?: string;
  onUnprintedOrdonnanceChange?: (hasPendingPrint: boolean) => void;
  onPrintTriggered?: () => void;
}

type ConsultationTabKey = 'notes' | 'diagnoses' | 'ordonnance' | 'labs' | 'report' | 'referrals';

const CONSULTATION_ERROR_TRANSLATION_KEYS: Record<string, string> = {
  [CONSULTATION_ERROR_CODES.UNEXPECTED]: 'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_UNEXPECTED_ERROR',
  [CONSULTATION_ERROR_CODES.DIAGNOSIS_LABEL_REQUIRED]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_DIAGNOSIS_LABEL_REQUIRED',
  [CONSULTATION_ERROR_CODES.MEDICATION_NAME_REQUIRED]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_MEDICATION_NAME_REQUIRED',
  [CONSULTATION_ERROR_CODES.TEST_NAME_REQUIRED]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_TEST_NAME_REQUIRED',
  [CONSULTATION_ERROR_CODES.CONTEXT_MISSING_APPOINTMENT]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_CONTEXT_MISSING_APPOINTMENT',
  [CONSULTATION_ERROR_CODES.CONTEXT_MISSING_PATIENT]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_CONTEXT_MISSING_PATIENT',
  [CONSULTATION_ERROR_CODES.CONTEXT_STALE]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_CONTEXT_STALE',
  [CONSULTATION_ERROR_CODES.CONFLICT_RELOAD]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_CONFLICT_RELOAD',
  [CONSULTATION_ERROR_CODES.NOTES_CONFLICT_RELOAD]:
    'medicalSharing.doctor.consultation.errors.codes.CONSULTATION_NOTES_CONFLICT_RELOAD',
};

const LEGACY_CONSULTATION_ERROR_CODES: Record<string, string> = {
  'Diagnosis label is required.': CONSULTATION_ERROR_CODES.DIAGNOSIS_LABEL_REQUIRED,
  'Medication name is required.': CONSULTATION_ERROR_CODES.MEDICATION_NAME_REQUIRED,
  'Test name is required.': CONSULTATION_ERROR_CODES.TEST_NAME_REQUIRED,
  'Appointment context is missing.': CONSULTATION_ERROR_CODES.CONTEXT_MISSING_APPOINTMENT,
  'Patient context is missing.': CONSULTATION_ERROR_CODES.CONTEXT_MISSING_PATIENT,
  'Consultation context is stale. Reload before saving.': CONSULTATION_ERROR_CODES.CONTEXT_STALE,
  'Consultation was updated by another clinician. Reload and try saving again.': CONSULTATION_ERROR_CODES.CONFLICT_RELOAD,
  'Consultation notes changed in another session. Reload before saving.': CONSULTATION_ERROR_CODES.NOTES_CONFLICT_RELOAD,
  'Unexpected error': CONSULTATION_ERROR_CODES.UNEXPECTED,
};

function resolveConsultationErrorMessage(rawError: unknown, t: (key: string) => string): string {
  if (rawError instanceof Error) {
    const asCode = LEGACY_CONSULTATION_ERROR_CODES[rawError.message] ?? rawError.message;
    const key = CONSULTATION_ERROR_TRANSLATION_KEYS[asCode];
    return key ? t(key) : rawError.message;
  }

  if (typeof rawError === 'string') {
    const asCode = LEGACY_CONSULTATION_ERROR_CODES[rawError] ?? rawError;
    const key = CONSULTATION_ERROR_TRANSLATION_KEYS[asCode];
    return key ? t(key) : rawError;
  }

  return t('medicalSharing.doctor.consultation.errors.generic');
}

export function ConsultationPanel({
  appointmentId,
  patientId,
  clinicId,
  doctorUserId,
  sourceStaffId,
  patientName,
  onUnprintedOrdonnanceChange,
  onPrintTriggered,
}: ConsultationPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ConsultationTabKey>('notes');
  const unprintedCallbackRef = useRef(onUnprintedOrdonnanceChange);

  useEffect(() => {
    unprintedCallbackRef.current = onUnprintedOrdonnanceChange;
  }, [onUnprintedOrdonnanceChange]);

  const {
    loading,
    error,
    savingSection,
    reasonForVisit,
    notes,
    diagnoses,
    prescriptions,
    labResults,
    printMetadata,
    patientId: resolvedPatientId,
    setReasonForVisit,
    setNotes,
    setDiagnoses,
    setPrescriptions,
    setLabResults,
    saveNotes,
    saveDiagnoses,
    savePrescriptions,
    saveLabResults,
    reload,
  } = useConsultationRecords({
    appointmentId,
    patientId,
    clinicId,
    doctorUserId,
  });

  useEffect(() => {
    unprintedCallbackRef.current?.(false);
  }, [appointmentId]);

  const showSaveSuccessToast = (description: string) => {
    toast({
      title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
      description,
    });
  };

  const showSaveErrorToast = (errorMessage: string) => {
    toast({
      title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
      description: errorMessage,
      variant: 'destructive',
    });
  };

  const handleSaveNotes = async () => {
    try {
      await saveNotes({ reasonForVisit, notes });
      showSaveSuccessToast(t('medicalSharing.doctor.consultation.toasts.notesSaved'));
    } catch (saveError) {
      showSaveErrorToast(resolveConsultationErrorMessage(saveError, t));
    }
  };

  const handleSaveDiagnoses = async (items: ConsultationDiagnosisInput[]) => {
    try {
      await saveDiagnoses(items);
      showSaveSuccessToast(t('medicalSharing.doctor.consultation.toasts.diagnosesSaved'));
    } catch (saveError) {
      showSaveErrorToast(resolveConsultationErrorMessage(saveError, t));
    }
  };

  const handleSavePrescriptions = async (items: ConsultationPrescriptionInput[]) => {
    try {
      await savePrescriptions(items);
      showSaveSuccessToast(t('medicalSharing.doctor.consultation.toasts.prescriptionsSaved'));
    } catch (saveError) {
      showSaveErrorToast(resolveConsultationErrorMessage(saveError, t));
    }
  };

  const handleSaveLabResults = async (items: ConsultationLabResultInput[]) => {
    try {
      await saveLabResults(items);
      showSaveSuccessToast(t('medicalSharing.doctor.consultation.toasts.labResultsSaved'));
    } catch (saveError) {
      showSaveErrorToast(resolveConsultationErrorMessage(saveError, t));
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('medicalSharing.doctor.consultation.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('medicalSharing.doctor.consultation.subtitle', { patientName: patientName ?? t('medicalSharing.doctor.consultation.genericPatient') })}
          </p>
        </div>
        {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="mx-4 mt-4">
        <MedicalPassportHeader
          patientId={patientId}
          clinicId={clinicId}
          doctorUserId={doctorUserId}
        />
      </div>

      {error && !loading && (
        <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="consultation-error-banner">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{resolveConsultationErrorMessage(error, t)}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              {t('medicalSharing.doctor.consultation.actions.retryLoad')}
            </Button>
          </div>
        </div>
      )}

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ConsultationTabKey)}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="notes" data-testid="consultation-tab-notes">{t('medicalSharing.doctor.consultation.tabs.notes')}</TabsTrigger>
            <TabsTrigger value="diagnoses" data-testid="consultation-tab-diagnoses">{t('medicalSharing.doctor.consultation.tabs.diagnoses')}</TabsTrigger>
            <TabsTrigger value="ordonnance" data-testid="consultation-tab-ordonnance">{t('medicalSharing.doctor.consultation.tabs.ordonnance')}</TabsTrigger>
            <TabsTrigger value="labs" data-testid="consultation-tab-labs">{t('medicalSharing.doctor.consultation.tabs.labs')}</TabsTrigger>
            <TabsTrigger value="report" data-testid="consultation-tab-report">{t('medicalSharing.doctor.consultation.tabs.report')}</TabsTrigger>
            <TabsTrigger value="referrals" data-testid="consultation-tab-referrals">{t('medicalSharing.doctor.consultation.tabs.referrals')}</TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="mt-4">
            <ConsultationNotesTab
              clinicId={clinicId}
              doctorUserId={doctorUserId}
              reasonForVisit={reasonForVisit}
              notes={notes}
              saving={savingSection === 'notes'}
              patientName={patientName}
              onReasonForVisitChange={setReasonForVisit}
              onNotesChange={setNotes}
              onSave={handleSaveNotes}
            />
          </TabsContent>

          <TabsContent value="diagnoses" className="mt-4">
            <DiagnosesTab
              diagnoses={diagnoses}
              saving={savingSection === 'diagnoses'}
              onChange={setDiagnoses}
              onSave={() => handleSaveDiagnoses(diagnoses)}
            />
          </TabsContent>

          <TabsContent value="ordonnance" className="mt-4">
            <OrdonnanceTab
              clinicId={clinicId}
              doctorUserId={doctorUserId}
              prescriptions={prescriptions}
              saving={savingSection === 'prescriptions'}
              patientName={patientName}
              printMetadata={printMetadata}
              onChange={setPrescriptions}
              onSave={handleSavePrescriptions}
              onPrintTriggered={onPrintTriggered}
              onPrinted={() => {
                toast({
                  title: t('medicalSharing.doctor.consultation.toasts.printedTitle'),
                  description: t('medicalSharing.doctor.consultation.toasts.printedDescription'),
                });
              }}
              onPendingPrintChange={(hasPendingPrint) => onUnprintedOrdonnanceChange?.(hasPendingPrint)}
            />
          </TabsContent>

          <TabsContent value="labs" className="mt-4">
            <LabResultsTab
              labResults={labResults}
              saving={savingSection === 'labResults'}
              onChange={setLabResults}
              onSave={() => handleSaveLabResults(labResults)}
            />
          </TabsContent>

          <TabsContent value="report" className="mt-4">
            <ProcedureReportTab
              appointmentId={appointmentId}
              patientId={resolvedPatientId}
              clinicId={clinicId}
              doctorUserId={doctorUserId}
              patientName={patientName}
            />
          </TabsContent>

          <TabsContent value="referrals" className="mt-4">
            <ReferralTab
              patientId={resolvedPatientId}
              clinicId={clinicId}
              sourceStaffId={sourceStaffId ?? ''}
              doctorUserId={doctorUserId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

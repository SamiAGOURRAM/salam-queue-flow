import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useProcedureReport } from '@/hooks/useProcedureReport';
import { MedicalEditor } from './editor/MedicalEditor';

interface ProcedureReportTabProps {
  appointmentId: string;
  patientId?: string;
  clinicId: string;
  doctorUserId: string;
  patientName?: string;
}

export function ProcedureReportTab({
  appointmentId,
  patientId,
  clinicId,
  doctorUserId,
  patientName,
}: ProcedureReportTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    loading,
    saving,
    uploading,
    error,
    title,
    content,
    isPatientVisible,
    setTitle,
    setContent,
    setIsPatientVisible,
    saveDraft,
    finalizeReport,
    uploadImage,
  } = useProcedureReport({
    appointmentId,
    patientId,
    clinicId,
    doctorUserId,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="procedure-report-title">{t('medicalSharing.doctor.consultation.report.titleLabel')}</Label>
          <Input
            id="procedure-report-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('medicalSharing.doctor.consultation.report.titlePlaceholder')}
            data-testid="procedure-report-title-input"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <Label className="text-sm">{t('medicalSharing.doctor.consultation.visibility.patientVisible')}</Label>
          <Switch checked={isPatientVisible} onCheckedChange={setIsPatientVisible} />
        </div>
      </div>

      <MedicalEditor
        value={content}
        placeholder={t('medicalSharing.doctor.consultation.report.placeholder')}
        templateType="procedure_report"
        clinicId={clinicId}
        userId={doctorUserId}
        variableContext={{ patientName }}
        allowDocxImport
        allowImageUpload
        canSaveClinicTemplate
        editorTestId="consultation-procedure-report-editor"
        onChangeDebounceMs={120}
        onChange={({ json }) => setContent(json)}
        onImageUpload={async (file) => {
          const uploaded = await uploadImage(file);
          return {
            signedUrl: uploaded.signedUrl,
            storagePath: uploaded.storagePath,
          };
        }}
      />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void (async () => {
              try {
                await saveDraft();
                toast({
                  title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
                  description: t('medicalSharing.doctor.consultation.toasts.reportDraftSaved'),
                });
              } catch {
                // Hook state already carries detailed error messaging.
              }
            })();
          }}
          disabled={loading || saving || uploading}
          data-testid="procedure-report-save-draft-btn"
        >
          {saving ? t('medicalSharing.doctor.consultation.actions.savingSection') : t('medicalSharing.doctor.consultation.actions.saveReportDraft')}
        </Button>

        <Button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await finalizeReport();
                toast({
                  title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
                  description: t('medicalSharing.doctor.consultation.toasts.reportFinalized'),
                });
              } catch {
                // Hook state already carries detailed error messaging.
              }
            })();
          }}
          disabled={loading || saving || uploading}
          data-testid="procedure-report-finalize-btn"
        >
          {t('medicalSharing.doctor.consultation.actions.finalizeReport')}
        </Button>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MedicalEditor } from './editor/MedicalEditor';

interface ConsultationNotesTabProps {
  clinicId: string;
  doctorUserId: string;
  reasonForVisit: string;
  notes: string;
  saving: boolean;
  patientName?: string;
  onReasonForVisitChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => Promise<void>;
}

export function ConsultationNotesTab({
  clinicId,
  doctorUserId,
  reasonForVisit,
  notes,
  saving,
  patientName,
  onReasonForVisitChange,
  onNotesChange,
  onSave,
}: ConsultationNotesTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="consultation-reason-for-visit" className="text-sm font-medium">
          {t('medicalSharing.doctor.consultation.notes.reasonForVisitLabel')}
        </Label>
        <Textarea
          id="consultation-reason-for-visit"
          value={reasonForVisit}
          onChange={(event) => onReasonForVisitChange(event.target.value)}
          placeholder={t('medicalSharing.doctor.consultation.notes.reasonForVisitPlaceholder')}
          rows={3}
          data-testid="consultation-reason-for-visit-input"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t('medicalSharing.doctor.consultation.notes.clinicalNotesLabel')}</Label>
        <MedicalEditor
          value={notes}
          placeholder={t('medicalSharing.doctor.consultation.notes.clinicalNotesPlaceholder')}
          templateType="consultation_note"
          clinicId={clinicId}
          userId={doctorUserId}
          variableContext={{ patientName }}
          canSaveClinicTemplate
          editorTestId="consultation-clinical-notes-editor"
          onChange={({ text }) => onNotesChange(text)}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void onSave()} disabled={saving} data-testid="consultation-save-notes-btn">
          {saving
            ? t('medicalSharing.doctor.consultation.actions.savingSection')
            : t('medicalSharing.doctor.consultation.actions.saveNotes')}
        </Button>
      </div>
    </div>
  );
}

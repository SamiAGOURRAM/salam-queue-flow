import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import {
  procedureReportService,
  type MedicalProcedureReport,
  type MedicalProcedureReportUpsertInput,
  type MedicalReportImage,
} from '@/services/medical-records';

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

function extractPlainText(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content.map((item) => extractPlainText(item)).filter(Boolean).join(' ');
  }

  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;

    if (record.type === 'text' && typeof record.text === 'string') {
      return record.text;
    }

    if (record.content) {
      return extractPlainText(record.content);
    }

    return Object.values(record)
      .map((value) => extractPlainText(value))
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

interface UseProcedureReportOptions {
  appointmentId?: string;
  patientId?: string;
  clinicId: string;
  doctorUserId: string;
}

export function useProcedureReport(options: UseProcedureReportOptions) {
  const { appointmentId, patientId, clinicId, doctorUserId } = options;
  const { t } = useTranslation();

  const defaultTitle = t('medicalSharing.doctor.consultation.report.defaultTitle');
  const loadFailedMessage = t('medicalSharing.doctor.consultation.report.errors.loadFailed');
  const saveDraftFailedMessage = t('medicalSharing.doctor.consultation.report.errors.saveDraftFailed');
  const finalizeFailedMessage = t('medicalSharing.doctor.consultation.report.errors.finalizeFailed');
  const uploadImageFailedMessage = t('medicalSharing.doctor.consultation.report.errors.uploadImageFailed');
  const missingAppointmentContextMessage = t('medicalSharing.doctor.consultation.report.errors.missingAppointmentContext');
  const missingPatientContextMessage = t('medicalSharing.doctor.consultation.report.errors.missingPatientContext');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MedicalProcedureReport | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState<JSONContent>(EMPTY_DOC);
  const [isPatientVisible, setIsPatientVisible] = useState(true);

  const service = useMemo(() => procedureReportService, []);

  const loadReport = useCallback(async () => {
    if (!appointmentId) {
      setReport(null);
      setTitle(defaultTitle);
      setContent(EMPTY_DOC);
      setIsPatientVisible(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const latest = await service.getLatestReportByAppointment(appointmentId);
      if (!latest) {
        setReport(null);
        setTitle(defaultTitle);
        setContent(EMPTY_DOC);
        setIsPatientVisible(true);
      } else {
        setReport(latest);
        setTitle(latest.title);
        setContent(latest.content);
        setIsPatientVisible(latest.isPatientVisible);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : loadFailedMessage);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, defaultTitle, loadFailedMessage, service]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const buildUpsertPayload = useCallback(
    (status: 'draft' | 'finalized', overrideTemplateId?: string): MedicalProcedureReportUpsertInput => {
      if (!appointmentId) {
        throw new Error(missingAppointmentContextMessage);
      }

      if (!patientId) {
        throw new Error(missingPatientContextMessage);
      }

      return {
        id: report?.id,
        appointmentId,
        patientId,
        clinicId,
        authoredBy: doctorUserId,
        title: title.trim() || defaultTitle,
        content,
        contentPlainText: extractPlainText(content),
        templateId: overrideTemplateId ?? report?.templateId,
        isPatientVisible,
        status,
      };
    },
    [
      appointmentId,
      clinicId,
      content,
      defaultTitle,
      doctorUserId,
      isPatientVisible,
      missingAppointmentContextMessage,
      missingPatientContextMessage,
      patientId,
      report?.id,
      report?.templateId,
      title,
    ]
  );

  const saveDraft = useCallback(
    async (templateId?: string) => {
      setSaving(true);
      setError(null);

      try {
        const saved = await service.saveDraft(buildUpsertPayload('draft', templateId));
        setReport(saved);
        return saved;
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : saveDraftFailedMessage);
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [buildUpsertPayload, saveDraftFailedMessage, service]
  );

  const finalizeReport = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const finalized = await service.finalize(buildUpsertPayload('finalized'));
      setReport(finalized);
      return finalized;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : finalizeFailedMessage);
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [buildUpsertPayload, finalizeFailedMessage, service]);

  const uploadImage = useCallback(
    async (file: File): Promise<MedicalReportImage> => {
      setUploading(true);
      setError(null);

      try {
        let targetReportId = report?.id;

        if (!targetReportId) {
          const draft = await service.saveDraft(buildUpsertPayload('draft'));
          targetReportId = draft.id;
          setReport(draft);
        }

        const uploaded = await service.uploadImage({
          reportId: targetReportId,
          clinicId,
          uploadedBy: doctorUserId,
          file,
        });

        return uploaded;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : uploadImageFailedMessage);
        throw uploadError;
      } finally {
        setUploading(false);
      }
    },
    [buildUpsertPayload, clinicId, doctorUserId, report?.id, service, uploadImageFailedMessage]
  );

  return {
    loading,
    saving,
    uploading,
    error,
    report,
    title,
    content,
    isPatientVisible,
    setTitle,
    setContent,
    setIsPatientVisible,
    saveDraft,
    finalizeReport,
    uploadImage,
    reload: loadReport,
  };
}

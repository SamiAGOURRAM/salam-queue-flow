import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  medicalRecordWriteService,
  type ConsultationDiagnosisInput,
  type ConsultationLabResultInput,
  type ConsultationPrescriptionInput,
  type ConsultationPrintMetadata,
} from '@/services/medical-records';
import { CONSULTATION_ERROR_CODES } from '@/services/medical-records/constants/ConsultationErrorCodes';

type SaveSection = 'notes' | 'diagnoses' | 'prescriptions' | 'labResults' | null;

interface UseConsultationRecordsState {
  loading: boolean;
  error: string | null;
  savingSection: SaveSection;
  revision: string | null;
  reasonForVisit: string;
  notes: string;
  diagnoses: ConsultationDiagnosisInput[];
  prescriptions: ConsultationPrescriptionInput[];
  labResults: ConsultationLabResultInput[];
  printMetadata: ConsultationPrintMetadata | null;
  resolvedPatientId: string | null;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : CONSULTATION_ERROR_CODES.UNEXPECTED;
}

export function useConsultationRecords(options: {
  appointmentId?: string;
  patientId?: string;
  clinicId: string;
  doctorUserId: string;
}) {
  const { appointmentId, patientId, clinicId, doctorUserId } = options;
  const service = useMemo(() => medicalRecordWriteService, []);

  const [state, setState] = useState<UseConsultationRecordsState>({
    loading: false,
    error: null,
    savingSection: null,
    revision: null,
    reasonForVisit: '',
    notes: '',
    diagnoses: [],
    prescriptions: [],
    labResults: [],
    printMetadata: null,
    resolvedPatientId: null,
  });

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const loadConsultation = useCallback(async () => {
    if (!appointmentId) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: null,
        reasonForVisit: '',
        notes: '',
        diagnoses: [],
        prescriptions: [],
        labResults: [],
        printMetadata: null,
        revision: null,
        resolvedPatientId: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await service.loadConsultationRecords(appointmentId, clinicId, doctorUserId);
      setState((prev) => ({
        ...prev,
        loading: false,
        revision: data.revision,
        reasonForVisit: data.notes.reasonForVisit,
        notes: data.notes.notes,
        diagnoses: data.diagnoses.map((item) => ({ ...item })),
        prescriptions: data.prescriptions.map((item) => ({ ...item })),
        labResults: data.labResults.map((item) => ({ ...item })),
        printMetadata: data.printMetadata,
        resolvedPatientId: patientId ?? data.patientId,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: asErrorMessage(error),
      }));
    }
  }, [appointmentId, clinicId, doctorUserId, patientId, service]);

  useEffect(() => {
    void loadConsultation();
  }, [loadConsultation]);

  const getWriteContext = useCallback(() => {
    if (!appointmentId) {
      throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_MISSING_APPOINTMENT);
    }

    const resolvedPatientId = state.resolvedPatientId ?? patientId;
    if (!resolvedPatientId) {
      throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_MISSING_PATIENT);
    }

    return {
      appointmentId,
      patientId: resolvedPatientId,
      clinicId,
      doctorUserId,
    };
  }, [appointmentId, clinicId, doctorUserId, patientId, state.resolvedPatientId]);

  const saveNotes = useCallback(
    async (payload: { reasonForVisit: string; notes: string }) => {
      if (!appointmentId) {
        throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_MISSING_APPOINTMENT);
      }

      const revision = state.revision;
      if (!revision) {
        throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_STALE);
      }

      setState((prev) => ({ ...prev, savingSection: 'notes', error: null }));
      try {
        const saved = await service.saveNotes(appointmentId, payload, revision);
        setState((prev) => ({
          ...prev,
          savingSection: null,
          reasonForVisit: saved.notes.reasonForVisit,
          notes: saved.notes.notes,
          revision: saved.revision,
        }));
        return saved.notes;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          savingSection: null,
          error: asErrorMessage(error),
        }));
        throw error;
      }
    },
    [appointmentId, service, state.revision]
  );

  const saveDiagnoses = useCallback(
    async (items: ConsultationDiagnosisInput[]) => {
      const revision = state.revision;
      if (!revision) {
        throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_STALE);
      }

      setState((prev) => ({ ...prev, savingSection: 'diagnoses', error: null }));
      try {
        const saved = await service.saveDiagnoses(getWriteContext(), items, revision);
        const nextItems = saved.diagnoses.map((item) => ({ ...item }));
        setState((prev) => ({
          ...prev,
          savingSection: null,
          diagnoses: nextItems,
          revision: saved.revision,
        }));
        return nextItems;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          savingSection: null,
          error: asErrorMessage(error),
        }));
        throw error;
      }
    },
    [getWriteContext, service, state.revision]
  );

  const savePrescriptions = useCallback(
    async (items: ConsultationPrescriptionInput[]) => {
      const revision = state.revision;
      if (!revision) {
        throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_STALE);
      }

      setState((prev) => ({ ...prev, savingSection: 'prescriptions', error: null }));
      try {
        const saved = await service.savePrescriptions(getWriteContext(), items, revision);
        const nextItems = saved.prescriptions.map((item) => ({ ...item }));
        setState((prev) => ({
          ...prev,
          savingSection: null,
          prescriptions: nextItems,
          revision: saved.revision,
        }));
        return nextItems;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          savingSection: null,
          error: asErrorMessage(error),
        }));
        throw error;
      }
    },
    [getWriteContext, service, state.revision]
  );

  const saveLabResults = useCallback(
    async (items: ConsultationLabResultInput[]) => {
      const revision = state.revision;
      if (!revision) {
        throw new Error(CONSULTATION_ERROR_CODES.CONTEXT_STALE);
      }

      setState((prev) => ({ ...prev, savingSection: 'labResults', error: null }));
      try {
        const saved = await service.saveLabResults(getWriteContext(), items, revision);
        const nextItems = saved.labResults.map((item) => ({ ...item }));
        setState((prev) => ({
          ...prev,
          savingSection: null,
          labResults: nextItems,
          revision: saved.revision,
        }));
        return nextItems;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          savingSection: null,
          error: asErrorMessage(error),
        }));
        throw error;
      }
    },
    [getWriteContext, service, state.revision]
  );

  return {
    loading: state.loading,
    error: state.error,
    savingSection: state.savingSection,
    revision: state.revision,
    reasonForVisit: state.reasonForVisit,
    notes: state.notes,
    diagnoses: state.diagnoses,
    prescriptions: state.prescriptions,
    labResults: state.labResults,
    printMetadata: state.printMetadata,
    patientId: state.resolvedPatientId ?? patientId,
    setReasonForVisit: (value: string) => setState((prev) => ({ ...prev, reasonForVisit: value })),
    setNotes: (value: string) => setState((prev) => ({ ...prev, notes: value })),
    setDiagnoses: (items: ConsultationDiagnosisInput[]) => setState((prev) => ({ ...prev, diagnoses: items })),
    setPrescriptions: (items: ConsultationPrescriptionInput[]) => setState((prev) => ({ ...prev, prescriptions: items })),
    setLabResults: (items: ConsultationLabResultInput[]) => setState((prev) => ({ ...prev, labResults: items })),
    saveNotes,
    saveDiagnoses,
    savePrescriptions,
    saveLabResults,
    reload: loadConsultation,
    clearError,
  };
}

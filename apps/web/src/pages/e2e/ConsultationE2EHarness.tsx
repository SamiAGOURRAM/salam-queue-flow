import { useEffect, useRef, useState } from 'react';
import { ConsultationPanel } from '@/components/clinic/consultation';
import { Button } from '@/components/ui/button';
import {
  medicalRecordWriteService,
  procedureReportService,
  templateService,
  type ConsultationDiagnosis,
  type ConsultationDiagnosisInput,
  type ConsultationLabResult,
  type ConsultationLabResultInput,
  type ConsultationPrescription,
  type ConsultationPrescriptionInput,
  type MedicalProcedureReport,
  type MedicalProcedureReportUpsertInput,
  type MedicalReportImage,
  type MedicalTemplate,
  type MedicalTemplateCreateInput,
  type MedicalTemplateSearchInput,
} from '@/services/medical-records';
import { CONSULTATION_ERROR_CODES } from '@/services/medical-records/constants/ConsultationErrorCodes';
import { ConflictError } from '@/services/shared/errors';

const MOCK_APPOINTMENT_ID = '00000000-0000-0000-0000-00000000c001';
const MOCK_PATIENT_ID = '00000000-0000-0000-0000-00000000c002';
const MOCK_CLINIC_ID = '00000000-0000-0000-0000-00000000c003';
const MOCK_DOCTOR_ID = '00000000-0000-0000-0000-00000000c004';

interface HarnessStore {
  revision: string;
  reasonForVisit: string;
  notes: string;
  diagnoses: ConsultationDiagnosis[];
  prescriptions: ConsultationPrescription[];
  labResults: ConsultationLabResult[];
}

interface HarnessReportStore {
  report: MedicalProcedureReport | null;
  templates: MedicalTemplate[];
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const cloneDiagnoses = (items: ConsultationDiagnosis[]) => items.map((item) => ({ ...item }));
const clonePrescriptions = (items: ConsultationPrescription[]) => items.map((item) => ({ ...item }));
const cloneLabResults = (items: ConsultationLabResult[]) => items.map((item) => ({ ...item }));

function cloneTemplate(template: MedicalTemplate): MedicalTemplate {
  return {
    ...template,
    tags: [...template.tags],
    content: JSON.parse(JSON.stringify(template.content)),
    lastUsedAt: template.lastUsedAt ? new Date(template.lastUsedAt) : undefined,
    createdAt: new Date(template.createdAt),
    updatedAt: new Date(template.updatedAt),
  };
}

function cloneReport(report: MedicalProcedureReport): MedicalProcedureReport {
  return {
    ...report,
    content: JSON.parse(JSON.stringify(report.content)),
    createdAt: new Date(report.createdAt),
    updatedAt: new Date(report.updatedAt),
    finalizedAt: report.finalizedAt ? new Date(report.finalizedAt) : undefined,
  };
}

const bumpRevision = (revision: string) => new Date(Date.parse(revision) + 1000).toISOString();

function createInitialStore(): HarnessStore {
  return {
    revision: '2026-04-07T09:00:00.000Z',
    reasonForVisit: 'Persistent headache for 3 days',
    notes: 'No alarming neurological signs. Hydration advised.',
    diagnoses: [],
    prescriptions: [
      {
        id: '00000000-0000-0000-0000-00000000rx01',
        medicationName: 'Paracetamol',
        dosage: '500 mg',
        route: 'orale',
        frequency: '2 fois/jour',
        durationDays: 3,
        instructions: 'After meals',
        isPatientVisible: true,
      },
    ],
    labResults: [],
  };
}

function createInitialReportStore(): HarnessReportStore {
  const now = new Date('2026-04-07T09:00:00.000Z');

  return {
    report: null,
    templates: [
      {
        id: '00000000-0000-0000-0000-00000000tm01',
        createdBy: MOCK_DOCTOR_ID,
        clinicId: MOCK_CLINIC_ID,
        scope: 'clinic',
        templateType: 'procedure_report',
        specialty: 'generaliste',
        title: 'Procedure report baseline',
        description: 'Reusable section for procedure summary and post-care.',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Template section from harness.' }],
            },
          ],
        },
        tags: ['procedure', 'report'],
        usageCount: 0,
        lastUsedAt: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '00000000-0000-0000-0000-00000000tm02',
        createdBy: MOCK_DOCTOR_ID,
        clinicId: MOCK_CLINIC_ID,
        scope: 'clinic',
        templateType: 'prescription_combo',
        specialty: 'generaliste',
        title: 'Headache quick combo',
        description: 'Common combo for headache follow-up.',
        content: [
          {
            medicationName: 'Ibuprofen',
            dosage: '400 mg',
            route: 'oral',
            frequency: 'Twice daily',
            durationDays: 3,
            instructions: 'After meals',
            isPatientVisible: true,
          },
        ],
        tags: ['headache', 'combo'],
        usageCount: 0,
        lastUsedAt: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

export default function ConsultationE2EHarness() {
  const [serviceReady, setServiceReady] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const storeRef = useRef<HarnessStore>(createInitialStore());
  const reportStoreRef = useRef<HarnessReportStore>(createInitialReportStore());
  const templateCounterRef = useRef(3);
  const pendingPrintRef = useRef<boolean | null>(null);

  const appendEvent = (entry: string) => {
    setEvents((prev) => [...prev, entry]);
  };

  const resetHarness = () => {
    storeRef.current = createInitialStore();
    reportStoreRef.current = createInitialReportStore();
    templateCounterRef.current = 3;
    pendingPrintRef.current = null;
    setPendingPrint(false);
    setEvents([]);
    setPanelKey((prev) => prev + 1);
  };

  const forceConflict = () => {
    storeRef.current.revision = bumpRevision(storeRef.current.revision);
    appendEvent(`forced-conflict:${storeRef.current.revision}`);
  };

  useEffect(() => {
    const original = {
      loadConsultationRecords: medicalRecordWriteService.loadConsultationRecords.bind(medicalRecordWriteService),
      saveNotes: medicalRecordWriteService.saveNotes.bind(medicalRecordWriteService),
      saveDiagnoses: medicalRecordWriteService.saveDiagnoses.bind(medicalRecordWriteService),
      savePrescriptions: medicalRecordWriteService.savePrescriptions.bind(medicalRecordWriteService),
      saveLabResults: medicalRecordWriteService.saveLabResults.bind(medicalRecordWriteService),
      getLatestReportByAppointment: procedureReportService.getLatestReportByAppointment.bind(procedureReportService),
      saveDraft: procedureReportService.saveDraft.bind(procedureReportService),
      finalize: procedureReportService.finalize.bind(procedureReportService),
      uploadImage: procedureReportService.uploadImage.bind(procedureReportService),
      searchTemplates: templateService.searchTemplates.bind(templateService),
      createTemplate: templateService.createTemplate.bind(templateService),
      markTemplateUsed: templateService.markTemplateUsed.bind(templateService),
    };

    medicalRecordWriteService.loadConsultationRecords = async (appointmentId, _clinicId, _doctorUserId) => {
      await delay(40);
      const store = storeRef.current;
      return {
        appointmentId,
        patientId: MOCK_PATIENT_ID,
        revision: store.revision,
        notes: {
          reasonForVisit: store.reasonForVisit,
          notes: store.notes,
        },
        diagnoses: cloneDiagnoses(store.diagnoses),
        prescriptions: clonePrescriptions(store.prescriptions),
        labResults: cloneLabResults(store.labResults),
        printMetadata: {
          clinic: {
            name: 'Salam Queue Clinic',
            specialty: 'General Medicine',
            address: 'Avenue Hassan II',
            city: 'Casablanca',
            phone: '+212 522-00-00-00',
          },
          doctor: {
            fullName: 'Dr. Test Harness',
            specialization: 'General Practitioner',
            licenseNumber: 'MC-001',
          },
        },
      };
    };

    medicalRecordWriteService.saveNotes = async (_appointmentId, payload, expectedRevision) => {
      await delay(40);
      const store = storeRef.current;

      if (expectedRevision !== store.revision) {
        throw new ConflictError(CONSULTATION_ERROR_CODES.NOTES_CONFLICT_RELOAD);
      }

      store.reasonForVisit = payload.reasonForVisit;
      store.notes = payload.notes;
      store.revision = bumpRevision(store.revision);
      appendEvent(`save-notes:${store.revision}`);

      return {
        notes: {
          reasonForVisit: store.reasonForVisit,
          notes: store.notes,
        },
        revision: store.revision,
      };
    };

    medicalRecordWriteService.saveDiagnoses = async (_context, items, expectedRevision) => {
      await delay(40);
      const store = storeRef.current;

      if (expectedRevision !== store.revision) {
        throw new ConflictError(CONSULTATION_ERROR_CODES.CONFLICT_RELOAD);
      }

      store.diagnoses = items
        .filter((item) => item.diagnosisLabel.trim())
        .map((item, index) => ({
          ...item,
          id: item.id ?? `diag-${index + 1}`,
          diagnosisCode: item.diagnosisCode,
          diagnosisLabel: item.diagnosisLabel,
          diagnosisNotes: item.diagnosisNotes,
          isPatientVisible: item.isPatientVisible,
        }));
      store.revision = bumpRevision(store.revision);
      appendEvent(`save-diagnoses:${store.revision}`);

      return {
        diagnoses: cloneDiagnoses(store.diagnoses),
        revision: store.revision,
      };
    };

    medicalRecordWriteService.savePrescriptions = async (_context, items, expectedRevision) => {
      await delay(40);
      const store = storeRef.current;

      if (expectedRevision !== store.revision) {
        throw new ConflictError(CONSULTATION_ERROR_CODES.CONFLICT_RELOAD);
      }

      store.prescriptions = items
        .filter((item) => item.medicationName.trim())
        .map((item, index) => ({
          ...item,
          id: item.id ?? `rx-${index + 1}`,
          medicationName: item.medicationName,
          dosage: item.dosage,
          route: item.route,
          frequency: item.frequency,
          durationDays: item.durationDays,
          instructions: item.instructions,
          isPatientVisible: item.isPatientVisible,
        }));
      store.revision = bumpRevision(store.revision);
      appendEvent(`save-prescriptions:${store.revision}`);

      return {
        prescriptions: clonePrescriptions(store.prescriptions),
        revision: store.revision,
      };
    };

    medicalRecordWriteService.saveLabResults = async (_context, items, expectedRevision) => {
      await delay(40);
      const store = storeRef.current;

      if (expectedRevision !== store.revision) {
        throw new ConflictError(CONSULTATION_ERROR_CODES.CONFLICT_RELOAD);
      }

      store.labResults = items
        .filter((item) => item.testName.trim())
        .map((item, index) => ({
          ...item,
          id: item.id ?? `lab-${index + 1}`,
          testName: item.testName,
          resultValue: item.resultValue,
          unit: item.unit,
          referenceRange: item.referenceRange,
          interpretation: item.interpretation,
          isPatientVisible: item.isPatientVisible,
        }));
      store.revision = bumpRevision(store.revision);
      appendEvent(`save-labs:${store.revision}`);

      return {
        labResults: cloneLabResults(store.labResults),
        revision: store.revision,
      };
    };

    procedureReportService.getLatestReportByAppointment = async (appointmentId: string) => {
      await delay(25);
      const report = reportStoreRef.current.report;
      if (!report || report.appointmentId !== appointmentId) {
        return null;
      }

      return cloneReport(report);
    };

    procedureReportService.saveDraft = async (input: MedicalProcedureReportUpsertInput) => {
      await delay(40);
      const now = new Date();
      const existing = reportStoreRef.current.report;

      const next: MedicalProcedureReport = {
        id: input.id ?? existing?.id ?? `report-${now.getTime()}`,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        clinicId: input.clinicId,
        authoredBy: input.authoredBy,
        title: input.title,
        content: input.content,
        contentPlainText: input.contentPlainText,
        templateId: input.templateId,
        isPatientVisible: input.isPatientVisible,
        status: 'draft',
        finalizedAt: undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      reportStoreRef.current.report = next;
      appendEvent(`save-report-draft:${next.id}`);
      return cloneReport(next);
    };

    procedureReportService.finalize = async (input: MedicalProcedureReportUpsertInput) => {
      await delay(40);
      const now = new Date();
      const existing = reportStoreRef.current.report;

      const next: MedicalProcedureReport = {
        id: input.id ?? existing?.id ?? `report-${now.getTime()}`,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        clinicId: input.clinicId,
        authoredBy: input.authoredBy,
        title: input.title,
        content: input.content,
        contentPlainText: input.contentPlainText,
        templateId: input.templateId,
        isPatientVisible: input.isPatientVisible,
        status: 'finalized',
        finalizedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      reportStoreRef.current.report = next;
      appendEvent(`finalize-report:${next.id}`);
      return cloneReport(next);
    };

    procedureReportService.uploadImage = async (input: {
      reportId: string;
      clinicId: string;
      uploadedBy: string;
      file: File;
    }): Promise<MedicalReportImage> => {
      await delay(30);

      const storagePath = `${input.clinicId}/${input.reportId}/${Date.now()}-${input.file.name}`;
      const image: MedicalReportImage = {
        id: `image-${Date.now()}`,
        reportId: input.reportId,
        uploadedBy: input.uploadedBy,
        clinicId: input.clinicId,
        storagePath,
        signedUrl: `https://example.local/${encodeURIComponent(storagePath)}`,
        fileName: input.file.name,
        fileSize: input.file.size,
        mimeType: input.file.type,
        createdAt: new Date(),
      };

      appendEvent(`upload-report-image:${input.file.name}`);
      return image;
    };

    templateService.searchTemplates = async (input: MedicalTemplateSearchInput) => {
      await delay(20);

      const normalizedQuery = input.query?.trim().toLowerCase() ?? '';

      const filtered = reportStoreRef.current.templates
        .filter((template) => template.templateType === input.templateType)
        .filter((template) => {
          if (template.scope === 'clinic' && input.clinicId && template.clinicId !== input.clinicId) {
            return false;
          }

          if (template.scope === 'personal' && input.userId && template.createdBy !== input.userId) {
            return false;
          }

          if (!normalizedQuery) return true;

          return [template.title, template.description ?? '', ...template.tags]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery);
        })
        .slice(0, input.limit ?? 25)
        .map(cloneTemplate);

      return filtered;
    };

    templateService.createTemplate = async (input: MedicalTemplateCreateInput) => {
      await delay(30);

      const now = new Date();
      const nextId = `00000000-0000-0000-0000-00000000tm${templateCounterRef.current
        .toString()
        .padStart(2, '0')}`;
      templateCounterRef.current += 1;

      const next: MedicalTemplate = {
        id: nextId,
        createdBy: input.createdBy,
        clinicId: input.scope === 'clinic' ? input.clinicId : undefined,
        scope: input.scope,
        templateType: input.templateType,
        specialty: input.specialty,
        title: input.title,
        titleAr: input.titleAr,
        description: input.description,
        content: input.content,
        tags: input.tags ?? [],
        usageCount: 0,
        lastUsedAt: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      reportStoreRef.current.templates = [next, ...reportStoreRef.current.templates];
      appendEvent(`create-template:${next.id}`);
      return cloneTemplate(next);
    };

    templateService.markTemplateUsed = async (templateId: string) => {
      await delay(10);
      const now = new Date();

      reportStoreRef.current.templates = reportStoreRef.current.templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              usageCount: template.usageCount + 1,
              lastUsedAt: now,
              updatedAt: now,
            }
          : template
      );

      appendEvent(`template-used:${templateId}`);
    };

    setServiceReady(true);

    return () => {
      setServiceReady(false);
      medicalRecordWriteService.loadConsultationRecords = original.loadConsultationRecords;
      medicalRecordWriteService.saveNotes = original.saveNotes;
      medicalRecordWriteService.saveDiagnoses = original.saveDiagnoses;
      medicalRecordWriteService.savePrescriptions = original.savePrescriptions;
      medicalRecordWriteService.saveLabResults = original.saveLabResults;
      procedureReportService.getLatestReportByAppointment = original.getLatestReportByAppointment;
      procedureReportService.saveDraft = original.saveDraft;
      procedureReportService.finalize = original.finalize;
      procedureReportService.uploadImage = original.uploadImage;
      templateService.searchTemplates = original.searchTemplates;
      templateService.createTemplate = original.createTemplate;
      templateService.markTemplateUsed = original.markTemplateUsed;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6" data-testid="consultation-e2e-harness">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Consultation E2E Harness</h1>
        <p className="text-sm text-muted-foreground">
          This page mocks consultation write service responses for deterministic browser E2E tests.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={resetHarness} data-testid="reset-consultation-harness-btn">
          Reset Harness State
        </Button>
        <Button variant="outline" onClick={forceConflict} data-testid="simulate-consultation-conflict-btn">
          Simulate External Doctor Update
        </Button>
      </div>

      <section className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
        <p>
          Pending print status:{' '}
          <span className="font-semibold" data-testid="consultation-pending-print-state">
            {pendingPrint ? 'pending' : 'clear'}
          </span>
        </p>
      </section>

      {serviceReady ? (
        <ConsultationPanel
          key={panelKey}
          appointmentId={MOCK_APPOINTMENT_ID}
          patientId={MOCK_PATIENT_ID}
          clinicId={MOCK_CLINIC_ID}
          doctorUserId={MOCK_DOCTOR_ID}
          patientName="Harness Patient"
          onPrintTriggered={() => appendEvent('print-triggered')}
          onUnprintedOrdonnanceChange={(hasPendingPrint) => {
            setPendingPrint(hasPendingPrint);
            if (pendingPrintRef.current !== hasPendingPrint) {
              pendingPrintRef.current = hasPendingPrint;
              appendEvent(`pending-print:${hasPendingPrint ? 'yes' : 'no'}`);
            }
          }}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="consultation-harness-loading">
          Preparing mocked consultation service...
        </div>
      )}

      <section className="rounded-lg border border-border bg-muted/20 p-4" data-testid="consultation-e2e-event-log">
        <h2 className="text-sm font-semibold">Event log</h2>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="consultation-event-log-list">
          {events.length === 0 ? <li>no-events</li> : null}
          {events.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

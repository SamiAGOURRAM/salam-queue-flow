import { useEffect, useMemo, useRef, useState } from 'react';
import ClinicTemplates from '@/pages/clinic/ClinicTemplates';
import { templateService } from '@/services/medical-records';
import type {
  MedicalTemplate,
  MedicalTemplateCreateInput,
  MedicalTemplateSearchInput,
  PrescriptionComboTemplateItem,
  RichContent,
} from '@/services/medical-records';

const E2E_USER_ID = 'doctor-e2e-templates';
const E2E_CLINIC_ID = 'clinic-e2e-templates';

const DEFAULT_RICH_CONTENT: RichContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Template content' }],
    },
  ],
};

type TemplateUpdateInput = Partial<Omit<MedicalTemplateCreateInput, 'createdBy'>> & {
  isActive?: boolean;
};

interface HarnessStore {
  templates: MedicalTemplate[];
  nextId: number;
}

function cloneContent<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneTemplate(template: MedicalTemplate): MedicalTemplate {
  return {
    ...template,
    tags: [...template.tags],
    content: cloneContent(template.content),
    createdAt: new Date(template.createdAt),
    updatedAt: new Date(template.updatedAt),
  };
}

function buildInitialTemplates(now = new Date()): MedicalTemplate[] {
  const oneHour = 60 * 60 * 1000;

  const comboRows: PrescriptionComboTemplateItem[] = [
    {
      medicationName: 'Amoxicillin',
      dosage: '500 mg',
      route: 'oral',
      frequency: '2 times/day',
      durationDays: 7,
      instructions: 'After meals',
      isPatientVisible: true,
    },
  ];

  return [
    {
      id: 'tpl-clinic-1',
      clinicId: E2E_CLINIC_ID,
      createdBy: E2E_USER_ID,
      scope: 'clinic',
      templateType: 'consultation_note',
      title: 'Clinic Follow-up Note',
      description: 'Standardized clinic-wide follow-up note template.',
      tags: ['follow-up', 'clinic'],
      specialty: 'general',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Clinic follow-up structure and reminders.' }],
          },
        ],
      },
      usageCount: 18,
      isActive: true,
      createdAt: new Date(now.getTime() - oneHour * 20),
      updatedAt: new Date(now.getTime() - oneHour * 2),
    },
    {
      id: 'tpl-personal-1',
      clinicId: undefined,
      createdBy: E2E_USER_ID,
      scope: 'personal',
      templateType: 'consultation_note',
      title: 'Personal SOAP Note',
      description: 'My personal SOAP structure.',
      tags: ['soap', 'personal'],
      specialty: 'general',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Subjective\nObjective\nAssessment\nPlan' }],
          },
        ],
      },
      usageCount: 7,
      isActive: true,
      createdAt: new Date(now.getTime() - oneHour * 16),
      updatedAt: new Date(now.getTime() - oneHour * 3),
    },
    {
      id: 'tpl-system-1',
      clinicId: undefined,
      createdBy: 'system',
      scope: 'system',
      templateType: 'consultation_note',
      title: 'System Intake Note',
      description: 'System default intake note.',
      tags: ['system', 'intake'],
      specialty: 'general',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'System default intake checklist.' }],
          },
        ],
      },
      usageCount: 34,
      isActive: true,
      createdAt: new Date(now.getTime() - oneHour * 36),
      updatedAt: new Date(now.getTime() - oneHour * 12),
    },
    {
      id: 'tpl-combo-1',
      clinicId: E2E_CLINIC_ID,
      createdBy: E2E_USER_ID,
      scope: 'clinic',
      templateType: 'prescription_combo',
      title: 'Acute URI Combo',
      description: 'Common medications for uncomplicated URI symptoms.',
      tags: ['uri', 'combo'],
      specialty: 'general',
      content: comboRows,
      usageCount: 9,
      isActive: true,
      createdAt: new Date(now.getTime() - oneHour * 10),
      updatedAt: new Date(now.getTime() - oneHour * 4),
    },
  ];
}

function sortTemplates(templates: MedicalTemplate[]): MedicalTemplate[] {
  const scopeOrder: Record<MedicalTemplate['scope'], number> = {
    system: 0,
    clinic: 1,
    personal: 2,
  };

  return [...templates].sort((left, right) => {
    const byScope = scopeOrder[left.scope] - scopeOrder[right.scope];
    if (byScope !== 0) return byScope;

    const byUsage = right.usageCount - left.usageCount;
    if (byUsage !== 0) return byUsage;

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

export default function TemplatesE2EHarness() {
  const [events, setEvents] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const storeRef = useRef<HarnessStore>({
    templates: buildInitialTemplates(),
    nextId: 2,
  });

  const service = useMemo(() => {
    return templateService as unknown as {
      searchTemplates: (input: MedicalTemplateSearchInput) => Promise<MedicalTemplate[]>;
      createTemplate: (input: MedicalTemplateCreateInput) => Promise<MedicalTemplate>;
      updateTemplate: (templateId: string, updates: TemplateUpdateInput) => Promise<MedicalTemplate>;
      deleteTemplate: (templateId: string) => Promise<void>;
      markTemplateUsed: (templateId: string) => Promise<void>;
    };
  }, []);

  const appendEvent = (event: string) => {
    setEvents((current) => [event, ...current].slice(0, 12));
  };

  useEffect(() => {
    const originalSearch = service.searchTemplates;
    const originalCreate = service.createTemplate;
    const originalUpdate = service.updateTemplate;
    const originalDelete = service.deleteTemplate;
    const originalMarkUsed = service.markTemplateUsed;

    service.searchTemplates = async (input) => {
      const normalizedQuery = input.query.trim().toLowerCase();
      const activeTemplates = storeRef.current.templates.filter((template) => template.isActive);

      const filtered = activeTemplates.filter((template) => {
        if (template.templateType !== input.templateType) return false;

        if (template.scope === 'clinic' && input.clinicId && template.clinicId !== input.clinicId) {
          return false;
        }

        if (template.scope === 'personal' && input.userId && template.createdBy !== input.userId) {
          return false;
        }

        if (!normalizedQuery) return true;

        const haystack = [template.title, template.description ?? '', template.tags.join(' ')].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      });

      appendEvent(`search:${input.templateType}:${normalizedQuery || 'all'}`);

      return sortTemplates(filtered)
        .slice(0, input.limit ?? 25)
        .map(cloneTemplate);
    };

    service.createTemplate = async (input) => {
      const now = new Date();
      const scope = input.scope === 'clinic' && !input.clinicId ? 'personal' : input.scope;
      const nextId = `tpl-new-${storeRef.current.nextId++}`;

      const created: MedicalTemplate = {
        id: nextId,
        clinicId: scope === 'clinic' ? input.clinicId : undefined,
        createdBy: input.createdBy,
        scope,
        templateType: input.templateType,
        title: input.title,
        description: input.description,
        tags: [...input.tags],
        specialty: input.specialty,
        content: cloneContent(input.content),
        usageCount: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      storeRef.current.templates = [created, ...storeRef.current.templates];
      appendEvent(`create:${created.id}`);
      return cloneTemplate(created);
    };

    service.updateTemplate = async (templateId, updates) => {
      const now = new Date();
      let updatedTemplate: MedicalTemplate | null = null;

      storeRef.current.templates = storeRef.current.templates.map((template) => {
        if (template.id !== templateId) return template;

        const nextScope = updates.scope ?? template.scope;

        updatedTemplate = {
          ...template,
          clinicId:
            nextScope === 'clinic'
              ? (updates.clinicId ?? template.clinicId ?? E2E_CLINIC_ID)
              : undefined,
          scope: nextScope,
          templateType: updates.templateType ?? template.templateType,
          title: updates.title ?? template.title,
          description: updates.description ?? template.description,
          tags: updates.tags ? [...updates.tags] : template.tags,
          specialty: updates.specialty ?? template.specialty,
          content: updates.content ? cloneContent(updates.content) : template.content,
          isActive: updates.isActive ?? template.isActive,
          updatedAt: now,
        };

        return updatedTemplate;
      });

      if (!updatedTemplate) {
        throw new Error(`Template not found: ${templateId}`);
      }

      appendEvent(`update:${templateId}`);
      return cloneTemplate(updatedTemplate);
    };

    service.deleteTemplate = async (templateId) => {
      await service.updateTemplate(templateId, { isActive: false });
      appendEvent(`delete:${templateId}`);
    };

    service.markTemplateUsed = async (templateId) => {
      storeRef.current.templates = storeRef.current.templates.map((template) => {
        if (template.id !== templateId) return template;
        return {
          ...template,
          usageCount: template.usageCount + 1,
          updatedAt: new Date(),
        };
      });

      appendEvent(`mark-used:${templateId}`);
    };

    setIsReady(true);

    return () => {
      setIsReady(false);
      service.searchTemplates = originalSearch;
      service.createTemplate = originalCreate;
      service.updateTemplate = originalUpdate;
      service.deleteTemplate = originalDelete;
      service.markTemplateUsed = originalMarkUsed;
    };
  }, [service]);

  return (
    <div className="space-y-4 p-4" data-testid="templates-e2e-harness">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Templates E2E Harness</h1>
            <p className="text-sm text-muted-foreground">
              In-memory template service mock for deterministic CRUD and filtering tests.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => {
              storeRef.current = {
                templates: buildInitialTemplates(),
                nextId: 2,
              };
              setEvents([]);
              setSeed((current) => current + 1);
            }}
            data-testid="templates-e2e-reset"
          >
            Reset harness
          </button>
        </div>

        <div className="mt-3 rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">Recent service events</p>
          <ul className="mt-2 space-y-1 text-xs" data-testid="templates-e2e-events">
            {events.length === 0 ? <li className="text-muted-foreground">No events yet.</li> : null}
            {events.map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))}
          </ul>
        </div>
      </div>

      {isReady ? (
        <ClinicTemplates key={seed} e2eUserId={E2E_USER_ID} e2eClinicId={E2E_CLINIC_ID} />
      ) : (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground" data-testid="templates-e2e-loading">
          Initializing templates harness...
        </div>
      )}
    </div>
  );
}

import type {
  ConsultationPrescriptionInput,
  MedicalTemplate,
  MedicalTemplateCreateInput,
  MedicalTemplateSearchInput,
  TemplateVariableContext,
} from './models/MedicalRecordModels';
import { ValidationError } from '@/services/shared/errors';
import { resolveTemplateVariables } from '@/lib/editor/variable-node';
import { TemplateRepository } from './repositories/TemplateRepository';

type TemplateUpdateInput = Partial<Omit<MedicalTemplateCreateInput, 'createdBy'>> & {
  isActive?: boolean;
};

function normalizeScope(scope: MedicalTemplateCreateInput['scope'], clinicId?: string): MedicalTemplateCreateInput['scope'] {
  if (scope === 'clinic' && !clinicId) {
    return 'personal';
  }
  return scope;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export class TemplateService {
  private repository: TemplateRepository;

  constructor(repository?: TemplateRepository) {
    this.repository = repository ?? new TemplateRepository();
  }

  async searchTemplates(input: MedicalTemplateSearchInput): Promise<MedicalTemplate[]> {
    return this.repository.searchTemplates(input);
  }

  async createTemplate(input: MedicalTemplateCreateInput): Promise<MedicalTemplate> {
    if (!input.title.trim()) {
      throw new ValidationError('Template title is required');
    }

    const normalizedInput: MedicalTemplateCreateInput = {
      ...input,
      scope: normalizeScope(input.scope, input.clinicId),
    };

    if (normalizedInput.scope === 'clinic' && !normalizedInput.clinicId) {
      throw new ValidationError('Clinic template requires clinic context');
    }

    return this.repository.createTemplate(normalizedInput);
  }

  async updateTemplate(templateId: string, updates: TemplateUpdateInput): Promise<MedicalTemplate> {
    if (updates.title !== undefined && !updates.title.trim()) {
      throw new ValidationError('Template title is required');
    }

    const normalizedUpdates: TemplateUpdateInput = {
      ...updates,
      scope: updates.scope ? normalizeScope(updates.scope, updates.clinicId) : undefined,
    };

    if (normalizedUpdates.scope === 'clinic' && !normalizedUpdates.clinicId) {
      throw new ValidationError('Clinic template requires clinic context');
    }

    return this.repository.updateTemplate(templateId, normalizedUpdates);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.repository.updateTemplate(templateId, { isActive: false });
  }

  async markTemplateUsed(templateId: string): Promise<void> {
    await this.repository.incrementUsage(templateId);
  }

  applyTemplateContent(template: MedicalTemplate, context: TemplateVariableContext): unknown {
    return resolveTemplateVariables(template.content, context);
  }

  toPrescriptionItems(template: MedicalTemplate): ConsultationPrescriptionInput[] {
    if (template.templateType !== 'prescription_combo') {
      return [];
    }

    if (!Array.isArray(template.content)) {
      return [];
    }

    const rows = template.content as unknown[];

    return rows
      .map((row): ConsultationPrescriptionInput | null => {
        if (!row || typeof row !== 'object') return null;
        const record = row as Record<string, unknown>;
        const medicationName = asString(record.medicationName);

        if (!medicationName) return null;

        const next: ConsultationPrescriptionInput = {
          medicationName,
          isPatientVisible: asBoolean(record.isPatientVisible, true),
        };

        const dosage = asString(record.dosage);
        const route = asString(record.route);
        const frequency = asString(record.frequency);
        const instructions = asString(record.instructions);
        const durationDays =
          typeof record.durationDays === 'number' && Number.isFinite(record.durationDays)
            ? Math.max(1, Math.round(record.durationDays))
            : undefined;

        if (dosage) next.dosage = dosage;
        if (route) next.route = route;
        if (frequency) next.frequency = frequency;
        if (durationDays) next.durationDays = durationDays;
        if (instructions) next.instructions = instructions;

        return next;
      })
      .filter((item): item is ConsultationPrescriptionInput => item !== null);
  }
}

export const templateService = new TemplateService();

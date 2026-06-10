import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { DatabaseError, NotFoundError } from '@/services/shared/errors';
import type {
  MedicalTemplateContent,
  MedicalTemplate,
  MedicalTemplateCreateInput,
  MedicalTemplateSearchInput,
  MedicalTemplateScope,
  PrescriptionComboTemplateItem,
  RichContent,
} from '../models/MedicalRecordModels';

type TemplateRow = Database['public']['Tables']['medical_templates']['Row'];
type TemplateInsert = Database['public']['Tables']['medical_templates']['Insert'];

type TemplateUpdate = Database['public']['Tables']['medical_templates']['Update'];

function asDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function scopeRank(scope: MedicalTemplateScope): number {
  if (scope === 'system') return 0;
  if (scope === 'clinic') return 1;
  return 2;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toTemplateContent(content: TemplateRow['content']): MedicalTemplateContent {
  if (Array.isArray(content)) {
    const rows = content.filter((item) => isObjectRecord(item));
    return rows as unknown as PrescriptionComboTemplateItem[];
  }

  if (isObjectRecord(content) && typeof content.type === 'string') {
    return content as RichContent;
  }

  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  } satisfies RichContent;
}

function mapTemplate(row: TemplateRow): MedicalTemplate {
  return {
    id: row.id,
    createdBy: row.created_by ?? undefined,
    clinicId: row.clinic_id ?? undefined,
    scope: row.scope as MedicalTemplateScope,
    templateType: row.template_type as MedicalTemplate['templateType'],
    specialty: row.specialty ?? undefined,
    title: row.title,
    titleAr: row.title_ar ?? undefined,
    description: row.description ?? undefined,
    content: toTemplateContent(row.content),
    tags: Array.isArray(row.tags) ? row.tags : [],
    usageCount: row.usage_count,
    lastUsedAt: asDate(row.last_used_at),
    isActive: row.is_active,
    createdAt: asDate(row.created_at) ?? new Date(0),
    updatedAt: asDate(row.updated_at) ?? new Date(0),
  };
}

export class TemplateRepository {
  async searchTemplates(input: MedicalTemplateSearchInput): Promise<MedicalTemplate[]> {
    const limit = input.limit ?? 25;

    const buildBaseQuery = () =>
      supabase
        .from('medical_templates')
        .select('*')
        .eq('is_active', true)
        .eq('template_type', input.templateType)
        .limit(Math.max(limit, 50))
        .order('usage_count', { ascending: false })
        .order('updated_at', { ascending: false });

    let rows: TemplateRow[] = [];

    if (input.specialty) {
      const [specialtyResult, genericResult] = await Promise.all([
        buildBaseQuery().eq('specialty', input.specialty),
        buildBaseQuery().is('specialty', null),
      ]);

      if (specialtyResult.error || genericResult.error) {
        throw new DatabaseError(
          'Failed to search medical templates',
          (specialtyResult.error ?? genericResult.error) as unknown as Error,
          {
            templateType: input.templateType,
            specialty: input.specialty,
          }
        );
      }

      rows = [
        ...((specialtyResult.data as TemplateRow[] | null) ?? []),
        ...((genericResult.data as TemplateRow[] | null) ?? []),
      ];
    } else {
      const { data, error } = await buildBaseQuery();

      if (error) {
        throw new DatabaseError('Failed to search medical templates', error as unknown as Error, {
          templateType: input.templateType,
        });
      }

      rows = (data as TemplateRow[] | null) ?? [];
    }

    const dedupedRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());

    const queryText = input.query ? normalizeText(input.query) : '';
    const specialty = input.specialty ? normalizeText(input.specialty) : '';

    const filtered = dedupedRows
      .map(mapTemplate)
      .filter((template) => {
        if (specialty && template.specialty && normalizeText(template.specialty) !== specialty) {
          return false;
        }

        if (!queryText) return true;

        const haystack = [template.title, template.description, template.specialty, ...template.tags]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();

        return haystack.includes(queryText);
      })
      .sort((left, right) => {
        const rankDiff = scopeRank(left.scope) - scopeRank(right.scope);
        if (rankDiff !== 0) return rankDiff;

        if (left.usageCount !== right.usageCount) {
          return right.usageCount - left.usageCount;
        }

        return right.updatedAt.getTime() - left.updatedAt.getTime();
      })
      .slice(0, limit);

    return filtered;
  }

  async getTemplateById(templateId: string): Promise<MedicalTemplate> {
    const { data, error } = await supabase.from('medical_templates').select('*').eq('id', templateId).maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to load medical template', error as unknown as Error, { templateId });
    }

    if (!data) {
      throw new NotFoundError('Medical template', templateId);
    }

    return mapTemplate(data as TemplateRow);
  }

  async createTemplate(input: MedicalTemplateCreateInput): Promise<MedicalTemplate> {
    const payload: TemplateInsert = {
      created_by: input.createdBy,
      clinic_id: input.scope === 'clinic' ? input.clinicId ?? null : null,
      scope: input.scope,
      template_type: input.templateType,
      specialty: input.specialty?.trim() || null,
      title: input.title.trim(),
      title_ar: input.titleAr?.trim() || null,
      description: input.description?.trim() || null,
      content: input.content as TemplateInsert['content'],
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      is_active: true,
    };

    const { data, error } = await supabase.from('medical_templates').insert(payload).select('*').single();

    if (error) {
      throw new DatabaseError('Failed to create medical template', error as unknown as Error);
    }

    return mapTemplate(data as TemplateRow);
  }

  async updateTemplate(templateId: string, updates: Partial<MedicalTemplateCreateInput> & { isActive?: boolean }): Promise<MedicalTemplate> {
    const payload: TemplateUpdate = {
      clinic_id:
        updates.scope === 'clinic'
          ? updates.clinicId ?? null
          : updates.scope === 'personal' || updates.scope === 'system'
          ? null
          : undefined,
      scope: updates.scope,
      template_type: updates.templateType,
      specialty: updates.specialty ? updates.specialty.trim() : updates.specialty === '' ? null : undefined,
      title: updates.title ? updates.title.trim() : undefined,
      title_ar: updates.titleAr ? updates.titleAr.trim() : updates.titleAr === '' ? null : undefined,
      description:
        updates.description !== undefined ? (updates.description.trim() ? updates.description.trim() : null) : undefined,
      content: updates.content as TemplateUpdate['content'],
      tags: updates.tags?.map((tag) => tag.trim()).filter(Boolean),
      is_active: updates.isActive,
    };

    const { data, error } = await supabase
      .from('medical_templates')
      .update(payload)
      .eq('id', templateId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new DatabaseError('Failed to update medical template', error as unknown as Error, { templateId });
    }

    if (!data) {
      throw new NotFoundError('Medical template', templateId);
    }

    return mapTemplate(data as TemplateRow);
  }

  async incrementUsage(templateId: string): Promise<void> {
    const { data, error } = await supabase
      .from('medical_templates')
      .select('usage_count')
      .eq('id', templateId)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    const usageCount = typeof data.usage_count === 'number' ? data.usage_count : 0;

    await supabase
      .from('medical_templates')
      .update({
        usage_count: usageCount + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', templateId);
  }
}

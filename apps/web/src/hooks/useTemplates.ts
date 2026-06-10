import { useCallback, useEffect, useState } from 'react';
import { useDebounce } from './useDebounce';
import {
  templateService,
  type MedicalTemplate,
  type MedicalTemplateCreateInput,
  type MedicalTemplateType,
  type TemplateVariableContext,
} from '@/services/medical-records';

type TemplateUpdateInput = Partial<Omit<MedicalTemplateCreateInput, 'createdBy' | 'templateType'>> & {
  isActive?: boolean;
};

interface UseTemplatesOptions {
  clinicId?: string;
  userId?: string;
  templateType: MedicalTemplateType;
  specialty?: string;
  initialQuery?: string;
  limit?: number;
}

export function useTemplates(options: UseTemplatesOptions) {
  const { clinicId, userId, templateType, specialty, initialQuery = '', limit = 25 } = options;

  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MedicalTemplate[]>([]);

  const debouncedQuery = useDebounce(query, 250);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const next = await templateService.searchTemplates({
        clinicId,
        userId,
        templateType,
        specialty,
        query: debouncedQuery,
        limit,
      });
      setTemplates(next);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [clinicId, debouncedQuery, limit, specialty, templateType, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createTemplate = useCallback(
    async (input: Omit<MedicalTemplateCreateInput, 'createdBy' | 'templateType'> & { createdBy?: string }) => {
      const author = input.createdBy ?? userId;
      if (!author) {
        throw new Error('Missing user context for template creation');
      }

      const created = await templateService.createTemplate({
        ...input,
        createdBy: author,
        templateType,
      });

      setTemplates((prev) => [created, ...prev]);
      return created;
    },
    [templateType, userId]
  );

  const updateTemplate = useCallback(
    async (templateId: string, updates: TemplateUpdateInput) => {
      const normalizedClinicId =
        updates.scope === 'clinic'
          ? updates.clinicId ?? clinicId ?? undefined
          : updates.scope === 'personal'
          ? undefined
          : updates.clinicId;

      const updated = await templateService.updateTemplate(templateId, {
        ...updates,
        clinicId: normalizedClinicId,
        templateType,
      });

      setTemplates((prev) => {
        if (!updated.isActive) {
          return prev.filter((template) => template.id !== updated.id);
        }

        return prev.map((template) => (template.id === updated.id ? updated : template));
      });

      return updated;
    },
    [clinicId, templateType]
  );

  const deleteTemplate = useCallback(async (templateId: string) => {
    await templateService.deleteTemplate(templateId);
    setTemplates((prev) => prev.filter((template) => template.id !== templateId));
  }, []);

  const markTemplateUsed = useCallback(
    async (templateId: string) => {
      await templateService.markTemplateUsed(templateId);
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === templateId
            ? {
                ...template,
                usageCount: template.usageCount + 1,
                lastUsedAt: new Date(),
              }
            : template
        )
      );
    },
    []
  );

  const applyTemplate = useCallback(
    (template: MedicalTemplate, context: TemplateVariableContext) =>
      templateService.applyTemplateContent(template, context),
    []
  );

  const toPrescriptionItems = useCallback(
    (template: MedicalTemplate) => templateService.toPrescriptionItems(template),
    []
  );

  return {
    templates,
    loading,
    error,
    query,
    setQuery,
    reload,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    markTemplateUsed,
    applyTemplate,
    toPrescriptionItems,
  };
}

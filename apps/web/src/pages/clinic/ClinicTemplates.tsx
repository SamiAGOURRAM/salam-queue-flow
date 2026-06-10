import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  FileText,
  Layers,
  Pencil,
  Pill,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useClinicPermissions } from '@/hooks/useClinicPermissions';
import { useTemplates } from '@/hooks/useTemplates';
import { cn } from '@/lib/utils';
import { MedicalEditor } from '@/components/clinic/consultation/editor/MedicalEditor';
import type {
  MedicalTemplate,
  MedicalTemplateContent,
  MedicalTemplateScope,
  MedicalTemplateType,
  PrescriptionComboTemplateItem,
  RichContent,
} from '@/services/medical-records';

const EMPTY_RICH_CONTENT: RichContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

type EditableScope = Exclude<MedicalTemplateScope, 'system'>;
type ScopeFilter = 'all' | MedicalTemplateScope;

interface TemplateDraft {
  title: string;
  description: string;
  tagsText: string;
  scope: EditableScope;
  content: MedicalTemplateContent;
}

interface ClinicTemplatesProps {
  e2eUserId?: string;
  e2eClinicId?: string;
}

const TEMPLATE_TYPE_META: Record<
  MedicalTemplateType,
  {
    labelKey: string;
    subtitleKey: string;
    icon: typeof FileText;
  }
> = {
  consultation_note: {
    labelKey: 'medicalSharing.doctor.templatesWorkspace.types.consultation_note.label',
    subtitleKey: 'medicalSharing.doctor.templatesWorkspace.types.consultation_note.subtitle',
    icon: ClipboardList,
  },
  procedure_report: {
    labelKey: 'medicalSharing.doctor.templatesWorkspace.types.procedure_report.label',
    subtitleKey: 'medicalSharing.doctor.templatesWorkspace.types.procedure_report.subtitle',
    icon: FileText,
  },
  prescription_combo: {
    labelKey: 'medicalSharing.doctor.templatesWorkspace.types.prescription_combo.label',
    subtitleKey: 'medicalSharing.doctor.templatesWorkspace.types.prescription_combo.subtitle',
    icon: Pill,
  },
  report_section: {
    labelKey: 'medicalSharing.doctor.templatesWorkspace.types.report_section.label',
    subtitleKey: 'medicalSharing.doctor.templatesWorkspace.types.report_section.subtitle',
    icon: Layers,
  },
};

function asRichContent(content: MedicalTemplateContent): RichContent {
  if (!Array.isArray(content) && content && typeof content === 'object' && 'type' in content) {
    return content as RichContent;
  }

  return EMPTY_RICH_CONTENT;
}

function toPlainText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => toPlainText(item))
      .filter(Boolean)
      .join(' ');
  }

  if (typeof content === 'object') {
    const node = content as Record<string, unknown>;
    const ownText = typeof node.text === 'string' ? node.text : '';
    const childText = toPlainText(node.content);
    return [ownText, childText].filter(Boolean).join(' ').trim();
  }

  return '';
}

function normalizeTags(tagsText: string): string[] {
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeComboItems(
  items: PrescriptionComboTemplateItem[],
  options?: { keepEmpty?: boolean }
): PrescriptionComboTemplateItem[] {
  const normalizedItems = items.map((item) => ({
    medicationName: item.medicationName?.trim() ?? '',
    dosage: item.dosage?.trim() || undefined,
    route: item.route?.trim() || undefined,
    frequency: item.frequency?.trim() || undefined,
    durationDays: item.durationDays ? Math.max(1, Math.round(item.durationDays)) : undefined,
    instructions: item.instructions?.trim() || undefined,
    isPatientVisible: item.isPatientVisible ?? true,
  }));

  if (options?.keepEmpty) {
    return normalizedItems;
  }

  return normalizedItems.filter((item) => Boolean(item.medicationName));
}

function makeDraft(templateType: MedicalTemplateType, scope: EditableScope): TemplateDraft {
  return {
    title: '',
    description: '',
    tagsText: '',
    scope,
    content: templateType === 'prescription_combo' ? [] : EMPTY_RICH_CONTENT,
  };
}

function draftFromTemplate(template: MedicalTemplate): TemplateDraft {
  return {
    title: template.title,
    description: template.description ?? '',
    tagsText: template.tags.join(', '),
    scope: template.scope === 'clinic' ? 'clinic' : 'personal',
    content:
      template.templateType === 'prescription_combo'
        ? normalizeComboItems(Array.isArray(template.content) ? template.content : [])
        : asRichContent(template.content),
  };
}

function scopeBadgeClass(scope: MedicalTemplateScope): string {
  if (scope === 'system') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (scope === 'clinic') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function scopeLabel(scope: MedicalTemplateScope, t: (key: string) => string): string {
  if (scope === 'system') return t('medicalSharing.doctor.templatesWorkspace.scopeLabels.system');
  if (scope === 'clinic') return t('medicalSharing.doctor.templatesWorkspace.scopeLabels.clinic');
  return t('medicalSharing.doctor.templatesWorkspace.scopeLabels.personal');
}

interface PrescriptionComboEditorProps {
  items: PrescriptionComboTemplateItem[];
  readOnly?: boolean;
  onChange?: (items: PrescriptionComboTemplateItem[]) => void;
}

function PrescriptionComboEditor({ items, readOnly, onChange }: PrescriptionComboEditorProps) {
  const { t } = useTranslation();

  const updateItem = (
    index: number,
    field: keyof PrescriptionComboTemplateItem,
    value: string | number | boolean | undefined
  ) => {
    if (!onChange) return;

    const next = items.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      return {
        ...item,
        [field]: value,
      };
    });

    onChange(next);
  };

  const removeItem = (index: number) => {
    if (!onChange) return;
    onChange(items.filter((_, currentIndex) => currentIndex !== index));
  };

  const addItem = () => {
    if (!onChange) return;

    onChange([
      ...items,
      {
        medicationName: '',
        dosage: '',
        route: '',
        frequency: '',
        durationDays: undefined,
        instructions: '',
        isPatientVisible: true,
      },
    ]);
  };

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
          {t('medicalSharing.doctor.templatesWorkspace.details.comboEmpty')}
        </div>

        {!readOnly ? (
          <Button type="button" variant="outline" onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" />
            {t('medicalSharing.doctor.templatesWorkspace.combo.addMedication')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`combo-item-${index}`} className="rounded-xl border border-border bg-background/80 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {t('medicalSharing.doctor.templatesWorkspace.combo.itemTitle', { number: index + 1 })}
            </p>
            {!readOnly ? (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeItem(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.medicationLabel')}</Label>
              <Input
                value={item.medicationName}
                readOnly={readOnly}
                onChange={(event) => updateItem(index, 'medicationName', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.medicationPlaceholder')}
              />
            </div>

            <div className="space-y-1">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.dosageLabel')}</Label>
              <Input
                value={item.dosage ?? ''}
                readOnly={readOnly}
                onChange={(event) => updateItem(index, 'dosage', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.dosagePlaceholder')}
              />
            </div>

            <div className="space-y-1">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.routeLabel')}</Label>
              <Input
                value={item.route ?? ''}
                readOnly={readOnly}
                onChange={(event) => updateItem(index, 'route', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.routePlaceholder')}
              />
            </div>

            <div className="space-y-1">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.frequencyLabel')}</Label>
              <Input
                value={item.frequency ?? ''}
                readOnly={readOnly}
                onChange={(event) => updateItem(index, 'frequency', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.frequencyPlaceholder')}
              />
            </div>

            <div className="space-y-1">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.durationLabel')}</Label>
              <Input
                type="number"
                min={1}
                value={item.durationDays ?? ''}
                readOnly={readOnly}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  updateItem(index, 'durationDays', nextValue ? Number(nextValue) : undefined);
                }}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.durationPlaceholder')}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>{t('medicalSharing.doctor.consultation.ordonnance.instructionsLabel')}</Label>
              <Textarea
                rows={2}
                value={item.instructions ?? ''}
                readOnly={readOnly}
                onChange={(event) => updateItem(index, 'instructions', event.target.value)}
                placeholder={t('medicalSharing.doctor.consultation.ordonnance.instructionsPlaceholder')}
              />
            </div>
          </div>
        </div>
      ))}

      {!readOnly ? (
        <Button type="button" variant="outline" onClick={addItem}>
          <Plus className="mr-2 h-4 w-4" />
          {t('medicalSharing.doctor.templatesWorkspace.combo.addMedication')}
        </Button>
      ) : null}
    </div>
  );
}

export default function ClinicTemplates({ e2eUserId, e2eClinicId }: ClinicTemplatesProps = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { clinicId } = useClinicPermissions();

  const resolvedUserId = e2eUserId ?? user?.id;
  const resolvedClinicId = e2eClinicId ?? clinicId ?? undefined;

  const [activeType, setActiveType] = useState<MedicalTemplateType>('consultation_note');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingDraft, setEditingDraft] = useState<TemplateDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<TemplateDraft>(() =>
    makeDraft('consultation_note', resolvedClinicId ? 'clinic' : 'personal')
  );
  const [createSaving, setCreateSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const {
    templates,
    loading,
    error,
    query,
    setQuery,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useTemplates({
    clinicId: resolvedClinicId,
    userId: resolvedUserId,
    templateType: activeType,
    limit: 120,
  });

  const canUseClinicScope = Boolean(resolvedClinicId);

  const filteredTemplates = useMemo(() => {
    if (scopeFilter === 'all') return templates;
    return templates.filter((template) => template.scope === scopeFilter);
  }, [scopeFilter, templates]);

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [filteredTemplates, selectedTemplateId]
  );

  const selectedTypeMeta = TEMPLATE_TYPE_META[activeType];

  useEffect(() => {
    setSelectedTemplateId((current) => {
      if (!filteredTemplates.length) return null;
      if (current && filteredTemplates.some((template) => template.id === current)) {
        return current;
      }
      return filteredTemplates[0].id;
    });
  }, [filteredTemplates]);

  useEffect(() => {
    setIsEditing(false);
    setEditingDraft(null);
    setScopeFilter('all');
    setIsCreating(false);
    setCreateDraft(makeDraft(activeType, canUseClinicScope ? 'clinic' : 'personal'));
  }, [activeType, canUseClinicScope]);

  const resetCreateDraft = () => {
    setCreateDraft(makeDraft(activeType, canUseClinicScope ? 'clinic' : 'personal'));
  };

  const handleOpenCreate = () => {
    resetCreateDraft();
    setIsEditing(false);
    setEditingDraft(null);
    setIsCreating(true);
  };

  const cancelCreateMode = () => {
    setIsCreating(false);
    resetCreateDraft();
  };

  const buildContentPayload = (
    templateType: MedicalTemplateType,
    content: MedicalTemplateContent
  ): MedicalTemplateContent => {
    if (templateType === 'prescription_combo') {
      return normalizeComboItems(Array.isArray(content) ? content : []);
    }

    return asRichContent(content);
  };

  const handleCreateTemplate = async () => {
    if (!resolvedUserId) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description: t('medicalSharing.doctor.consultation.editor.errors.missingUserContext'),
        variant: 'destructive',
      });
      return;
    }

    if (!createDraft.title.trim()) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description: t('medicalSharing.doctor.templatesWorkspace.toasts.titleRequired'),
        variant: 'destructive',
      });
      return;
    }

    const contentPayload = buildContentPayload(activeType, createDraft.content);
    if (activeType === 'prescription_combo' && (!Array.isArray(contentPayload) || contentPayload.length === 0)) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description: t('medicalSharing.doctor.templatesWorkspace.toasts.comboRequired'),
        variant: 'destructive',
      });
      return;
    }

    setCreateSaving(true);

    try {
      const created = await createTemplate({
        clinicId: createDraft.scope === 'clinic' ? resolvedClinicId : undefined,
        scope: createDraft.scope,
        title: createDraft.title.trim(),
        description: createDraft.description.trim() || undefined,
        tags: normalizeTags(createDraft.tagsText),
        content: contentPayload,
      });

      setIsCreating(false);
      resetCreateDraft();
      setSelectedTemplateId(created.id);

      toast({
        title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
        description: t('medicalSharing.doctor.consultation.toasts.templateSaved'),
      });
    } catch (createError) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description:
          createError instanceof Error
            ? createError.message
            : t('medicalSharing.doctor.templatesWorkspace.toasts.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setCreateSaving(false);
    }
  };

  const startEditing = () => {
    if (!selectedTemplate || selectedTemplate.scope === 'system') return;
    setEditingDraft(draftFromTemplate(selectedTemplate));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingDraft(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedTemplate || !editingDraft) return;

    if (!editingDraft.title.trim()) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description: t('medicalSharing.doctor.templatesWorkspace.toasts.titleRequired'),
        variant: 'destructive',
      });
      return;
    }

    const contentPayload = buildContentPayload(selectedTemplate.templateType, editingDraft.content);

    if (
      selectedTemplate.templateType === 'prescription_combo' &&
      (!Array.isArray(contentPayload) || contentPayload.length === 0)
    ) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description: t('medicalSharing.doctor.templatesWorkspace.toasts.comboRequired'),
        variant: 'destructive',
      });
      return;
    }

    setEditSaving(true);

    try {
      await updateTemplate(selectedTemplate.id, {
        clinicId: editingDraft.scope === 'clinic' ? resolvedClinicId : undefined,
        scope: editingDraft.scope,
        title: editingDraft.title.trim(),
        description: editingDraft.description.trim() || undefined,
        tags: normalizeTags(editingDraft.tagsText),
        content: contentPayload,
        specialty: selectedTemplate.specialty,
      });

      setIsEditing(false);
      setEditingDraft(null);

      toast({
        title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
        description: t('medicalSharing.doctor.templatesWorkspace.toasts.updated'),
      });
    } catch (saveError) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description:
          saveError instanceof Error
            ? saveError.message
            : t('medicalSharing.doctor.templatesWorkspace.toasts.updateFailed'),
        variant: 'destructive',
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    setDeleteSaving(true);

    try {
      await deleteTemplate(selectedTemplate.id);
      setDeleteOpen(false);
      setIsEditing(false);
      setEditingDraft(null);

      toast({
        title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
        description: t('medicalSharing.doctor.templatesWorkspace.toasts.deleted'),
      });
    } catch (deleteError) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description:
          deleteError instanceof Error
            ? deleteError.message
            : t('medicalSharing.doctor.templatesWorkspace.toasts.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="clinic-templates-page">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-medium text-cyan-700">
                <Sparkles className="h-3.5 w-3.5" />
                {t('medicalSharing.doctor.templatesWorkspace.badge')}
              </p>
              <h1 className="text-2xl font-semibold text-foreground">
                {t('medicalSharing.doctor.templatesWorkspace.title')}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('medicalSharing.doctor.templatesWorkspace.description')}
              </p>
            </div>

            <Button
              type="button"
              className={cn('shadow-sm', isCreating ? 'bg-white text-foreground hover:bg-white/90' : '')}
              onClick={isCreating ? cancelCreateMode : handleOpenCreate}
              data-testid="templates-new-template-btn"
            >
              {isCreating ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {isCreating
                ? t('medicalSharing.doctor.templatesWorkspace.actions.cancel')
                : t('medicalSharing.doctor.templatesWorkspace.actions.newTemplate')}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('medicalSharing.doctor.templatesWorkspace.searchPlaceholder')}
                className="bg-white/90 pl-9"
                data-testid="templates-search-input"
              />
            </div>

            <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
              <SelectTrigger className="bg-white/90" data-testid="templates-scope-filter-trigger">
                <SelectValue placeholder={t('medicalSharing.doctor.templatesWorkspace.scopeFilterPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('medicalSharing.doctor.templatesWorkspace.scopeFilters.all')}</SelectItem>
                <SelectItem value="clinic">{t('medicalSharing.doctor.templatesWorkspace.scopeFilters.clinic')}</SelectItem>
                <SelectItem value="personal">{t('medicalSharing.doctor.templatesWorkspace.scopeFilters.personal')}</SelectItem>
                <SelectItem value="system">{t('medicalSharing.doctor.templatesWorkspace.scopeFilters.system')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeType} onValueChange={(value) => setActiveType(value as MedicalTemplateType)}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-xl bg-white/80 p-2">
              {Object.entries(TEMPLATE_TYPE_META).map(([templateType, meta]) => {
                const Icon = meta.icon;
                return (
                  <TabsTrigger
                    key={templateType}
                    value={templateType}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
                    data-testid={`templates-type-${templateType}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(meta.labelKey)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/90">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-base">{t(selectedTypeMeta.labelKey)}</CardTitle>
            <p className="text-xs text-muted-foreground">{t(selectedTypeMeta.subtitleKey)}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={`template-skeleton-${index}`} className="h-24 animate-pulse rounded-xl bg-muted/50" />
                  ))
                : null}

              {!loading && error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {!loading && !error && filteredTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  {t('medicalSharing.doctor.templatesWorkspace.list.empty')}
                </div>
              ) : null}

              {!loading &&
                filteredTemplates.map((template) => {
                  const active = template.id === selectedTemplateId;
                  const detailText =
                    template.templateType === 'prescription_combo'
                      ? t('medicalSharing.doctor.templatesWorkspace.list.medicationsCount', {
                          count: Array.isArray(template.content) ? template.content.length : 0,
                        })
                      :
                          toPlainText(template.content).slice(0, 120) ||
                          t('medicalSharing.doctor.templatesWorkspace.list.richTextFallback');

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        setIsCreating(false);
                        setSelectedTemplateId(template.id);
                        setIsEditing(false);
                        setEditingDraft(null);
                      }}
                      className={cn(
                        'w-full rounded-xl border p-3 text-left transition-all',
                        active
                          ? 'border-cyan-300 bg-cyan-50/70 shadow-sm'
                          : 'border-border bg-background hover:border-cyan-200 hover:bg-cyan-50/40'
                      )}
                      data-testid={`template-list-item-${template.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-medium text-foreground">{template.title}</p>
                        <Badge className={cn('border text-[10px] font-medium', scopeBadgeClass(template.scope))}>
                          {scopeLabel(template.scope, t)}
                        </Badge>
                      </div>

                      {template.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                      ) : null}

                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{detailText}</p>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {t('medicalSharing.doctor.templatesWorkspace.list.usedTimes', {
                            count: template.usageCount,
                          })}
                        </span>
                        <span>{template.updatedAt.toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  {isCreating
                    ? t('medicalSharing.doctor.templatesWorkspace.forms.createDialogTitle')
                    : selectedTemplate
                    ? selectedTemplate.title
                    : t('medicalSharing.doctor.templatesWorkspace.details.emptyTitle')}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isCreating
                    ? t('medicalSharing.doctor.templatesWorkspace.forms.createDialogDescription', {
                        typeLabel: t(selectedTypeMeta.labelKey).toLowerCase(),
                      })
                    : selectedTemplate
                    ? t('medicalSharing.doctor.templatesWorkspace.details.selectedDescription')
                    : t('medicalSharing.doctor.templatesWorkspace.details.emptyDescription')}
                </p>
              </div>

              {isCreating ? (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={cancelCreateMode} disabled={createSaving}>
                    {t('medicalSharing.doctor.templatesWorkspace.actions.cancel')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleCreateTemplate()}
                    disabled={createSaving}
                    data-testid="templates-create-save-btn"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {createSaving
                      ? t('medicalSharing.doctor.templatesWorkspace.actions.saving')
                      : t('medicalSharing.doctor.templatesWorkspace.actions.saveTemplate')}
                  </Button>
                </div>
              ) : selectedTemplate ? (
                <div className="flex items-center gap-2">
                  {selectedTemplate.scope !== 'system' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={isEditing ? cancelEditing : startEditing}
                      data-testid="templates-edit-btn"
                    >
                      {isEditing ? <X className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
                      {isEditing
                        ? t('medicalSharing.doctor.templatesWorkspace.actions.cancel')
                        : t('medicalSharing.doctor.templatesWorkspace.actions.edit')}
                    </Button>
                  ) : null}

                  {selectedTemplate.scope !== 'system' ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setDeleteOpen(true)}
                      data-testid="templates-delete-btn"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('medicalSharing.doctor.templatesWorkspace.actions.delete')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent>
            {isCreating ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="template-create-title">
                      {t('medicalSharing.doctor.templatesWorkspace.forms.titleLabel')}
                    </Label>
                    <Input
                      id="template-create-title"
                      value={createDraft.title}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder={t('medicalSharing.doctor.templatesWorkspace.forms.titlePlaceholder')}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="template-create-description">
                      {t('medicalSharing.doctor.templatesWorkspace.forms.descriptionLabel')}
                    </Label>
                    <Textarea
                      id="template-create-description"
                      rows={2}
                      value={createDraft.description}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder={t('medicalSharing.doctor.templatesWorkspace.forms.descriptionPlaceholder')}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="template-create-tags">
                      {t('medicalSharing.doctor.templatesWorkspace.forms.tagsLabel')}
                    </Label>
                    <Input
                      id="template-create-tags"
                      value={createDraft.tagsText}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          tagsText: event.target.value,
                        }))
                      }
                      placeholder={t('medicalSharing.doctor.templatesWorkspace.forms.tagsPlaceholder')}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>{t('medicalSharing.doctor.templatesWorkspace.forms.visibilityLabel')}</Label>
                    <Select
                      value={createDraft.scope}
                      onValueChange={(value) =>
                        setCreateDraft((current) => ({
                          ...current,
                          scope: value as EditableScope,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {canUseClinicScope ? (
                          <SelectItem value="clinic">
                            {t('medicalSharing.doctor.templatesWorkspace.scopeLabels.clinic')}
                          </SelectItem>
                        ) : null}
                        <SelectItem value="personal">
                          {t('medicalSharing.doctor.templatesWorkspace.scopeLabels.personal')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>{t('medicalSharing.doctor.templatesWorkspace.forms.contentLabel')}</Label>
                  {activeType === 'prescription_combo' ? (
                    <PrescriptionComboEditor
                      items={normalizeComboItems(Array.isArray(createDraft.content) ? createDraft.content : [], {
                        keepEmpty: true,
                      })}
                      onChange={(items) =>
                        setCreateDraft((current) => ({
                          ...current,
                          content: items,
                        }))
                      }
                    />
                  ) : (
                    <MedicalEditor
                      value={createDraft.content}
                      placeholder={t('medicalSharing.doctor.templatesWorkspace.forms.createEditorPlaceholder')}
                      templateType={activeType}
                      clinicId={resolvedClinicId}
                      userId={resolvedUserId}
                      allowDocxImport
                      allowImageUpload
                      canSaveClinicTemplate={canUseClinicScope}
                      showTemplateActions={false}
                      editorTestId="templates-create-editor"
                      onChange={({ json }) =>
                        setCreateDraft((current) => ({
                          ...current,
                          content: json,
                        }))
                      }
                    />
                  )}
                </div>
              </div>
            ) : !selectedTemplate ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                {t('medicalSharing.doctor.templatesWorkspace.details.emptyDescription')}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge className={cn('border text-[10px] font-medium', scopeBadgeClass(selectedTemplate.scope))}>
                    {scopeLabel(selectedTemplate.scope, t)}
                  </Badge>
                  <span>
                    {t('medicalSharing.doctor.templatesWorkspace.details.typePrefix')}:{' '}
                    {t(TEMPLATE_TYPE_META[selectedTemplate.templateType].labelKey)}
                  </span>
                  <span>
                    {t('medicalSharing.doctor.templatesWorkspace.details.updatedPrefix')}{' '}
                    {selectedTemplate.updatedAt.toLocaleString()}
                  </span>
                </div>

                {isEditing && editingDraft ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="template-edit-title">
                          {t('medicalSharing.doctor.templatesWorkspace.forms.titleLabel')}
                        </Label>
                        <Input
                          id="template-edit-title"
                          value={editingDraft.title}
                          onChange={(event) =>
                            setEditingDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    title: event.target.value,
                                  }
                                : current
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="template-edit-description">
                          {t('medicalSharing.doctor.templatesWorkspace.forms.descriptionLabel')}
                        </Label>
                        <Textarea
                          id="template-edit-description"
                          rows={2}
                          value={editingDraft.description}
                          onChange={(event) =>
                            setEditingDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    description: event.target.value,
                                  }
                                : current
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="template-edit-tags">
                          {t('medicalSharing.doctor.templatesWorkspace.forms.tagsLabel')}
                        </Label>
                        <Input
                          id="template-edit-tags"
                          value={editingDraft.tagsText}
                          onChange={(event) =>
                            setEditingDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    tagsText: event.target.value,
                                  }
                                : current
                            )
                          }
                          placeholder={t('medicalSharing.doctor.templatesWorkspace.forms.tagsPlaceholder')}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>{t('medicalSharing.doctor.templatesWorkspace.forms.visibilityLabel')}</Label>
                        <Select
                          value={editingDraft.scope}
                          onValueChange={(value) =>
                            setEditingDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    scope: value as EditableScope,
                                  }
                                : current
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {canUseClinicScope ? (
                              <SelectItem value="clinic">
                                {t('medicalSharing.doctor.templatesWorkspace.scopeLabels.clinic')}
                              </SelectItem>
                            ) : null}
                            <SelectItem value="personal">
                              {t('medicalSharing.doctor.templatesWorkspace.scopeLabels.personal')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>{t('medicalSharing.doctor.templatesWorkspace.forms.contentLabel')}</Label>

                      {selectedTemplate.templateType === 'prescription_combo' ? (
                        <PrescriptionComboEditor
                          items={
                            normalizeComboItems(Array.isArray(editingDraft.content) ? editingDraft.content : [], {
                              keepEmpty: true,
                            })
                          }
                          onChange={(items) =>
                            setEditingDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    content: items,
                                  }
                                : current
                            )
                          }
                        />
                      ) : (
                        <MedicalEditor
                          value={editingDraft.content}
                          placeholder={t('medicalSharing.doctor.templatesWorkspace.forms.editEditorPlaceholder')}
                          templateType={selectedTemplate.templateType}
                          clinicId={resolvedClinicId}
                          userId={resolvedUserId}
                          allowDocxImport
                          allowImageUpload
                          canSaveClinicTemplate={canUseClinicScope}
                          showTemplateActions={false}
                          editorTestId="templates-edit-editor"
                          onChange={({ json }) =>
                            setEditingDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    content: json,
                                  }
                                : current
                            )
                          }
                        />
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={cancelEditing} disabled={editSaving}>
                        {t('medicalSharing.doctor.templatesWorkspace.actions.cancel')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleSaveEdit()}
                        disabled={editSaving}
                        data-testid="templates-save-edit-btn"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {editSaving
                          ? t('medicalSharing.doctor.templatesWorkspace.actions.savingChanges')
                          : t('medicalSharing.doctor.templatesWorkspace.actions.saveChanges')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {selectedTemplate.description ? (
                      <p className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                        {selectedTemplate.description}
                      </p>
                    ) : null}

                    {selectedTemplate.tags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplate.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[11px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <Separator />

                    {selectedTemplate.templateType === 'prescription_combo' ? (
                      <PrescriptionComboEditor
                        items={
                          normalizeComboItems(Array.isArray(selectedTemplate.content) ? selectedTemplate.content : [])
                        }
                        readOnly
                      />
                    ) : (
                      <MedicalEditor
                        value={selectedTemplate.content}
                        placeholder={t('medicalSharing.doctor.templatesWorkspace.details.noPreview')}
                        templateType={selectedTemplate.templateType}
                        clinicId={resolvedClinicId}
                        userId={resolvedUserId}
                        editable={false}
                        showToolbar={false}
                        showTemplateActions={false}
                        className="rounded-xl border border-border bg-background/70 p-3"
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('medicalSharing.doctor.templatesWorkspace.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('medicalSharing.doctor.templatesWorkspace.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>
              {t('medicalSharing.doctor.templatesWorkspace.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeleteTemplate()}
              disabled={deleteSaving}
              data-testid="templates-confirm-delete-btn"
            >
              {deleteSaving
                ? t('medicalSharing.doctor.templatesWorkspace.actions.deleting')
                : t('medicalSharing.doctor.templatesWorkspace.actions.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Pill, RefreshCcw, Save, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useClinicPermissions } from '@/hooks/useClinicPermissions';
import { useMedicationCatalogManager } from '@/hooks/useMedicationCatalogManager';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { MedicationCatalogEntry } from '@/services/medical-records';

interface MedicationDraft {
  canonicalName: string;
  aliasesText: string;
}

interface ClinicMedicationsProps {
  e2eClinicId?: string;
  e2eUserId?: string;
}

function normalizeMedicationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseAliases(value: string, canonicalName: string): string[] {
  const canonicalKey = normalizeMedicationName(canonicalName).toLocaleLowerCase();
  const deduped = new Map<string, string>();

  for (const item of value.split(',')) {
    const alias = normalizeMedicationName(item);
    if (!alias) continue;

    const key = alias.toLocaleLowerCase();
    if (key === canonicalKey) continue;

    if (!deduped.has(key)) {
      deduped.set(key, alias);
    }
  }

  return Array.from(deduped.values());
}

function aliasesToText(aliases: string[]): string {
  return aliases.join(', ');
}

function hasDraftChanges(entry: MedicationCatalogEntry, draft: MedicationDraft | undefined): boolean {
  if (!draft) return false;

  const draftCanonical = normalizeMedicationName(draft.canonicalName);
  const entryCanonical = normalizeMedicationName(entry.canonicalName);
  if (draftCanonical !== entryCanonical) return true;

  const draftAliases = parseAliases(draft.aliasesText, draftCanonical);
  const entryAliases = parseAliases(aliasesToText(entry.aliases), entryCanonical);

  if (draftAliases.length !== entryAliases.length) return true;

  for (let index = 0; index < draftAliases.length; index += 1) {
    if (draftAliases[index]?.toLocaleLowerCase() !== entryAliases[index]?.toLocaleLowerCase()) {
      return true;
    }
  }

  return false;
}

export default function ClinicMedications({ e2eClinicId, e2eUserId }: ClinicMedicationsProps = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { clinicId } = useClinicPermissions();
  const activeClinicId = e2eClinicId ?? clinicId;
  const activeUserId = e2eUserId ?? user?.id;

  const {
    loading,
    error,
    query,
    includeInactive,
    entries,
    savingEntryId,
    setQuery,
    setIncludeInactive,
    reload,
    updateEntry,
  } = useMedicationCatalogManager({
    clinicId: activeClinicId,
    userId: activeUserId,
    limit: 250,
  });

  const [draftById, setDraftById] = useState<Record<string, MedicationDraft>>({});

  useEffect(() => {
    setDraftById((current) => {
      const next: Record<string, MedicationDraft> = {};

      for (const entry of entries) {
        const existing = current[entry.id];
        next[entry.id] = {
          canonicalName: existing?.canonicalName ?? entry.canonicalName,
          aliasesText: existing?.aliasesText ?? aliasesToText(entry.aliases),
        };
      }

      return next;
    });
  }, [entries]);

  const activeCount = useMemo(() => entries.filter((entry) => entry.isActive).length, [entries]);

  const updateDraft = (entryId: string, patch: Partial<MedicationDraft>) => {
    setDraftById((current) => ({
      ...current,
      [entryId]: {
        canonicalName: current[entryId]?.canonicalName ?? '',
        aliasesText: current[entryId]?.aliasesText ?? '',
        ...patch,
      },
    }));
  };

  const handleSaveDraft = async (entry: MedicationCatalogEntry) => {
    const draft = draftById[entry.id];
    if (!draft) return;

    const canonicalName = normalizeMedicationName(draft.canonicalName);
    if (!canonicalName) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description: t('medicalSharing.doctor.medicationCatalog.toasts.nameRequired'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const updated = await updateEntry(entry.id, {
        canonicalName,
        aliases: parseAliases(draft.aliasesText, canonicalName),
      });

      updateDraft(entry.id, {
        canonicalName: updated.canonicalName,
        aliasesText: aliasesToText(updated.aliases),
      });

      toast({
        title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
        description: t('medicalSharing.doctor.medicationCatalog.toasts.updated'),
      });
    } catch (saveError) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description:
          saveError instanceof Error
            ? saveError.message
            : t('medicalSharing.doctor.medicationCatalog.toasts.updateFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (entry: MedicationCatalogEntry, nextIsActive: boolean) => {
    try {
      await updateEntry(entry.id, { isActive: nextIsActive });

      toast({
        title: t('medicalSharing.doctor.consultation.toasts.savedTitle'),
        description: nextIsActive
          ? t('medicalSharing.doctor.medicationCatalog.toasts.activated')
          : t('medicalSharing.doctor.medicationCatalog.toasts.deactivated'),
      });
    } catch (toggleError) {
      toast({
        title: t('medicalSharing.doctor.consultation.toasts.saveFailedTitle'),
        description:
          toggleError instanceof Error
            ? toggleError.message
            : t('medicalSharing.doctor.medicationCatalog.toasts.updateFailed'),
        variant: 'destructive',
      });
    }
  };

  if (!activeClinicId || !activeUserId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t('medicalSharing.doctor.medicationCatalog.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('medicalSharing.doctor.medicationCatalog.missingContext')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="clinic-medication-catalog-page">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />

        <div className="relative space-y-4">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-xs font-medium text-emerald-700">
              <Pill className="h-3.5 w-3.5" />
              {t('medicalSharing.doctor.medicationCatalog.badge')}
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              {t('medicalSharing.doctor.medicationCatalog.title')}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t('medicalSharing.doctor.medicationCatalog.description')}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="bg-white/95 pl-9"
                placeholder={t('medicalSharing.doctor.medicationCatalog.searchPlaceholder')}
                data-testid="medication-catalog-search-input"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-white/95 px-3 py-2">
              <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
              <span className="text-sm text-foreground">{t('medicalSharing.doctor.medicationCatalog.showInactive')}</span>
            </div>

            <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {t('medicalSharing.doctor.medicationCatalog.actions.refresh')}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground" data-testid="medication-catalog-stats">
            {t('medicalSharing.doctor.medicationCatalog.stats', {
              total: entries.length,
              active: activeCount,
            })}
          </div>
        </div>
      </section>

      <Card className="border-border/70 bg-card/95">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('medicalSharing.doctor.medicationCatalog.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`medication-skeleton-${index}`} className="h-28 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && !error && entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              {t('medicalSharing.doctor.medicationCatalog.empty')}
            </div>
          ) : null}

          {!loading &&
            entries.map((entry) => {
              const draft = draftById[entry.id];
              const hasChanges = hasDraftChanges(entry, draft);
              const isSaving = savingEntryId === entry.id;

              return (
                <div
                  key={entry.id}
                  className={cn(
                    'rounded-xl border p-4 space-y-3',
                    entry.isActive ? 'border-border bg-background/80' : 'border-amber-200 bg-amber-50/40'
                  )}
                  data-testid={`medication-catalog-row-${entry.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className={entry.isActive ? 'text-emerald-700' : 'text-amber-700'}>
                        {entry.isActive
                          ? t('medicalSharing.doctor.medicationCatalog.status.active')
                          : t('medicalSharing.doctor.medicationCatalog.status.inactive')}
                      </Badge>

                      <span>
                        {t('medicalSharing.doctor.medicationCatalog.usage', {
                          count: entry.usageCount,
                        })}
                      </span>

                      <span>
                        {entry.lastUsedAt
                          ? t('medicalSharing.doctor.medicationCatalog.lastUsed', {
                              date: entry.lastUsedAt.toLocaleDateString(),
                            })
                          : t('medicalSharing.doctor.medicationCatalog.lastUsedNever')}
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => void handleToggleActive(entry, !entry.isActive)}
                    >
                      {entry.isActive ? (
                        <>
                          <EyeOff className="mr-2 h-4 w-4" />
                          {t('medicalSharing.doctor.medicationCatalog.actions.deactivate')}
                        </>
                      ) : (
                        <>
                          <Eye className="mr-2 h-4 w-4" />
                          {t('medicalSharing.doctor.medicationCatalog.actions.activate')}
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>{t('medicalSharing.doctor.medicationCatalog.fields.name')}</Label>
                      <Input
                        value={draft?.canonicalName ?? entry.canonicalName}
                        onChange={(event) => updateDraft(entry.id, { canonicalName: event.target.value })}
                        placeholder={t('medicalSharing.doctor.medicationCatalog.fields.namePlaceholder')}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>{t('medicalSharing.doctor.medicationCatalog.fields.aliases')}</Label>
                      <Input
                        value={draft?.aliasesText ?? aliasesToText(entry.aliases)}
                        onChange={(event) => updateDraft(entry.id, { aliasesText: event.target.value })}
                        placeholder={t('medicalSharing.doctor.medicationCatalog.fields.aliasesPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!hasChanges || isSaving}
                      onClick={() => void handleSaveDraft(entry)}
                      data-testid={`medication-catalog-save-${entry.id}`}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving
                        ? t('medicalSharing.doctor.medicationCatalog.actions.saving')
                        : t('medicalSharing.doctor.medicationCatalog.actions.save')}
                    </Button>
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { medicalRecordWriteService, type MedicationCatalogEntry } from '@/services/medical-records';

interface UseMedicationCatalogManagerOptions {
  clinicId?: string;
  userId?: string;
  limit?: number;
}

interface UpdateMedicationDraft {
  canonicalName?: string;
  aliases?: string[];
  isActive?: boolean;
}

interface UseMedicationCatalogManagerResult {
  loading: boolean;
  error: string | null;
  query: string;
  includeInactive: boolean;
  entries: MedicationCatalogEntry[];
  savingEntryId: string | null;
  setQuery: (query: string) => void;
  setIncludeInactive: (includeInactive: boolean) => void;
  reload: () => Promise<void>;
  updateEntry: (entryId: string, updates: UpdateMedicationDraft) => Promise<MedicationCatalogEntry>;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load medication catalog';
}

export function useMedicationCatalogManager(
  options: UseMedicationCatalogManagerOptions
): UseMedicationCatalogManagerResult {
  const { clinicId, userId, limit = 200 } = options;
  const service = useMemo(() => medicalRecordWriteService, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [entries, setEntries] = useState<MedicationCatalogEntry[]>([]);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clinicId) {
      setEntries([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextEntries = await service.searchMedicationCatalog({
        clinicId,
        query,
        includeInactive,
        limit,
      });
      setEntries(nextEntries);
    } catch (catalogError) {
      setError(asErrorMessage(catalogError));
    } finally {
      setLoading(false);
    }
  }, [clinicId, includeInactive, limit, query, service]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateEntry = useCallback(
    async (entryId: string, updates: UpdateMedicationDraft) => {
      if (!clinicId || !userId) {
        throw new Error('Clinic or user context missing');
      }

      setSavingEntryId(entryId);
      setError(null);

      try {
        const updated = await service.updateMedicationCatalogEntry(entryId, clinicId, {
          ...updates,
          updatedBy: userId,
        });

        setEntries((current) => current.map((entry) => (entry.id === entryId ? updated : entry)));
        return updated;
      } catch (updateError) {
        const nextError = asErrorMessage(updateError);
        setError(nextError);
        throw updateError;
      } finally {
        setSavingEntryId(null);
      }
    },
    [clinicId, service, userId]
  );

  return {
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
  };
}

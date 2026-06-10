import { useCallback, useEffect, useMemo, useState } from 'react';
import { medicalRecordWriteService } from '@/services/medical-records';

interface UseMedicationCatalogOptions {
  clinicId?: string;
  limit?: number;
}

interface UseMedicationCatalogResult {
  loading: boolean;
  error: string | null;
  suggestions: string[];
  refreshCatalog: () => Promise<void>;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load medication catalog';
}

export function useMedicationCatalog(options: UseMedicationCatalogOptions): UseMedicationCatalogResult {
  const { clinicId, limit = 120 } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const service = useMemo(() => medicalRecordWriteService, []);

  const refreshCatalog = useCallback(async () => {
    if (!clinicId) {
      setSuggestions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await service.getMedicationCatalog(clinicId, limit);
      setSuggestions(next);
    } catch (catalogError) {
      setError(asErrorMessage(catalogError));
    } finally {
      setLoading(false);
    }
  }, [clinicId, limit, service]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  return {
    loading,
    error,
    suggestions,
    refreshCatalog,
  };
}

import { useQuery } from '@tanstack/react-query';
import type { DoctorListing } from '@queuemed/core';
import { clinicService } from '@/services/clinic/ClinicService';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * Doctor search filters - agent-ready structure (mirrors core DoctorSearchParams,
 * but uses `search` for the free-text name so it reads naturally in the UI).
 */
export interface DoctorSearchFilters {
  /** Free-text provider-name query (maps to core's `name` param). */
  search?: string;
  city?: string;
  specialty?: string;
  limit?: number;
  /** Set false to suspend the query (e.g. typeahead under the min length). */
  enabled?: boolean;
}

/**
 * Smart doctor search hook — the single web-side entry point for doctor discovery.
 * - Debounces the free-text query (300ms) to avoid excessive calls
 * - Keeps previous data while loading (no flicker)
 * - Caches results (5 min)
 * - Backed by ClinicService.searchDoctors → ClinicRepository (clinics→staff→profiles)
 *
 * Powers both the landing hero typeahead and the /doctors directory.
 */
export function useDoctorSearch(filters: DoctorSearchFilters) {
  const debouncedSearch = useDebounce(filters.search, 300);

  const params = {
    search: debouncedSearch?.trim() || undefined,
    city: filters.city?.trim() || undefined,
    specialty: filters.specialty?.trim() || undefined,
    limit: filters.limit,
  };

  return useQuery<DoctorListing[]>({
    queryKey: ['doctor-search', params],
    queryFn: () =>
      clinicService.searchDoctors({
        name: params.search,
        city: params.city,
        specialty: params.specialty,
        limit: params.limit,
      }),
    enabled: filters.enabled ?? true,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
  });
}

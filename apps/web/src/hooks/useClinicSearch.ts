import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

type WorkingHoursEntry = {
  open?: string;
  close?: string;
  closed?: boolean;
};

type ClinicSettings = {
  working_hours?: Record<string, WorkingHoursEntry>;
};

type ClinicRow = {
  id: string;
  name: string;
  name_ar: string | null;
  specialty: string;
  city: string;
  address: string;
  phone: string;
  logo_url: string | null;
  settings: ClinicSettings | null;
};

type ClinicRatingStatsRow = {
  clinic_id: string | null;
  average_rating: number | null;
  total_ratings: number | null;
};

type ClinicRatingStats = {
  averageRating: number;
  totalRatings: number;
};

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseTimeToMinutes(time?: string): number | null {
  if (!time || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function buildTodayHours(settings: ClinicSettings | null): string {
  const today = dayNames[new Date().getDay()];
  const hours = settings?.working_hours?.[today];
  if (!hours || hours.closed) return 'Closed';
  return `${hours.open ?? '--:--'} - ${hours.close ?? '--:--'}`;
}

function isOpenNow(settings: ClinicSettings | null): boolean {
  const today = dayNames[new Date().getDay()];
  const hours = settings?.working_hours?.[today];
  if (!hours || hours.closed) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const open = parseTimeToMinutes(hours.open);
  const close = parseTimeToMinutes(hours.close);
  if (open === null || close === null) return false;

  if (close >= open) {
    return nowMinutes >= open && nowMinutes <= close;
  }

  // Support overnight ranges such as 22:00 - 02:00.
  return nowMinutes >= open || nowMinutes <= close;
}

function mapClinicRowToSearchResult(row: ClinicRow, ratingStats?: ClinicRatingStats): ClinicSearchResult {
  const averageRating = ratingStats?.averageRating ?? 0;
  const totalRatings = ratingStats?.totalRatings ?? 0;

  return {
    id: row.id,
    name: row.name,
    name_ar: row.name_ar,
    specialty: row.specialty,
    city: row.city,
    address: row.address,
    phone: row.phone,
    logo_url: row.logo_url,
    settings: row.settings,
    average_rating: averageRating,
    total_ratings: totalRatings,
    is_open_now: isOpenNow(row.settings),
    today_hours: buildTodayHours(row.settings),
  };
}

/**
 * Clinic search filters - Agent-ready structure
 * Can be used by UI components or AI agents
 */
export interface ClinicSearchFilters {
  search?: string;
  city?: string;
  specialty?: string;
  minRating?: number;
  sortBy?: 'name' | 'rating' | 'city';
  limit?: number;
  offset?: number;
}

/**
 * Clinic search result - matches the RPC return type
 */
export interface ClinicSearchResult {
  id: string;
  name: string;
  name_ar: string | null;
  specialty: string;
  city: string;
  address: string;
  phone: string;
  logo_url: string | null;
  settings: {
    buffer_time?: number;
    working_hours?: {
      [key: string]: {
        open?: string;
        close?: string;
        closed?: boolean;
      };
    };
    allow_walk_ins?: boolean;
    max_queue_size?: number;
    payment_methods?: {
      cash?: boolean;
      card?: boolean;
      online?: boolean;
      insurance?: boolean;
    };
    appointment_types?: Array<{
      name: string;
      label: string;
      duration: number;
      price?: number;
    }>;
    requires_appointment?: boolean;
    average_appointment_duration?: number;
  } | null;
  average_rating: number;
  total_ratings: number;
  is_open_now: boolean;
  today_hours: string;
}

/**
 * Smart clinic search hook
 * - Debounces search input (300ms)
 * - Caches results (5 min)
 * - Keeps previous data while loading (better UX)
 * - Uses clinics table directly (stale search_clinics RPC removed)
 * 
 * @param filters - Search filters (city, specialty, rating, sort, etc.)
 * @returns React Query result with clinic data
 */
export function useClinicSearch(filters: ClinicSearchFilters) {
  // Debounce search term to avoid excessive API calls
  const debouncedSearch = useDebounce(filters.search, 300);

  const debouncedFilters = {
    ...filters,
    search: debouncedSearch,
  };

  return useQuery({
    queryKey: ['clinic-search', debouncedFilters],
    queryFn: async () => {
      let query = supabase
        .from('clinics')
        .select('id, name, name_ar, specialty, city, address, phone, logo_url, settings')
        .eq('is_active', true);

      if (debouncedFilters.city) {
        query = query.eq('city', debouncedFilters.city);
      }

      if (debouncedFilters.specialty) {
        query = query.eq('specialty', debouncedFilters.specialty);
      }

      const search = debouncedFilters.search?.replace(/,/g, ' ').trim();
      if (search) {
        query = query.or(`name.ilike.%${search}%,specialty.ilike.%${search}%,city.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const clinicRows = (data || []) as ClinicRow[];
      if (clinicRows.length === 0) {
        return [];
      }

      const clinicIds = clinicRows.map((clinic) => clinic.id);
      const { data: ratingData, error: ratingError } = await supabase
        .from('clinic_rating_stats')
        .select('clinic_id, average_rating, total_ratings')
        .in('clinic_id', clinicIds);

      if (ratingError) throw ratingError;

      const ratingByClinicId = new Map<string, ClinicRatingStats>();
      for (const row of (ratingData || []) as ClinicRatingStatsRow[]) {
        if (!row.clinic_id) continue;
        ratingByClinicId.set(row.clinic_id, {
          averageRating: Number(row.average_rating ?? 0),
          totalRatings: Number(row.total_ratings ?? 0),
        });
      }

      let results = clinicRows.map((row) => mapClinicRowToSearchResult(row, ratingByClinicId.get(row.id)));

      if (typeof debouncedFilters.minRating === 'number') {
        results = results.filter((clinic) => clinic.average_rating >= debouncedFilters.minRating);
      }

      if (debouncedFilters.sortBy === 'city') {
        results = [...results].sort((a, b) =>
          a.city.localeCompare(b.city) || a.name.localeCompare(b.name)
        );
      } else if (debouncedFilters.sortBy === 'rating') {
        results = [...results].sort((a, b) => {
          if (b.average_rating !== a.average_rating) return b.average_rating - a.average_rating;
          if (b.total_ratings !== a.total_ratings) return b.total_ratings - a.total_ratings;
          return a.name.localeCompare(b.name);
        });
      } else {
        results = [...results].sort((a, b) => a.name.localeCompare(b.name));
      }

      if (typeof debouncedFilters.offset === 'number' && typeof debouncedFilters.limit === 'number') {
        results = results.slice(debouncedFilters.offset, debouncedFilters.offset + debouncedFilters.limit);
      } else if (typeof debouncedFilters.offset === 'number') {
        results = results.slice(debouncedFilters.offset);
      } else if (typeof debouncedFilters.limit === 'number') {
        results = results.slice(0, debouncedFilters.limit);
      }

      return results;
    },
    // Keep previous data while fetching new results (prevents UI flicker)
    placeholderData: (prev) => prev,
    // Cache results for 5 minutes
    staleTime: 5 * 60 * 1000,
  });
}

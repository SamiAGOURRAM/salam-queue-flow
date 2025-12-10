import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

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
 * - Agent-ready: same RPC can be called by AI chatbot
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
      const { data, error } = await supabase.rpc('search_clinics', {
        p_filters: debouncedFilters,
      });

      if (error) throw error;
      return (data || []) as ClinicSearchResult[];
    },
    // Keep previous data while fetching new results (prevents UI flicker)
    placeholderData: (prev) => prev,
    // Cache results for 5 minutes
    staleTime: 5 * 60 * 1000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';

export interface CitySuggestion {
  /** Stable key from the provider. */
  id: number;
  name: string;
  /** Region / state, e.g. "Casablanca-Settat" — disambiguates same-named cities. */
  admin1?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoResult {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const MIN_QUERY = 2;

/**
 * Live city autocomplete backed by the Open-Meteo geocoding API (keyless, CORS-friendly,
 * purpose-built for city search). Results are ranked by the provider; when a country is
 * selected we keep that country's matches first and drop the rest so the dropdown reflects
 * the user's chosen country.
 *
 * @param query       free-text city query (debounced internally)
 * @param countryCode ISO alpha-2 of the selected country (prioritized / filtered)
 * @param language    UI language for localized place names
 */
export function useCitySearch(query: string, countryCode: string | undefined, language = 'en') {
  const debounced = useDebounce(query?.trim() ?? '', 300);

  return useQuery<CitySuggestion[]>({
    queryKey: ['city-search', debounced, countryCode, language],
    enabled: debounced.length >= MIN_QUERY,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const url =
        `${ENDPOINT}?name=${encodeURIComponent(debounced)}` +
        `&count=20&language=${encodeURIComponent(language)}&format=json`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
      const data = (await res.json()) as { results?: OpenMeteoResult[] };

      const all: CitySuggestion[] = (data.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        admin1: r.admin1,
        country: r.country ?? '',
        countryCode: (r.country_code ?? '').toUpperCase(),
        latitude: r.latitude,
        longitude: r.longitude,
      }));

      // Prioritize the selected country; if it yields matches, restrict to it so the
      // suggestions are unambiguous. Otherwise fall back to the global ranking.
      if (countryCode) {
        const inCountry = all.filter((c) => c.countryCode === countryCode.toUpperCase());
        if (inCountry.length > 0) return inCountry.slice(0, 8);
      }
      return all.slice(0, 8);
    },
  });
}

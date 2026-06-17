import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/services/shared/logging/Logger';

export type LocationStatus = 'detecting' | 'detected' | 'fallback';
export type LocationSource = 'ip' | 'gps' | null;

interface DetectedLocation {
  /** Detected city name, or null when detection failed (caller renders the country fallback). */
  city: string | null;
  status: LocationStatus;
  source: LocationSource;
  /** True while a GPS lookup is in flight (the opt-in path). */
  isLocating: boolean;
  /**
   * Opt-in precise location. Triggers the browser GPS prompt ONLY when called.
   * On success resolves the coordinates to a city (preferring a match in `knownCities`).
   * On denial/error it is a no-op — the IP/fallback city is kept.
   */
  requestPreciseLocation: (knownCities?: string[]) => void;
}

const IP_LOOKUP_URL = 'https://ipapi.co/json/';
const IP_TIMEOUT_MS = 3000;
const GPS_TIMEOUT_MS = 10000;

/** Pick the best matching known city for a detected name, else return the detected name as-is. */
function matchKnownCity(detected: string, knownCities?: string[]): string {
  if (!knownCities || knownCities.length === 0) return detected;
  const lower = detected.toLowerCase();
  const exact = knownCities.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const contains = knownCities.find(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()),
  );
  return contains ?? detected;
}

/**
 * Detects the visitor's city for the landing hero with minimum friction:
 * - On mount, a silent client-side IP lookup (no permission prompt) prefills the city.
 * - Any failure/timeout falls back to `city: null` (status 'fallback') so the UI can
 *   show the country default — the hero never blocks on this.
 * - `requestPreciseLocation()` is the explicit GPS opt-in, wired to a user gesture.
 */
export function useDetectedLocation(): DetectedLocation {
  const [city, setCity] = useState<string | null>(null);
  const [status, setStatus] = useState<LocationStatus>('detecting');
  const [source, setSource] = useState<LocationSource>(null);
  const [isLocating, setIsLocating] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IP_TIMEOUT_MS);

    (async () => {
      try {
        const res = await fetch(IP_LOOKUP_URL, { signal: controller.signal });
        if (!res.ok) throw new Error(`IP lookup HTTP ${res.status}`);
        const data: unknown = await res.json();
        const detected =
          data && typeof data === 'object' && typeof (data as { city?: unknown }).city === 'string'
            ? ((data as { city: string }).city).trim()
            : '';
        if (!mountedRef.current) return;
        if (detected) {
          setCity(detected);
          setSource('ip');
          setStatus('detected');
        } else {
          setStatus('fallback');
        }
      } catch (error) {
        // Network/timeout/abort → silent fallback to the country default. Never throw to the UI.
        if (mountedRef.current) setStatus('fallback');
        if ((error as Error)?.name !== 'AbortError') {
          logger.debug('IP geolocation unavailable, using fallback', { error: (error as Error)?.message });
        }
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const requestPreciseLocation = useCallback((knownCities?: string[]) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const url =
            `https://api.bigdatacloud.net/data/reverse-geocode-client` +
            `?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Reverse geocode HTTP ${res.status}`);
          const data = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string };
          const detected = (data.city || data.locality || data.principalSubdivision || '').trim();
          if (!mountedRef.current) return;
          if (detected) {
            setCity(matchKnownCity(detected, knownCities));
            setSource('gps');
            setStatus('detected');
          }
        } catch (error) {
          // Keep the existing IP/fallback city; precise lookup is best-effort only.
          logger.debug('Precise location lookup failed, keeping current', { error: (error as Error)?.message });
        } finally {
          if (mountedRef.current) setIsLocating(false);
        }
      },
      (error) => {
        // Permission denied / unavailable → keep current city, no UI error.
        if (mountedRef.current) setIsLocating(false);
        logger.debug('GPS permission denied or unavailable', { code: error.code });
      },
      { timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }, []);

  return { city, status, source, isLocating, requestPreciseLocation };
}

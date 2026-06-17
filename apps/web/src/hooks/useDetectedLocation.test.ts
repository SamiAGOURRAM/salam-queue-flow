import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDetectedLocation } from './useDetectedLocation';

describe('useDetectedLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefills the city from a successful IP lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ city: 'Rabat' }),
      }),
    );

    const { result } = renderHook(() => useDetectedLocation());

    await waitFor(() => expect(result.current.status).toBe('detected'));
    expect(result.current.city).toBe('Rabat');
    expect(result.current.source).toBe('ip');
  });

  it('falls back (city = null) when the IP lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { result } = renderHook(() => useDetectedLocation());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.city).toBeNull();
    expect(result.current.source).toBeNull();
  });

  it('falls back when the IP payload has no city', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useDetectedLocation());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.city).toBeNull();
  });

  it('keeps the current city when GPS permission is denied', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ city: 'Fes' }) }),
    );
    const getCurrentPosition = vi.fn((_success, error) => {
      error?.({ code: 1 } as GeolocationPositionError);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useDetectedLocation());
    await waitFor(() => expect(result.current.city).toBe('Fes'));

    result.current.requestPreciseLocation();

    await waitFor(() => expect(result.current.isLocating).toBe(false));
    // IP-detected city is preserved on denial.
    expect(result.current.city).toBe('Fes');
    expect(getCurrentPosition).toHaveBeenCalled();
  });
});

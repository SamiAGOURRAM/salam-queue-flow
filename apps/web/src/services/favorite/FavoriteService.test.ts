import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoriteService } from './FavoriteService';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('../shared/logging/Logger');

function createBuilder() {
  const builder: Record<string, any> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.maybeSingle = vi.fn();
  builder.single = vi.fn();
  return builder;
}

describe('FavoriteService', () => {
  let service: FavoriteService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FavoriteService();
  });

  it('returns true when clinic is favorited', async () => {
    const builder = createBuilder();
    builder.maybeSingle.mockResolvedValue({ data: { id: 'fav-1' }, error: null });
    fromMock.mockReturnValue(builder);

    const result = await service.isFavorited('clinic-1', 'user-1');

    expect(result).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('patient_favorites');
  });

  it('returns false when favorite check fails', async () => {
    const builder = createBuilder();
    builder.maybeSingle.mockResolvedValue({ data: null, error: new Error('boom') });
    fromMock.mockReturnValue(builder);

    const result = await service.isFavorited('clinic-1', 'user-1');

    expect(result).toBe(false);
  });

  it('maps user favorites to clinic ids', async () => {
    const builder = createBuilder();
    builder.order.mockResolvedValue({
      data: [{ clinic_id: 'clinic-1' }, { clinic_id: 'clinic-2' }],
      error: null,
    });
    fromMock.mockReturnValue(builder);

    const result = await service.getUserFavorites('user-1');

    expect(result).toEqual(['clinic-1', 'clinic-2']);
    expect(fromMock).toHaveBeenCalledWith('patient_favorites');
  });

  it('upserts favorite record through insert select single flow', async () => {
    const builder = createBuilder();
    builder.single.mockResolvedValue({
      data: {
        id: 'fav-1',
        clinic_id: 'clinic-1',
        patient_id: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    fromMock.mockReturnValue(builder);

    const result = await service.addFavorite('clinic-1', 'user-1');

    expect(result.clinic_id).toBe('clinic-1');
    expect(result.patient_id).toBe('user-1');
    expect(fromMock).toHaveBeenCalledWith('patient_favorites');
  });

  it('returns zero favorite count when stats query fails', async () => {
    const builder = createBuilder();
    builder.maybeSingle.mockResolvedValue({ data: null, error: new Error('boom') });
    fromMock.mockReturnValue(builder);

    const result = await service.getClinicFavoriteCount('clinic-1');

    expect(result).toBe(0);
    expect(fromMock).toHaveBeenCalledWith('clinic_favorite_stats');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RatingService } from './RatingService';

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
  builder.range = vi.fn();
  builder.upsert = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.maybeSingle = vi.fn();
  builder.single = vi.fn();
  return builder;
}

describe('RatingService', () => {
  let service: RatingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RatingService();
  });

  it('returns null stats for not found row', async () => {
    const builder = createBuilder();
    builder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    fromMock.mockReturnValue(builder);

    const result = await service.getClinicRatingStats('clinic-1');

    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledWith('clinic_rating_stats');
  });

  it('returns paginated clinic ratings', async () => {
    const builder = createBuilder();
    builder.range.mockResolvedValue({
      data: [
        {
          id: 'r-1',
          clinic_id: 'clinic-1',
          patient_id: 'user-1',
          rating: 5,
          review_text: 'Great',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
      count: 1,
    });
    fromMock.mockReturnValue(builder);

    const result = await service.getClinicRatings('clinic-1', { limit: 10, offset: 0 });

    expect(result.count).toBe(1);
    expect(result.data[0].rating).toBe(5);
    expect(fromMock).toHaveBeenCalledWith('clinic_ratings');
  });

  it('rejects invalid rating value before DB call', async () => {
    await expect(service.upsertRating('clinic-1', 'user-1', 6, 'bad')).rejects.toThrow(
      'Rating must be between 1 and 5'
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('upserts rating with unique conflict target', async () => {
    const builder = createBuilder();
    builder.single.mockResolvedValue({
      data: {
        id: 'r-1',
        clinic_id: 'clinic-1',
        patient_id: 'user-1',
        rating: 4,
        review_text: 'Nice',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    fromMock.mockReturnValue(builder);

    const result = await service.upsertRating('clinic-1', 'user-1', 4, 'Nice');

    expect(result.rating).toBe(4);
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        clinic_id: 'clinic-1',
        patient_id: 'user-1',
        rating: 4,
        review_text: 'Nice',
      },
      {
        onConflict: 'clinic_id,patient_id',
      }
    );
  });

  it('returns empty distribution when stats are missing', async () => {
    const builder = createBuilder();
    builder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    fromMock.mockReturnValue(builder);

    const result = await service.getRatingDistribution('clinic-1');

    expect(result).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});

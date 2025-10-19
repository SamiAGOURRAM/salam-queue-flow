import { supabase } from '@/integrations/supabase/client';
import { Logger } from '@/services/shared/logging/Logger';
import type { ClinicRating, ClinicRatingStats } from '@/integrations/supabase/types';

export class RatingService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
    this.logger.setContext({ service: 'RatingService' }); // Use setContext instead
  }

  async getClinicRatingStats(clinicId: string): Promise<ClinicRatingStats | null> {
    try {
      const { data, error } = await supabase
        .from('clinic_rating_stats')
        .select('*')
        .eq('clinic_id', clinicId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to get clinic rating stats', error as Error, { clinicId });
      throw error;
    }
  }

  async getUserRating(clinicId: string, userId: string): Promise<ClinicRating | null> {
    try {
      const { data, error } = await supabase
        .from('clinic_ratings')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('patient_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Failed to get user rating', error as Error, { clinicId, userId });
      throw error;
    }
  }

  async getClinicRatings(
    clinicId: string,
    options: { limit?: number; offset?: number; orderBy?: 'created_at' | 'rating' } = {}
  ): Promise<{ data: ClinicRating[]; count: number }> {
    try {
      const { limit = 10, offset = 0, orderBy = 'created_at' } = options;

      const query = supabase
        .from('clinic_ratings')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order(orderBy, { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return { data: data || [], count: count || 0 };
    } catch (error) {
      this.logger.error('Failed to get clinic ratings', error as Error, { clinicId });
      throw error;
    }
  }

  async upsertRating(
    clinicId: string,
    userId: string,
    rating: number,
    reviewText?: string
  ): Promise<ClinicRating> {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      const { data, error } = await supabase
        .from('clinic_ratings')
        .upsert({
          clinic_id: clinicId,
          patient_id: userId,
          rating,
          review_text: reviewText || null,
        })
        .select()
        .single();

      if (error) throw error;

      this.logger.info('Rating upserted', { clinicId, userId, rating });
      return data;
    } catch (error) {
      this.logger.error('Failed to upsert rating', error as Error, { clinicId, userId, rating });
      throw error;
    }
  }

  async deleteRating(clinicId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('clinic_ratings')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('patient_id', userId);

      if (error) throw error;

      this.logger.info('Rating deleted', { clinicId, userId });
    } catch (error) {
      this.logger.error('Failed to delete rating', error as Error, { clinicId, userId });
      throw error;
    }
  }

  async getRatingDistribution(clinicId: string): Promise<{
    [key: number]: number;
  }> {
    try {
      const stats = await this.getClinicRatingStats(clinicId);
      
      if (!stats) {
        return { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      }

      return {
        5: stats.five_star_count,
        4: stats.four_star_count,
        3: stats.three_star_count,
        2: stats.two_star_count,
        1: stats.one_star_count,
      };
    } catch (error) {
      this.logger.error('Failed to get rating distribution', error as Error, { clinicId });
      throw error;
    }
  }
}

export const ratingService = new RatingService();
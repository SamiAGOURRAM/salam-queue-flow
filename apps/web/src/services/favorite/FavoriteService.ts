import { supabase } from '@/integrations/supabase/client';
import { Logger } from '@/services/shared/logging/Logger';
import type { PatientFavorite } from '@/integrations/supabase/types';

export class FavoriteService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
    this.logger.setContext({ service: 'FavoriteService' });
  }

  async isFavorited(clinicId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('patient_favorites')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('patient_id', userId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      this.logger.error('Failed to check if favorited', error as Error, { clinicId, userId });
      return false;
    }
  }

  async getUserFavorites(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('patient_favorites')
        .select('clinic_id')
        .eq('patient_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data?.map(f => f.clinic_id) || [];
    } catch (error) {
      this.logger.error('Failed to get user favorites', error as Error, { userId });
      throw error;
    }
  }

  async toggleFavorite(clinicId: string, userId: string): Promise<boolean> {
    try {
      const isFav = await this.isFavorited(clinicId, userId);

      if (isFav) {
        await this.removeFavorite(clinicId, userId);
        return false;
      } else {
        await this.addFavorite(clinicId, userId);
        return true;
      }
    } catch (error) {
      this.logger.error('Failed to toggle favorite', error as Error, { clinicId, userId });
      throw error;
    }
  }

  async addFavorite(clinicId: string, userId: string): Promise<PatientFavorite> {
    try {
      const { data, error } = await supabase
        .from('patient_favorites')
        .insert({
          clinic_id: clinicId,
          patient_id: userId,
        })
        .select()
        .single();

      if (error) throw error;

      this.logger.info('Favorite added', { clinicId, userId });
      return data;
    } catch (error) {
      this.logger.error('Failed to add favorite', error as Error, { clinicId, userId });
      throw error;
    }
  }

  async removeFavorite(clinicId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('patient_favorites')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('patient_id', userId);

      if (error) throw error;

      this.logger.info('Favorite removed', { clinicId, userId });
    } catch (error) {
      this.logger.error('Failed to remove favorite', error as Error, { clinicId, userId });
      throw error;
    }
  }

  async getClinicFavoriteCount(clinicId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('clinic_favorite_stats')
        .select('total_favorites')
        .eq('clinic_id', clinicId)
        .maybeSingle();

      if (error) throw error;
      return data?.total_favorites || 0;
    } catch (error) {
      this.logger.error('Failed to get favorite count', error as Error, { clinicId });
      return 0;
    }
  }
}

export const favoriteService = new FavoriteService();
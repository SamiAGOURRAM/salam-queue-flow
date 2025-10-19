import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ratingService } from '@/services/rating/RatingService';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export function useClinicRating(clinicId: string) {
  const { user } = useAuth();

  // Get rating stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['clinic-rating-stats', clinicId],
    queryFn: () => ratingService.getClinicRatingStats(clinicId),
  });

  // Get user's rating
  const { data: userRating, isLoading: userRatingLoading } = useQuery({
    queryKey: ['user-rating', clinicId, user?.id],
    queryFn: () => user ? ratingService.getUserRating(clinicId, user.id) : null,
    enabled: !!user,
  });

  return {
    stats,
    userRating,
    isLoading: statsLoading || userRatingLoading,
  };
}

export function useUpsertRating(clinicId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rating, review }: { rating: number; review?: string }) => {
      if (!user) throw new Error('Must be logged in to rate');
      return ratingService.upsertRating(clinicId, user.id, rating, review);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-rating-stats', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['user-rating', clinicId] });
      toast({
        title: 'Rating submitted',
        description: 'Thank you for your feedback!',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to submit rating',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
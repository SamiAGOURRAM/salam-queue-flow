import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { favoriteService } from '@/services/favorite/FavoriteService';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export function useFavorite(clinicId: string) {
  const { user } = useAuth();

  const { data: isFavorited, isLoading } = useQuery({
    queryKey: ['favorite', clinicId, user?.id],
    queryFn: () => user ? favoriteService.isFavorited(clinicId, user.id) : false,
    enabled: !!user,
  });

  return { isFavorited: isFavorited || false, isLoading };
}

export function useToggleFavorite(clinicId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Must be logged in');
      return favoriteService.toggleFavorite(clinicId, user.id);
    },
    onMutate: async () => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['favorite', clinicId] });
      const previous = queryClient.getQueryData(['favorite', clinicId, user?.id]);
      
      queryClient.setQueryData(['favorite', clinicId, user?.id], (old: boolean) => !old);
      
      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['favorite', clinicId, user?.id], context.previous);
      }
      toast({
        title: 'Failed to update favorite',
        description: 'Please try again',
        variant: 'destructive',
      });
    },
    onSuccess: (isFavorited) => {
      toast({
        title: isFavorited ? 'Added to favorites' : 'Removed from favorites',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite', clinicId] });
    },
  });
}
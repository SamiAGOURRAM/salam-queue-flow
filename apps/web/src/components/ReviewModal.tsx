import { useState, useEffect } from "react";
import { Star, X, MessageSquare, Edit2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ratingService } from "@/services/rating/RatingService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ClinicRating, ClinicRatingStats } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string;
  clinicName: string;
}

// Simple date formatter
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
};

export default function ReviewModal({ isOpen, onClose, clinicId, clinicName }: ReviewModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [hoveredRating, setHoveredRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const reviewsPerPage = 5;

  // Fetch rating statistics
  const { data: ratingStats } = useQuery<ClinicRatingStats | null>({
    queryKey: ["clinic-rating-stats", clinicId],
    queryFn: () => ratingService.getClinicRatingStats(clinicId),
    enabled: isOpen,
  });

  // Fetch user's existing rating
  const { data: userRating, isLoading: loadingUserRating } = useQuery<ClinicRating | null>({
    queryKey: ["user-rating", clinicId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return ratingService.getUserRating(clinicId, user.id);
    },
    enabled: isOpen && !!user?.id,
  });

  // Fetch all reviews with pagination
  const { data: reviewsData, isLoading: loadingReviews } = useQuery<{ data: ClinicRating[]; count: number }>({
    queryKey: ["clinic-reviews", clinicId, currentPage],
    queryFn: () => {
      const offset = (currentPage - 1) * reviewsPerPage;
      return ratingService.getClinicRatings(clinicId, {
        limit: reviewsPerPage,
        offset: offset,
      });
    },
    enabled: isOpen,
  });

  // Initialize form with existing review
  useEffect(() => {
    if (userRating) {
      setSelectedRating(userRating.rating);
      setReviewText(userRating.review_text || "");
      setIsEditing(false);
    } else {
      setSelectedRating(0);
      setReviewText("");
      setIsEditing(true);
    }
  }, [userRating]);

  // Submit/Update rating mutation
  const submitRatingMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      if (selectedRating === 0) throw new Error("Please select a rating");
      
      return ratingService.upsertRating(
        clinicId,
        user.id,
        selectedRating,
        reviewText.trim() || undefined
      );
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["clinic-rating-stats", clinicId] });
      queryClient.invalidateQueries({ queryKey: ["user-rating", clinicId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["clinic-reviews", clinicId] });
      
      toast({
        title: userRating ? "Review updated!" : "Review submitted!",
        description: "Thank you for sharing your feedback.",
      });
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : "Failed to submit review";
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  // Delete rating mutation
  const deleteRatingMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      return ratingService.deleteRating(clinicId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-rating-stats", clinicId] });
      queryClient.invalidateQueries({ queryKey: ["user-rating", clinicId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["clinic-reviews", clinicId] });
      
      toast({
        title: "Review deleted",
        description: "Your review has been removed.",
      });
      
      setSelectedRating(0);
      setReviewText("");
      setIsEditing(true);
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : "Failed to delete review";
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const handleStarClick = (rating: number) => {
    if (isEditing || !userRating) {
      setSelectedRating(rating);
    }
  };

  const handleSubmit = () => {
    submitRatingMutation.mutate();
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete your review?")) {
      deleteRatingMutation.mutate();
    }
  };

  const renderStars = (rating: number, interactive = false) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "w-5 h-5 transition-all",
              interactive && "cursor-pointer hover:scale-110",
              star <= (interactive && hoveredRating > 0 ? hoveredRating : rating)
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            )}
            onClick={() => interactive && handleStarClick(star)}
            onMouseEnter={() => interactive && setHoveredRating(star)}
            onMouseLeave={() => interactive && setHoveredRating(0)}
          />
        ))}
      </div>
    );
  };

  const renderRatingBar = (starCount: number, count: number) => {
    const total = ratingStats?.total_ratings || 1;
    const percentage = (count / total) * 100;
    
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 w-10">
          <span className="text-xs font-medium text-foreground">{starCount}</span>
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
        </div>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
      </div>
    );
  };

  if (!isOpen) return null;

  const totalPages = Math.ceil((reviewsData?.count || 0) / reviewsPerPage);
  const canEdit = isEditing || !userRating;

  return (
    <div className="fixed inset-0 bg-obsidian/60 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-[8px] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Premium Header */}
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[4px] bg-foreground flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-background" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Reviews & Ratings</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{clinicName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-[4px] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Rating Overview */}
          {ratingStats && ratingStats.total_ratings > 0 && (
            <div className="bg-muted/50 rounded-[4px] p-5">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Average Rating */}
                <div className="text-center md:border-r border-border">
                  <div className="text-4xl font-bold text-foreground mb-2">
                    {ratingStats.average_rating.toFixed(1)}
                  </div>
                  <div className="flex justify-center mb-2">
                    {renderStars(Math.round(ratingStats.average_rating))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Based on <span className="font-medium text-foreground">{ratingStats.total_ratings}</span> reviews
                  </p>
                </div>

                {/* Rating Distribution */}
                <div className="space-y-2">
                  {renderRatingBar(5, ratingStats.five_star_count)}
                  {renderRatingBar(4, ratingStats.four_star_count)}
                  {renderRatingBar(3, ratingStats.three_star_count)}
                  {renderRatingBar(2, ratingStats.two_star_count)}
                  {renderRatingBar(1, ratingStats.one_star_count)}
                </div>
              </div>
            </div>
          )}

          {/* Your Review Section */}
          <div className="border border-border rounded-[4px] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Review</p>
              {userRating && !isEditing && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-8 text-xs rounded-[4px]"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="h-8 text-xs rounded-[4px] text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deleteRatingMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              )}
            </div>

            {loadingUserRating ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-foreground border-t-transparent"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Star Rating */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Rate your experience *
                  </label>
                  {renderStars(selectedRating, canEdit)}
                  {selectedRating > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedRating === 5 && "Excellent!"}
                      {selectedRating === 4 && "Very Good"}
                      {selectedRating === 3 && "Good"}
                      {selectedRating === 2 && "Fair"}
                      {selectedRating === 1 && "Needs Improvement"}
                    </p>
                  )}
                </div>

                {/* Review Text */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Share your experience (optional)
                  </label>
                  <Textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Tell us about your visit..."
                    className="min-h-[80px] resize-none rounded-[4px] border-border/60"
                    disabled={!canEdit}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {reviewText.length}/500
                  </p>
                </div>

                {/* Action Buttons */}
                {canEdit && (
                  <div className="flex gap-3">
                    <Button
                      onClick={handleSubmit}
                      disabled={selectedRating === 0 || submitRatingMutation.isPending}
                      className="rounded-[4px] bg-foreground text-background hover:bg-foreground/90"
                    >
                      {submitRatingMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                          Submitting...
                        </span>
                      ) : userRating ? (
                        "Update Review"
                      ) : (
                        "Submit Review"
                      )}
                    </Button>
                    {isEditing && userRating && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedRating(userRating.rating);
                          setReviewText(userRating.review_text || "");
                          setIsEditing(false);
                        }}
                        className="rounded-[4px]"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}

                {userRating && !isEditing && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed on {formatDate(userRating.created_at)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* All Reviews */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">All Reviews</p>
              {reviewsData?.count && reviewsData.count > 0 && (
                <Badge variant="outline" className="rounded-[4px] text-xs">
                  {reviewsData.count} reviews
                </Badge>
              )}
            </div>

            {loadingReviews ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-foreground border-t-transparent"></div>
              </div>
            ) : !reviewsData?.data || reviewsData.data.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-[4px]">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No reviews yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reviewsData.data.map((review: ClinicRating) => (
                  <div
                    key={review.id}
                    className={cn(
                      "rounded-[4px] p-4 border",
                      review.patient_id === user?.id
                        ? "border-foreground/20 bg-muted/30"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">
                            {review.patient_id === user?.id ? "You" : "Patient"}
                          </span>
                          {review.patient_id === user?.id && (
                            <Badge className="bg-foreground text-background text-[10px] px-1.5 py-0">Your Review</Badge>
                          )}
                        </div>
                        {renderStars(review.rating)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(review.created_at)}
                      </span>
                    </div>
                    {review.review_text && (
                      <p className="text-sm text-foreground/80 leading-relaxed">{review.review_text}</p>
                    )}
                  </div>
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="rounded-[4px] h-8"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={pageNum === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className={cn(
                              "rounded-[4px] h-8 w-8 p-0",
                              pageNum === currentPage && "bg-foreground text-background"
                            )}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-[4px] h-8"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
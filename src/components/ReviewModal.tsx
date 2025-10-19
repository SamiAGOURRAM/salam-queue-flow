import { useState, useEffect } from "react";
import { Star, X, MessageSquare, TrendingUp, Edit2, Trash2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ratingService } from "@/services/rating/RatingService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ClinicRating, ClinicRatingStats } from "@/integrations/supabase/types";

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
  const { data: reviewsData, isLoading: loadingReviews } = useQuery({
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit review",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete review",
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
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-6 h-6 ${
              interactive ? "cursor-pointer transition-transform hover:scale-110" : ""
            } ${
              star <= (interactive && hoveredRating > 0 ? hoveredRating : rating)
                ? "fill-amber-400 text-amber-400"
                : "text-gray-300"
            }`}
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
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 w-16">
          <span className="text-sm font-medium">{starCount}</span>
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
        </div>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-sm text-gray-600 w-12 text-right">{count}</span>
      </div>
    );
  };

  if (!isOpen) return null;

  const totalPages = Math.ceil((reviewsData?.count || 0) / reviewsPerPage);
  const canEdit = isEditing || !userRating;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">Reviews & Ratings</h2>
            <p className="text-blue-100">{clinicName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Rating Overview */}
          {ratingStats && ratingStats.total_ratings > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Average Rating */}
                <div className="text-center md:border-r border-amber-200">
                  <div className="text-5xl font-extrabold text-gray-800 mb-2">
                    {ratingStats.average_rating.toFixed(1)}
                  </div>
                  <div className="flex justify-center mb-2">
                    {renderStars(Math.round(ratingStats.average_rating))}
                  </div>
                  <p className="text-gray-600">
                    Based on <span className="font-bold">{ratingStats.total_ratings}</span> reviews
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
          <div className="bg-white rounded-xl border-2 border-blue-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                Your Review
              </h3>
              {userRating && !isEditing && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    className="gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                    disabled={deleteRatingMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
              )}
            </div>

            {loadingUserRating ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Star Rating */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Rate your experience <span className="text-red-500">*</span>
                  </label>
                  {renderStars(selectedRating, canEdit)}
                  {selectedRating > 0 && (
                    <p className="text-sm text-gray-600 mt-2">
                      {selectedRating === 5 && "Excellent! ⭐"}
                      {selectedRating === 4 && "Very Good! 👍"}
                      {selectedRating === 3 && "Good 👌"}
                      {selectedRating === 2 && "Fair 🤔"}
                      {selectedRating === 1 && "Needs Improvement 😕"}
                    </p>
                  )}
                </div>

                {/* Review Text */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Share your experience (optional)
                  </label>
                  <Textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Tell us about your visit to help others make informed decisions..."
                    className="min-h-[100px] resize-none"
                    disabled={!canEdit}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500 mt-1 text-right">
                    {reviewText.length}/500 characters
                  </p>
                </div>

                {/* Action Buttons */}
                {canEdit && (
                  <div className="flex gap-3">
                    <Button
                      onClick={handleSubmit}
                      disabled={selectedRating === 0 || submitRatingMutation.isPending}
                      className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                    >
                      {submitRatingMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white mr-2"></div>
                          Submitting...
                        </>
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
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}

                {userRating && !isEditing && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <AlertCircle className="w-4 h-4" />
                      <span>
                        You reviewed this clinic on {formatDate(userRating.created_at)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* All Reviews */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Patient Reviews
              {reviewsData?.count && reviewsData.count > 0 && (
                <Badge variant="outline" className="ml-2">
                  {reviewsData.count} reviews
                </Badge>
              )}
            </h3>

            {loadingReviews ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : !reviewsData?.data || reviewsData.data.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No reviews yet. Be the first to review!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviewsData.data.map((review: ClinicRating) => (
                  <div
                    key={review.id}
                    className={`bg-white rounded-lg p-5 border ${
                      review.patient_id === user?.id
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-800">
                            {review.patient_id === user?.id
                              ? "You"
                              : "Anonymous Patient"}
                          </span>
                          {review.patient_id === user?.id && (
                            <Badge className="bg-blue-600 text-white text-xs">Your Review</Badge>
                          )}
                        </div>
                        {renderStars(review.rating)}
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatDate(review.created_at)}
                      </span>
                    </div>
                    {review.review_text && (
                      <p className="text-gray-700 text-sm leading-relaxed">{review.review_text}</p>
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
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-2">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        // Show first page, last page, current page, and adjacent pages
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
                            className={
                              pageNum === currentPage
                                ? "bg-blue-600 text-white"
                                : ""
                            }
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
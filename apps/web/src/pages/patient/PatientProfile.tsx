import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { patientService } from "@/services/patient";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { favoriteService } from "@/services/favorite/FavoriteService";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, Mail, Phone, MapPin, 
  Heart, Building, ChevronRight, X,
  Check, Loader2
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Define a type for the clinic data we'll fetch
interface FavoriteClinic {
  id: string;
  name: string;
  logo_url: string | null;
  specialty: string;
}

export default function PatientProfile() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const profile = await patientService.getPatientProfile(user.id);
      
      setFullName(profile.fullName || "");
      setPhone(profile.phoneNumber || "");
      setCity(profile.city || "");
    } catch (error) {
      logger.error("Error fetching profile", error instanceof Error ? error : new Error(String(error)), { userId: user?.id });
      toast({
        title: t('errors.error'),
        description: t('errors.failedToLoad'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      setEmail(user.email || ""); 
    }
  }, [user, fetchProfile]);

  const handleSave = async () => {
    if (!user?.id) return;
    
    try {
      setSaving(true);
      
      await patientService.updatePatientProfile(user.id, {
        fullName,
        phoneNumber: phone,
        city: city || undefined,
      });

      toast({
        title: t('common.success', { defaultValue: 'Success' }),
        description: t('profile.saveSuccess', { defaultValue: 'Profile updated successfully' }),
      });
    } catch (error: unknown) {
      logger.error("Error updating profile", error instanceof Error ? error : new Error(String(error)), { userId: user?.id });
      const description =
        error instanceof Error
          ? error.message
          : t('profile.saveError', { defaultValue: 'Failed to update profile' });
      toast({
        title: t('errors.error'),
        description,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Query to fetch favorite clinics' details
  const { data: favoriteClinics, isLoading: isLoadingFavorites } = useQuery<FavoriteClinic[]>({
    queryKey: ['favorite-clinics', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const favoriteClinicIds = await favoriteService.getUserFavorites(user.id);
      if (!favoriteClinicIds || favoriteClinicIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('clinics')
        .select('id, name, logo_url, specialty')
        .in('id', favoriteClinicIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Mutation to remove a favorite
  const { mutate: removeFavorite, isPending: isRemovingFavorite } = useMutation({
    mutationFn: (clinicId: string) => {
      if (!user) throw new Error("User not found");
      return favoriteService.removeFavorite(clinicId, user.id);
    },
    onSuccess: () => {
      toast({
        title: t('favorites.removed', { defaultValue: 'Removed' }),
        description: t('favorites.removedFromList', { defaultValue: 'Clinic removed from your favorites.' }),
      });
      queryClient.invalidateQueries({ queryKey: ['favorite-clinics', user?.id] });
    },
    onError: (error) => {
      toast({
        title: t('errors.error'),
        description: t('profile.removeFavoriteError', {
          error: error.message, 
          defaultValue: `Failed to remove favorite: ${error.message}`
        }),
        variant: "destructive",
      });
    },
  });

  const firstName = fullName.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          Profile
        </h1>
        <p className="text-muted-foreground">
          Manage your account settings
        </p>
      </div>

      {/* Avatar Section */}
      <div className="flex items-center gap-4 mb-8 pb-8 border-b border-border">
        <div className="w-20 h-20 rounded-full bg-foreground text-background flex items-center justify-center text-2xl font-bold">
          {firstName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-semibold">{fullName || 'Set your name'}</h2>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* Personal Information */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Personal Information
        </h3>
        
        <div className="space-y-4">
          {/* Full Name */}
          <div className="group">
            <label className="text-sm text-muted-foreground mb-1.5 block">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="h-14 pl-12 rounded-2xl border-border bg-card text-base focus:ring-2 focus:ring-foreground/10"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="group">
            <label className="text-sm text-muted-foreground mb-1.5 block">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 6XX XXX XXX"
                className="h-14 pl-12 rounded-2xl border-border bg-card text-base focus:ring-2 focus:ring-foreground/10"
              />
            </div>
          </div>

          {/* City */}
          <div className="group">
            <label className="text-sm text-muted-foreground mb-1.5 block">City</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Your city"
                className="h-14 pl-12 rounded-2xl border-border bg-card text-base focus:ring-2 focus:ring-foreground/10"
              />
            </div>
          </div>

          {/* Email - Read Only */}
          <div className="group">
            <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={email}
                disabled
                className="h-14 pl-12 rounded-2xl border-border bg-muted text-base text-muted-foreground cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Email is linked to your account
            </p>
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 mt-6 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Favorite Clinics */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Favorite Clinics
        </h3>

        {isLoadingFavorites ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : favoriteClinics && favoriteClinics.length > 0 ? (
          <div className="space-y-3">
            {favoriteClinics.map((clinic) => (
              <div 
                key={clinic.id} 
                className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-foreground/20 transition-colors"
              >
                <Link to={`/clinic/${clinic.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  {clinic.logo_url ? (
                    <img 
                      src={clinic.logo_url} 
                      alt={clinic.name} 
                      className="w-14 h-14 rounded-xl object-contain bg-muted p-1" 
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                      <Building className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{clinic.name}</p>
                    <p className="text-sm text-muted-foreground">{clinic.specialty}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Link>
                <button
                  onClick={() => removeFavorite(clinic.id)}
                  disabled={isRemovingFavorite}
                  className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-border">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-muted-foreground" />
            </div>
            <h4 className="font-semibold mb-1">No favorites yet</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Clinics you save will appear here
            </p>
            <Button 
              asChild 
              variant="outline" 
              className="rounded-full"
            >
              <Link to="/clinics">
                Browse Clinics
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { favoriteService } from "@/services/favorite/FavoriteService";
import { 
  User, Mail, Phone, Save, MapPin, 
  Heart, Building, ChevronRight, Trash2 
} from "lucide-react";
import { useTranslation } from "react-i18next"; // CRITICAL REQUIREMENT: Added hook

// Define a type for the clinic data we'll fetch
interface FavoriteClinic {
  id: string;
  name: string;
  logo_url: string | null;
  specialty: string;
}

export default function PatientProfile() {
  const { user } = useAuth();
  const { t } = useTranslation(); // CRITICAL REQUIREMENT: Initialize hook
  const queryClient = useQueryClient();

  const [loading, setLoading]          = useState(false);
  const [saving, setSaving]            = useState(false);
  const [fullName, setFullName]        = useState("");
  const [phone, setPhone]              = useState("");
  const [email, setEmail]              = useState("");
  const [city, setCity]                = useState("");

  useEffect(() => {
    if (user) {
      fetchProfile();
      setEmail(user.email || ""); 
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setFullName(data.full_name || "");
        setPhone(data.phone_number || "");
        setCity(data.city || "");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast({
        title: t('errors.error'), // Translated
        description: t('errors.failedToLoad'), // Translated
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone_number: phone,
          city: city,
        })
        .eq("id", user?.id);

      if (error) throw error;

      toast({
        title: t('common.success', { defaultValue: 'Success' }), // Assumed common.success key
        description: t('profile.saveSuccess', { defaultValue: 'Profile updated successfully' }), // Translated
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: t('errors.error'), // Translated
        description: error.message || t('profile.saveError', { defaultValue: 'Failed to update profile' }), // Translated
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
        title: t('favorites.removed', { defaultValue: 'Removed' }), // Translated (Reusing favorites key)
        description: t('favorites.removedFromList', { defaultValue: 'Clinic removed from your favorites.' }), // Translated
      });
      queryClient.invalidateQueries({ queryKey: ['favorite-clinics', user?.id] });
    },
    onError: (error) => {
      toast({
        title: t('errors.error'), // Translated
        description: t('profile.removeFavoriteError', { // Translated
          error: error.message, 
          defaultValue: `Failed to remove favorite: ${error.message}`
        }),
        variant: "destructive",
      });
    },
  });

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 py-8">
        <Skeleton className="h-10 w-64 bg-blue-100/50" />
        <Skeleton className="h-4 w-96 bg-blue-100/50" />
        <Card className="rounded-3xl shadow-xl bg-white/90 border border-white/60 p-8 space-y-6">
          <Skeleton className="h-8 w-60 bg-blue-100/50" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-11 w-full bg-blue-100/50" />
            <Skeleton className="h-11 w-full bg-blue-100/50" />
          </div>
          <Skeleton className="h-11 w-full bg-blue-100/50" />
          <Skeleton className="h-11 w-full bg-blue-100/50" />
          <Skeleton className="h-12 w-full bg-blue-100/50" />
        </Card>
        <Card className="rounded-3xl shadow-xl bg-white/90 border border-white/60 p-8 space-y-6">
          <Skeleton className="h-8 w-60 bg-blue-100/50" />
          <Skeleton className="h-16 w-full bg-blue-100/50" />
          <Skeleton className="h-16 w-full bg-blue-100/50" />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50 relative py-12">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 space-y-8">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
            <span className="bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
              {t('nav.profile')}
            </span>
          </h1>
          <p className="text-lg text-gray-600 mt-3">{t('profile.tagline', { defaultValue: 'Manage your personal information and account details.' })}</p>
        </div>

        <Card className="relative backdrop-blur-sm bg-white/95 border border-white/60 rounded-3xl shadow-2xl transition-all duration-300">
          <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50/50 rounded-t-3xl p-6">
            <CardTitle className="text-2xl font-bold flex items-center gap-3 text-gray-800">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
                <User className="w-4 h-4 text-white" />
              </div>
              {t('profile.personalInfoTitle', { defaultValue: 'Personal Information' })}
            </CardTitle>
            <CardDescription className="text-gray-500 ml-11">{t('profile.personalInfoDesc', { defaultValue: 'Update your profile details' })}</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                  <User className="w-4 h-4 text-blue-600" />
                  {t('profile.fullName', { defaultValue: 'Full Name' })}
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('profile.fullNamePlaceholder', { defaultValue: 'John Doe' })}
                  className="h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                  <Phone className="w-4 h-4 text-blue-600" />
                  {t('location.phone')}
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('profile.phonePlaceholder', { defaultValue: '+212...' })}
                  className="h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <Mail className="w-4 h-4 text-blue-600" />
                {t('profile.emailReadOnly', { defaultValue: 'Email Address (Read-Only)' })}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="h-12 bg-blue-50/50 border-2 border-blue-100 text-gray-600 rounded-xl cursor-not-allowed"
              />
              <p className="text-xs text-gray-500">{t('profile.emailNote', { defaultValue: 'Email is tied to your account and cannot be changed here.' })}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city" className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <MapPin className="w-4 h-4 text-blue-600" />
                {t('location.city')}
              </Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('profile.cityPlaceholder', { defaultValue: 'Casablanca' })}
                className="h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 shadow-xl hover:shadow-2xl text-white rounded-xl font-bold transition-all"
            >
              <Save className="w-5 h-5 mr-2" />
              {saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('profile.saveChanges', { defaultValue: 'Save Changes' })}
            </Button>
          </CardContent>
        </Card>

        <Card className="relative backdrop-blur-sm bg-white/95 border border-white/60 rounded-3xl shadow-xl transition-all duration-300">
          <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50/50 rounded-t-3xl p-6">
            <CardTitle className="text-2xl font-bold flex items-center gap-3 text-gray-800">
              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-md">
                <Heart className="w-4 h-4 text-white" />
              </div>
              {t('profile.favoritesTitle', { defaultValue: 'My Favorite Clinics' })}
            </CardTitle>
            <CardDescription className="text-gray-500 ml-11">{t('favorites.savedForQuickAccess')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            {isLoadingFavorites ? (
              <>
                <Skeleton className="h-16 w-full bg-blue-100/50 rounded-xl" />
                <Skeleton className="h-16 w-full bg-blue-100/50 rounded-xl" />
              </>
            ) : favoriteClinics && favoriteClinics.length > 0 ? (
              favoriteClinics.map((clinic) => (
                <div key={clinic.id} className="flex items-center justify-between p-3 bg-blue-50/80 border border-blue-200 rounded-xl shadow-inner transition-all hover:bg-white hover:border-blue-300">
                  <Link to={`/clinic/${clinic.id}`} className="flex items-center gap-4 flex-grow">
                    {clinic.logo_url ? (
                      <img src={clinic.logo_url} alt={clinic.name} className="w-12 h-12 rounded-lg object-contain bg-white p-1" />
                    ) : (
                      <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-blue-200 flex items-center justify-center">
                        <Building className="w-6 h-6 text-blue-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-gray-900">{clinic.name}</p>
                      <p className="text-sm text-gray-500">{clinic.specialty}</p>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFavorite(clinic.id)}
                    disabled={isRemovingFavorite}
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 px-4 bg-blue-50/50 rounded-xl border border-dashed border-blue-200">
                <Heart className="w-12 h-12 text-blue-300 mx-auto mb-4" />
                <p className="font-semibold text-gray-800">{t('favorites.noFavoritesYet', { defaultValue: 'No favorite clinics yet' })}</p>
                <p className="text-sm text-gray-500 mb-4">{t('favorites.savedClinicsAppearHere', { defaultValue: 'Your saved clinics will appear here.' })}</p>
                <Button asChild variant="link" className="text-blue-600">
                  <Link to="/clinics">
                    {t('nav.clinics')} <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
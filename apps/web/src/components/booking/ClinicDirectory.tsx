import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Search, MapPin, Clock, Calendar, CreditCard, Wallet,
  Building2, Globe, Filter, Star, Heart, X,
  Sunrise, Sun, Moon, CalendarDays, ArrowRight, ChevronDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { favoriteService } from "@/services/favorite/FavoriteService";
import { useTranslation } from "react-i18next";
import { useClinicSearch } from "@/hooks/useClinicSearch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { arSA, enUS, fr } from "date-fns/locale";

const ClinicDirectory = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const dateLocale = (() => {
    const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    if (language === 'fr') return fr;
    if (language === 'ar') return arSA;
    return enUS;
  })();

  const [showFilters, setShowFilters] = useState(false);

  // --- Filter State (initialized from URL params) ---
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || "");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<'any' | 'morning' | 'afternoon' | 'evening'>('any');
  const [selectedCity, setSelectedCity] = useState<string>(searchParams.get('city') || "all");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>(searchParams.get('specialty') || "all");
  const [minRating, setMinRating] = useState<string>("all");

  // Use the smart search hook (server-side filtering + debouncing)
  const { data: clinics = [], isLoading: loading } = useClinicSearch({
    search: searchTerm,
    city: selectedCity !== 'all' ? selectedCity : undefined,
    specialty: selectedSpecialty !== 'all' ? selectedSpecialty : undefined,
    minRating: minRating !== 'all' ? Number(minRating) : undefined,
    sortBy: 'rating',
    limit: 100,
  });

  // Fetch metadata for filter dropdowns
  const { data: allClinicsMetadata = [] } = useQuery({
    queryKey: ['clinics-metadata'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('id, city, specialty')
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch user's favorites
  const { data: userFavorites } = useQuery({
    queryKey: ['user-favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await favoriteService.getUserFavorites(user.id);
    },
    enabled: !!user,
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (clinicId: string) => {
      if (!user) {
        toast({
          title: t('auth.loginRequired'),
          description: t('auth.loginToSaveFavorites'),
          variant: "destructive",
        });
        throw new Error('Not authenticated');
      }
      return await favoriteService.toggleFavorite(clinicId, user.id);
    },
    onMutate: async (clinicId) => {
      await queryClient.cancelQueries({ queryKey: ['user-favorites', user?.id] });
      const previousFavorites = queryClient.getQueryData(['user-favorites', user?.id]);

      queryClient.setQueryData(['user-favorites', user?.id], (old: string[] = []) => {
        return old.includes(clinicId)
          ? old.filter(id => id !== clinicId)
          : [...old, clinicId];
      });

      return { previousFavorites };
    },
    onError: (err, clinicId, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(['user-favorites', user?.id], context.previousFavorites);
      }
    },
    onSuccess: (isFavorited) => {
      toast({
        title: isFavorited ? t('favorites.addedToFavorites') : t('favorites.removedFromFavorites'),
        description: isFavorited ? t('favorites.savedForQuickAccess') : t('favorites.removedFromList'),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user-favorites', user?.id] });
    },
  });

  const getTodaySchedule = (clinic: typeof clinics[0]) => {
    const rawHours = clinic.today_hours?.trim();
    const localizedHours = !rawHours || rawHours.toLowerCase() === 'closed'
      ? t('common.closed')
      : rawHours;

    return {
      isOpen: clinic.is_open_now,
      hours: localizedHours,
    };
  };

  const isClinicAvailableOnDateTime = (clinic: typeof clinics[0]) => {
    if (!selectedDate) return true;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[selectedDate.getDay()];
    const schedule = clinic.settings?.working_hours?.[dayName];

    if (!schedule || schedule.closed) return false;
    if (selectedTimeSlot === 'any') return true;

    const openTime = schedule.open || '09:00';
    const closeTime = schedule.close || '18:00';

    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);

    const clinicOpenMinutes = openHour * 60 + openMin;
    const clinicCloseMinutes = closeHour * 60 + closeMin;

    let slotStartMinutes: number;
    let slotEndMinutes: number;

    switch (selectedTimeSlot) {
      case 'morning':
        slotStartMinutes = 8 * 60;
        slotEndMinutes = 12 * 60;
        break;
      case 'afternoon':
        slotStartMinutes = 12 * 60;
        slotEndMinutes = 17 * 60;
        break;
      case 'evening':
        slotStartMinutes = 17 * 60;
        slotEndMinutes = 20 * 60;
        break;
      default:
        return true;
    }

    return clinicOpenMinutes < slotEndMinutes && slotStartMinutes < clinicCloseMinutes;
  };

  const getScheduleForDate = (clinic: typeof clinics[0]) => {
    if (!selectedDate) return getTodaySchedule(clinic).hours;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[selectedDate.getDay()];
    const schedule = clinic.settings?.working_hours?.[dayName];

    if (!schedule || schedule.closed) return t('common.closed');
    return `${schedule.open} - ${schedule.close}`;
  };

  const dateTimeFilteredClinics = clinics.filter(isClinicAvailableOnDateTime);
  const filteredClinics = dateTimeFilteredClinics;

  const cities = Array.from(new Set(allClinicsMetadata.map((c) => c.city)));
  const specialties = Array.from(new Set(allClinicsMetadata.map((c) => c.specialty)));

  const toggleFavorite = (e: React.MouseEvent, clinicId: string) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate(clinicId);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedDate(undefined);
    setSelectedTimeSlot('any');
    setSelectedCity("all");
    setSelectedSpecialty("all");
    setMinRating("all");
  };

  const hasActiveFilters = searchTerm || selectedCity !== "all" || selectedSpecialty !== "all" || minRating !== "all" || selectedDate;
  const activeFilterCount = [searchTerm, selectedCity !== 'all', selectedSpecialty !== 'all', minRating !== 'all', selectedDate].filter(Boolean).length;
  const timeSlotLabels: Record<typeof selectedTimeSlot, string> = {
    any: t('clinic.timeSlots.any'),
    morning: t('clinic.timeSlots.morning'),
    afternoon: t('clinic.timeSlots.afternoon'),
    evening: t('clinic.timeSlots.evening'),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <Skeleton className="h-12 w-64 mb-6" />
          <Skeleton className="h-14 w-full mb-6 rounded-lg" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[200px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {t('clinic.findPerfectClinic')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredClinics.length} {t('clinic.clinics')} {t('clinic.available')}
          </p>
        </header>

        {/* Search & Filters */}
        <div className="bg-card border border-border rounded-lg shadow-sm mb-6">
          {/* Search Bar */}
          <div className="p-3 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('clinic.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 pl-9 pr-3 border-border rounded-md text-sm focus-visible:ring-1 focus-visible:ring-gray-900"
              />
            </div>

            <div className="flex gap-2">
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="h-10 w-[130px] border-border rounded-md text-sm">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder={t('clinic.allCities')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('clinic.allCities')}</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                <SelectTrigger className="h-10 w-[140px] border-border rounded-md text-sm">
                  <SelectValue placeholder={t('clinic.allSpecialties')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('clinic.allSpecialties')}</SelectItem>
                  {specialties.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>{specialty}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={`h-10 px-3 rounded-md border text-sm font-medium transition-colors ${
                  showFilters || hasActiveFilters
                    ? 'bg-obsidian text-white border-obsidian hover:bg-obsidian-hover'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <Filter className="w-3.5 h-3.5 mr-1.5" />
                {t('common.filter')}
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 text-xs bg-card text-foreground w-4 h-4 rounded-full flex items-center justify-center font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="px-3 pb-3 pt-0 border-t border-border">
              <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`h-9 justify-start text-left text-sm font-normal border-border rounded-md ${
                        selectedDate ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      <CalendarDays className="mr-2 h-3.5 w-3.5" />
                      {selectedDate ? format(selectedDate, 'MMM d', { locale: dateLocale }) : t('clinic.selectDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-lg shadow-lg" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {selectedDate && (
                  <div className="flex gap-1 col-span-2 sm:col-span-1">
                    {[
                      { value: 'any', label: t('clinic.timeSlots.any') },
                      { value: 'morning', label: t('clinic.timeSlots.morningShort') },
                      { value: 'afternoon', label: t('clinic.timeSlots.afternoonShort') },
                      { value: 'evening', label: t('clinic.timeSlots.eveningShort') },
                    ].map(({ value, label }) => (
                      <Button
                        key={value}
                        variant={selectedTimeSlot === value ? 'default' : 'outline'}
                        onClick={() => setSelectedTimeSlot(value as typeof selectedTimeSlot)}
                        className={`flex-1 h-9 text-xs font-medium rounded-md ${
                          selectedTimeSlot === value
                            ? 'bg-obsidian text-white hover:bg-obsidian-hover'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}

                <Select value={minRating} onValueChange={setMinRating}>
                  <SelectTrigger className="h-9 border-border rounded-md text-sm">
                    <Star className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder={t('clinic.rating')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('clinic.allRatings')}</SelectItem>
                    {[4, 3, 2].map((rating) => (
                      <SelectItem key={rating} value={String(rating)}>{rating}+</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    onClick={clearFilters}
                    className="h-9 text-sm text-muted-foreground hover:text-foreground rounded-md"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    {t('common.clear')}
                  </Button>
                )}
              </div>

              {/* Active Filter Tags */}
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                  {searchTerm && (
                    <Badge variant="secondary" className="bg-muted text-foreground text-xs px-2 py-0.5 rounded font-normal">
                      "{searchTerm}"
                      <button onClick={() => setSearchTerm("")} className="ml-1.5 hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedCity !== 'all' && (
                    <Badge variant="secondary" className="bg-muted text-foreground text-xs px-2 py-0.5 rounded font-normal">
                      {selectedCity}
                      <button onClick={() => setSelectedCity("all")} className="ml-1.5 hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedSpecialty !== 'all' && (
                    <Badge variant="secondary" className="bg-muted text-foreground text-xs px-2 py-0.5 rounded font-normal">
                      {selectedSpecialty}
                      <button onClick={() => setSelectedSpecialty("all")} className="ml-1.5 hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedDate && (
                    <Badge variant="secondary" className="bg-muted text-foreground text-xs px-2 py-0.5 rounded font-normal">
                      {format(selectedDate, 'MMM d', { locale: dateLocale })}
                      {selectedTimeSlot !== 'any' && ` · ${timeSlotLabels[selectedTimeSlot]}`}
                      <button onClick={() => { setSelectedDate(undefined); setSelectedTimeSlot('any'); }} className="ml-1.5 hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  {minRating !== 'all' && (
                    <Badge variant="secondary" className="bg-muted text-foreground text-xs px-2 py-0.5 rounded font-normal">
                      {t('clinic.minRatingTag', { rating: minRating })}
                      <button onClick={() => setMinRating("all")} className="ml-1.5 hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {filteredClinics.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">{t('clinic.noClinicsFound')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('clinic.tryAdjustingFilters')}</p>
            <Button
              onClick={clearFilters}
              className="h-9 px-4 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
            >
              {t('common.resetFilters')}
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClinics.map((clinic) => {
              const todaySchedule = getTodaySchedule(clinic);
              const displaySchedule = selectedDate
                ? { isOpen: isClinicAvailableOnDateTime(clinic), hours: getScheduleForDate(clinic) }
                : todaySchedule;

              const averageRating = clinic.average_rating || 0;
              const totalRatings = clinic.total_ratings || 0;
              const isFavorite = userFavorites?.includes(clinic.id) || false;
              const clinicName = clinic.name?.trim() || t('clinic.fallbackName');
              const clinicSpecialty = clinic.specialty?.trim() || t('clinic.fallbackSpecialty');
              const clinicCity = clinic.city?.trim() || t('clinic.fallbackCity');
              const displayHours = displaySchedule.hours?.trim() || t('common.closed');

              return (
                <article
                  key={clinic.id}
                  onClick={() => navigate(`/clinic/${clinic.id}`)}
                  className="group cursor-pointer"
                >
                  <Card className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-md hover:border-border transition-all duration-200">
                    {/* Card Header */}
                    <div className="relative p-4 pb-3 border-b border-border">
                      <div className="flex items-start justify-between gap-3">
                        {/* Logo & Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                            {clinic.logo_url ? (
                              <img src={clinic.logo_url} alt={clinicName} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-base font-semibold text-muted-foreground">
                                {clinicName.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-foreground transition-colors">
                              {clinicName}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">{clinicSpecialty}</p>
                          </div>
                        </div>

                        {/* Favorite */}
                        <button
                          onClick={(e) => toggleFavorite(e, clinic.id)}
                          disabled={toggleFavoriteMutation.isPending}
                          className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 pt-3">
                      {/* Rating & Status Row */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-sm font-medium text-foreground">{averageRating.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({totalRatings})</span>
                        </div>
                        <Badge className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          displaySchedule.isOpen
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-muted text-muted-foreground border-border'
                        } border`}>
                          {displaySchedule.isOpen ? t('common.open') : t('common.closed')}
                        </Badge>
                      </div>

                      {/* Details */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{clinicCity}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span>{displayHours}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/clinic/${clinic.id}`);
                          }}
                          className="flex-1 h-8 text-xs font-medium border-border rounded-md hover:bg-muted hover:border-border transition-colors"
                        >
                          {t('clinic.details')}
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/booking/${clinic.id}`);
                          }}
                          className="flex-1 h-8 text-xs font-medium bg-obsidian hover:bg-obsidian-hover text-white rounded-md transition-colors"
                        >
                          {t('clinic.bookNow')}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDirectory;

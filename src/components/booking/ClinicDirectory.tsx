import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Search, MapPin, Phone, Clock, Calendar, CreditCard, Wallet, 
  Building2, Globe, Check, Sparkles, TrendingUp, Filter, 
  Star, Heart, Shield, Award, Users, Activity, ChevronRight,
  ArrowRight, Zap, Timer, DollarSign, Stethoscope, X, Plus,
  Layers, HeartHandshake, ClipboardCheck, BellRing, Pill,
  Sunrise, Sun, Moon, CalendarDays
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { favoriteService } from "@/services/favorite/FavoriteService";
import { useTranslation } from "react-i18next";
import { useClinicSearch } from "@/hooks/useClinicSearch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

const ClinicDirectory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // --- Filter State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<'any' | 'morning' | 'afternoon' | 'evening'>('any');
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [minRating, setMinRating] = useState<string>("all");
  // --------------------

  // Mouse tracking for parallax effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Use the smart search hook (server-side filtering + debouncing)
  const { data: clinics = [], isLoading: loading } = useClinicSearch({
    search: searchTerm,
    city: selectedCity !== 'all' ? selectedCity : undefined,
    specialty: selectedSpecialty !== 'all' ? selectedSpecialty : undefined,
    minRating: minRating !== 'all' ? Number(minRating) : undefined,
    sortBy: 'rating', // Always sort by rating (best first)
    limit: 100,
  });

  // Fetch metadata for filter dropdowns (cities, specialties)
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
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
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
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const schedule = clinic.settings?.working_hours?.[today];
    
    if (!schedule || schedule.closed) {
      return { isOpen: false, hours: t('common.closed') };
    }
    
    return { 
      isOpen: true, 
      hours: `${schedule.open} - ${schedule.close}` 
    };
  };

  const getPaymentMethods = (clinic: typeof clinics[0]) => {
    const methods = clinic.settings?.payment_methods || {};
    return [
      { name: t('payment.cash'), icon: Wallet, enabled: methods.cash },
      { name: t('payment.card'), icon: CreditCard, enabled: methods.card },
      { name: t('payment.insurance'), icon: Building2, enabled: methods.insurance },
      { name: t('payment.online'), icon: Globe, enabled: methods.online },
    ].filter(m => m.enabled);
  };

  // Check if clinic is open on selected date/time
  const isClinicAvailableOnDateTime = (clinic: typeof clinics[0]) => {
    if (!selectedDate) return true; // No date filter, show all

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[selectedDate.getDay()];
    const schedule = clinic.settings?.working_hours?.[dayName];

    if (!schedule || schedule.closed) return false;

    // If no time slot selected, just check if open that day
    if (selectedTimeSlot === 'any') return true;

    // Check time slot INTERSECTION (any overlap)
    const openTime = schedule.open || '09:00';
    const closeTime = schedule.close || '18:00';
    
    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);
    
    // Convert to minutes for easier comparison
    const clinicOpenMinutes = openHour * 60 + openMin;
    const clinicCloseMinutes = closeHour * 60 + closeMin;

    // Define time slot ranges in minutes
    let slotStartMinutes: number;
    let slotEndMinutes: number;

    switch (selectedTimeSlot) {
      case 'morning': // 8:00-12:00
        slotStartMinutes = 8 * 60;
        slotEndMinutes = 12 * 60;
        break;
      case 'afternoon': // 12:00-17:00
        slotStartMinutes = 12 * 60;
        slotEndMinutes = 17 * 60;
        break;
      case 'evening': // 17:00-20:00
        slotStartMinutes = 17 * 60;
        slotEndMinutes = 20 * 60;
        break;
      default:
        return true;
    }

    // Check if ranges intersect: clinic is open during ANY part of the time slot
    // Two ranges [A, B] and [C, D] intersect if: A < D AND C < B
    return clinicOpenMinutes < slotEndMinutes && slotStartMinutes < clinicCloseMinutes;
  };

  // Get formatted schedule for selected date
  const getScheduleForDate = (clinic: typeof clinics[0]) => {
    if (!selectedDate) return clinic.today_hours;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[selectedDate.getDay()];
    const schedule = clinic.settings?.working_hours?.[dayName];

    if (!schedule || schedule.closed) return t('common.closed');
    return `${schedule.open} - ${schedule.close}`;
  };

  // Apply client-side date/time filtering
  const dateTimeFilteredClinics = clinics.filter(isClinicAvailableOnDateTime);

  // Results are already filtered server-side, we just add date/time filter client-side
  const filteredClinics = dateTimeFilteredClinics;

  const cities = Array.from(new Set(allClinicsMetadata.map((c) => c.city)));
  const specialties = Array.from(new Set(allClinicsMetadata.map((c) => c.specialty)));
  
  // --- Get first 6 specialties for quick links ---
  const popularSpecialties = specialties.slice(0, 6);
  // ---------------------------------------------------

  const toggleFavorite = (e: React.MouseEvent, clinicId: string) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate(clinicId);
  };

  const parallaxStyle = {
    transform: `translate(${mousePosition.x * 0.01}px, ${mousePosition.y * 0.01}px)`,
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-transparent">
        <div className="container mx-auto px-6 py-8">
          <div className="space-y-6">
            <Skeleton className="h-[380px] w-full rounded-[3rem] bg-transparent" />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[320px] rounded-3xl bg-transparent" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-transparent relative overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-8">
        {/* Hero Section and Search Filter Side by Side */}
        <div className="grid lg:grid-cols-[1fr,2fr] gap-6 mb-12">
          
          {/* ============================================================
          ===            START: UPDATED & FILLED FILTER CARD       ===
          ============================================================
          */}
          <div 
            className="relative rounded-[2rem] bg-white border shadow-xl p-6 order-2 lg:order-1 flex flex-col"
          >
            {/* Main Filters Section */}
            <div className="space-y-5">
              
              {/* Card Title */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Search className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-gray-900">{t('clinic.searchClinics')}</h2>
                  <p className="text-xs text-gray-600 truncate">{t('clinic.findPerfectProvider')}</p>
                </div>
              </div>

              {/* PRIMARY: Search Input (Prominent) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  {t('clinic.whatDoYouNeed', 'What do you need?')}
                </label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder={t('clinic.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 h-14 bg-white/90 backdrop-blur border-2 border-blue-100 text-gray-900 placeholder:text-gray-400 rounded-xl text-base font-medium focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100/50 transition-all"
                  />
                </div>
              </div>

              {/* SECONDARY: When? (Date & Time) */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  {t('clinic.whenDoYouNeed', 'When do you need care?')}
                </label>
                
                {/* Date Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-full h-12 justify-start text-left font-medium bg-white/90 backdrop-blur border-2 border-blue-100 rounded-xl hover:border-blue-300 transition-all ${
                        selectedDate ? 'text-gray-900' : 'text-gray-400'
                      }`}
                    >
                      <CalendarDays className="mr-3 h-5 w-5 text-blue-600" />
                      {selectedDate ? format(selectedDate, 'PPP') : t('clinic.selectDate', 'Select date (optional)')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white border-blue-100 rounded-xl shadow-xl" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="rounded-xl"
                    />
                    {selectedDate && (
                      <div className="p-3 border-t border-gray-100">
                        <Button
                          variant="ghost"
                          className="w-full text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => setSelectedDate(undefined)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          {t('common.clearDate', 'Clear date')}
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Time Slot Buttons */}
                {selectedDate && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={selectedTimeSlot === 'any' ? 'default' : 'outline'}
                      className={`h-auto py-3 px-3 flex-col items-start border-2 rounded-xl transition-all ${
                        selectedTimeSlot === 'any'
                          ? 'bg-gradient-to-br from-blue-500 to-sky-500 border-blue-400 text-white shadow-lg'
                          : 'bg-white/90 border-blue-100 text-gray-700 hover:border-blue-300'
                      }`}
                      onClick={() => setSelectedTimeSlot('any')}
                    >
                      <Clock className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">{t('clinic.anyTime', 'Any Time')}</span>
                    </Button>
                    <Button
                      variant={selectedTimeSlot === 'morning' ? 'default' : 'outline'}
                      className={`h-auto py-3 px-3 flex-col items-start border-2 rounded-xl transition-all ${
                        selectedTimeSlot === 'morning'
                          ? 'bg-gradient-to-br from-blue-500 to-sky-500 border-blue-400 text-white shadow-lg'
                          : 'bg-white/90 border-blue-100 text-gray-700 hover:border-blue-300'
                      }`}
                      onClick={() => setSelectedTimeSlot('morning')}
                    >
                      <Sunrise className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">{t('clinic.morning', 'Morning')}</span>
                      <span className="text-[10px] opacity-70">8-12h</span>
                    </Button>
                    <Button
                      variant={selectedTimeSlot === 'afternoon' ? 'default' : 'outline'}
                      className={`h-auto py-3 px-3 flex-col items-start border-2 rounded-xl transition-all ${
                        selectedTimeSlot === 'afternoon'
                          ? 'bg-gradient-to-br from-blue-500 to-sky-500 border-blue-400 text-white shadow-lg'
                          : 'bg-white/90 border-blue-100 text-gray-700 hover:border-blue-300'
                      }`}
                      onClick={() => setSelectedTimeSlot('afternoon')}
                    >
                      <Sun className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">{t('clinic.afternoon', 'Afternoon')}</span>
                      <span className="text-[10px] opacity-70">12-17h</span>
                    </Button>
                    <Button
                      variant={selectedTimeSlot === 'evening' ? 'default' : 'outline'}
                      className={`h-auto py-3 px-3 flex-col items-start border-2 rounded-xl transition-all ${
                        selectedTimeSlot === 'evening'
                          ? 'bg-gradient-to-br from-blue-500 to-sky-500 border-blue-400 text-white shadow-lg'
                          : 'bg-white/90 border-blue-100 text-gray-700 hover:border-blue-300'
                      }`}
                      onClick={() => setSelectedTimeSlot('evening')}
                    >
                      <Moon className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">{t('clinic.evening', 'Evening')}</span>
                      <span className="text-[10px] opacity-70">17-20h</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* TERTIARY: Refinement Filters (Smaller, Less Prominent) */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  {t('clinic.refineSearch', 'Refine your search')}
                </label>
                
                {/* 2-Column Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {/* City */}
                  <Select value={selectedCity} onValueChange={setSelectedCity}>
                    <SelectTrigger className="h-10 bg-white/90 backdrop-blur border border-gray-200 text-gray-900 rounded-lg hover:border-blue-300 transition-all text-sm">
                      <SelectValue placeholder={t('clinic.allCities')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t('clinic.allCities')}
                      </SelectItem>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Specialty */}
                  <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                    <SelectTrigger className="h-10 bg-white/90 backdrop-blur border border-gray-200 text-gray-900 rounded-lg hover:border-blue-300 transition-all text-sm">
                      <SelectValue placeholder={t('clinic.allSpecialties')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t('clinic.allSpecialties')}
                      </SelectItem>
                      {specialties.map((specialty) => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rating Filter (Full-width, smaller) */}
                <Select value={minRating} onValueChange={setMinRating}>
                  <SelectTrigger className="h-10 bg-white/90 backdrop-blur border border-gray-200 text-gray-900 rounded-lg hover:border-blue-300 transition-all text-sm">
                    <SelectValue placeholder={t('clinic.minRating', 'Minimum Rating')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('clinic.allRatings', 'All Ratings')}
                    </SelectItem>
                    {[4, 3, 2, 1].map((rating) => (
                      <SelectItem key={rating} value={String(rating)}>
                        {rating}+ {t('common.stars', 'stars')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters Button */}
              <Button 
                variant="ghost"
                className="w-full text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all text-sm h-10"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedDate(undefined);
                  setSelectedTimeSlot('any');
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                  setMinRating("all");
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                {t('common.clearFilters')}
              </Button>
            </div>
            
            {/* Quick Links Section */}
            <div className="flex-1 flex flex-col justify-end pt-5"> 
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 px-1">{t('clinic.popularSpecialties', 'Popular Specialties')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {popularSpecialties.map((spec) => (
                    <Button
                      key={spec}
                      variant="outline"
                      className={`h-auto px-3 py-2 justify-start border-blue-100 rounded-lg transition-all ${
                        selectedSpecialty === spec 
                        ? 'bg-blue-100 border-blue-300 shadow-lg' 
                        : 'bg-white/90 hover:bg-blue-50'
                      }`}
                      onClick={() => setSelectedSpecialty(spec)}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 ${
                        selectedSpecialty === spec 
                        ? 'bg-gradient-to-br from-blue-500 to-sky-500' 
                        : 'bg-blue-50'
                      }`}>
                        <Stethoscope className={`w-4 h-4 ${
                          selectedSpecialty === spec 
                          ? 'text-white' 
                          : 'text-blue-600'
                        }`} />
                      </div>
                      <span className={`text-sm font-medium truncate ${
                        selectedSpecialty === spec 
                        ? 'text-blue-800' 
                        : 'text-gray-800'
                      }`}>{spec}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            
          </div>
          {/* ============================================================
          ===              END: UPDATED & FILLED FILTER CARD       ===
          ============================================================
          */}


          {/* Hero Section - Right Side (70%) */}
          <div className="relative order-1 lg:order-2">
            <div 
              className="relative rounded-[3rem] bg-gradient-to-br from-blue-600 via-sky-600 to-cyan-600 p-1 shadow-2xl"
              style={{
                transform: 'perspective(1000px) rotateX(2deg)',
                transformStyle: 'preserve-3d'
              }}
            >
              <div className="relative rounded-[2.9rem] bg-white p-8 lg:p-10 overflow-hidden">
                {/* Floating 3D Elements */}
                <div className="absolute top-8 right-8 w-24 h-24 opacity-20" style={parallaxStyle}>
                  <div className="w-full h-full rounded-3xl bg-gradient-to-br from-blue-400 to-sky-400 transform rotate-12 animate-float"></div>
                </div>
                <div className="absolute bottom-8 left-16 w-20 h-20 opacity-20" style={{...parallaxStyle, animationDelay: '2s'}}>
                  <div className="w-full h-full rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-400 transform -rotate-12 animate-float"></div>
                </div>

                <div className="relative grid lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200 shadow-lg">
                      <Activity className="w-4 h-4 text-blue-600 animate-pulse" />
                      <span className="text-xs font-semibold text-blue-900">{t('clinic.directory')}</span>
                      <Badge className="bg-gradient-to-r from-green-400 to-emerald-400 text-white border-0 shadow-md text-xs px-2 py-0.5">
                        {clinics.length} {t('common.active')}
                      </Badge>
                    </div>
                    
                    <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
                      {t('clinic.findPerfectClinic').split(' ').slice(0, 2).join(' ')} 
                      <span className="block bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent animate-gradient">
                        {t('clinic.findPerfectClinic').split(' ').slice(2).join(' ')}
                      </span>
                    </h1>
                    
                    <p className="text-base text-gray-600 leading-relaxed">
                      {t('clinic.browseProviders')}
                    </p>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div 
                        className="relative p-4 rounded-xl bg-white shadow-lg border border-blue-100 hover:shadow-xl transition-all group"
                        style={{
                          transform: hoveredCard === 'stat1' ? 'perspective(500px) rotateY(-5deg) scale(1.05)' : '',
                          transformStyle: 'preserve-3d'
                        }}
                        onMouseEnter={() => setHoveredCard('stat1')}
                        onMouseLeave={() => setHoveredCard(null)}
                      >
                        <Building2 className="w-6 h-6 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-2xl font-bold text-gray-900">{clinics.length}</p>
                        <p className="text-[10px] text-gray-500 mt-1">{t('clinic.verifiedClinics')}</p>
                      </div>
                      
                      <div 
                        className="relative p-4 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 text-white shadow-lg hover:shadow-xl transition-all group"
                        style={{
                          transform: hoveredCard === 'stat2' ? 'perspective(500px) rotateX(-5deg) scale(1.05)' : '',
                          transformStyle: 'preserve-3d'
                        }}
                        onMouseEnter={() => setHoveredCard('stat2')}
                        onMouseLeave={() => setHoveredCard(null)}
                      >
                        <Users className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-2xl font-bold">10K+</p>
                        <p className="text-[10px] text-blue-100 mt-1">{t('clinic.patientsServed')}</p>
                      </div>

                      <div 
                        className="relative p-4 rounded-xl bg-white shadow-lg border border-blue-100 hover:shadow-xl transition-all group"
                        style={{
                          transform: hoveredCard === 'stat3' ? 'perspective(500px) rotateY(5deg) scale(1.05)' : '',
                          transformStyle: 'preserve-3d'
                        }}
                        onMouseEnter={() => setHoveredCard('stat3')}
                        onMouseLeave={() => setHoveredCard(null)}
                      >
                        <Star className="w-6 h-6 text-yellow-500 mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-2xl font-bold text-gray-900">4.8</p>
                        <p className="text-[10px] text-gray-500 mt-1">{t('clinic.avgRating')}</p>
                      </div>
                    </div>
                  </div>

                  {/* 3D Graphic Cards */}
                  <div className="relative h-[320px] hidden lg:block">
                    <div 
                      className="absolute top-0 right-0 w-64 h-36 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-500 shadow-2xl p-5 text-white"
                      style={{
                        transform: `perspective(1000px) rotateX(${hoveredCard === 'card1' ? '0' : '10'}deg) rotateY(${hoveredCard === 'card1' ? '0' : '-20'}deg) translateZ(50px)`,
                        transformStyle: 'preserve-3d',
                        transition: 'transform 0.3s ease'
                      }}
                      onMouseEnter={() => setHoveredCard('card1')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <Stethoscope className="w-8 h-8 mb-2" />
                      <h3 className="text-lg font-bold mb-1">{t('clinic.allSpecialtiesText')}</h3>
                      <p className="text-sm text-blue-100">{t('clinic.allSpecialtiesDesc')}</p>
                    </div>

                    <div 
                      className="absolute bottom-0 left-0 w-56 h-32 rounded-2xl bg-white shadow-2xl border border-blue-100 p-4"
                      style={{
                        transform: `perspective(1000px) rotateX(${hoveredCard === 'card2' ? '0' : '-10'}deg) rotateY(${hoveredCard === 'card2' ? '0' : '15'}deg) translateZ(30px)`,
                        transformStyle: 'preserve-3d',
                        transition: 'transform 0.3s ease'
                      }}
                      onMouseEnter={() => setHoveredCard('card2')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center">
                          <Clock className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">{t('clinic.instantBooking')}</h3>
                          <p className="text-[10px] text-gray-500">{t('clinic.instantBookingDesc')}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100"></div>
                        ))}
                      </div>
                    </div>

                    {/* Floating icons */}
                    <div className="absolute top-1/2 right-1/3 w-14 h-14 animate-float">
                      <div className="w-full h-full rounded-xl bg-gradient-to-br from-cyan-400 to-blue-400 shadow-xl flex items-center justify-center transform rotate-12">
                        <Heart className="w-7 h-7 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results Count Bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200 shadow-lg">
              <p className="text-blue-900 font-bold text-base">
                {t('clinic.clinics', { count: filteredClinics.length, defaultValue: 'Clinics' })} {t('clinic.available')}
              </p>
            </div>
            {/* Updated filter check */}
            {(searchTerm || selectedCity !== "all" || selectedSpecialty !== "all" || minRating !== "all" || selectedDate || selectedTimeSlot !== 'any') && (
              <div className="flex items-center gap-2">
                <Badge className="bg-white border-blue-200 text-blue-600 shadow-md px-3 py-1.5">
                  {t('common.filtersActive')}
                </Badge>
                <div className="h-8 w-px bg-blue-200"></div>
                <div className="flex gap-2 flex-wrap">
                  {searchTerm && (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                      "{searchTerm}"
                    </Badge>
                  )}
                  {selectedDate && (
                    <Badge className="bg-purple-50 text-purple-700 border-purple-200">
                      📅 {format(selectedDate, 'MMM d')}
                      {selectedTimeSlot !== 'any' && ` • ${selectedTimeSlot}`}
                    </Badge>
                  )}
                  {selectedCity !== "all" && (
                    <Badge className="bg-sky-50 text-sky-700 border-sky-200">
                      {selectedCity}
                    </Badge>
                  )}
                  {selectedSpecialty !== "all" && (
                    <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200">
                      {selectedSpecialty}
                    </Badge>
                  )}
                  {minRating !== "all" && (
                    <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      {minRating}+ {t('common.stars', 'Stars')}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Clinics Grid with 3D Cards */}
        {filteredClinics.length === 0 ? (
          <div className="rounded-2xl bg-white border shadow-lg p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center mx-auto mb-5">
                <Search className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('clinic.noClinicsFound')}</h3>
              <p className="text-base text-gray-600 mb-6">{t('clinic.tryAdjustingFilters')}</p>

              <Button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedDate(undefined);
                  setSelectedTimeSlot('any');
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                  setMinRating("all");
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold shadow-lg"
              >
                <Filter className="w-5 h-5 mr-2" />
                {t('common.resetFilters')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
            {filteredClinics.map((clinic, index) => {
              const todaySchedule = getTodaySchedule(clinic);
              const displaySchedule = selectedDate 
                ? { isOpen: isClinicAvailableOnDateTime(clinic), hours: getScheduleForDate(clinic) }
                : todaySchedule;
              const paymentMethods = getPaymentMethods(clinic);
              const allowWalkIns = clinic.settings?.allow_walk_ins;
              const avgDuration = clinic.settings?.average_appointment_duration;
              
              // Rating data comes from the server now (no need for separate query)
              const averageRating = clinic.average_rating || 0;
              const totalRatings = clinic.total_ratings || 0;
              
              const isFavorite = userFavorites?.includes(clinic.id) || false;

              return (
                <div
                  key={clinic.id}
                  className="group"
                  onMouseEnter={() => setHoveredCard(clinic.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div 
                    className="relative h-full transition-all duration-300"
                    style={{
                      transform: hoveredCard === clinic.id 
                        ? 'translateY(-4px)' 
                        : 'translateY(0)'
                    }}
                  >
                    <div className={`absolute -inset-0.5 bg-gradient-to-r from-blue-400 to-sky-400 rounded-2xl blur ${hoveredCard === clinic.id ? 'opacity-20' : 'opacity-0'} transition-opacity duration-300`}></div>
                    
                    <Card 
                      className="relative h-full bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 flex flex-col" // <-- Added flex flex-col
                      onClick={() => navigate(`/clinic/${clinic.id}`)}
                    >
                      {/* Compact Header - 60px */}
                      <div className="relative h-[60px] bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500">
                        <div className="absolute inset-0 bg-black/5"></div>
                        <div className="absolute inset-0 opacity-10">
                          <Plus className="absolute top-2 left-3 w-4 h-4 text-white" />
                          <Stethoscope className="absolute bottom-2 right-3 w-5 h-5 text-white" />
                        </div>
                        
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                          <div className="flex gap-1.5">
                            <Badge className={`${displaySchedule.isOpen ? 'bg-green-500/90' : 'bg-gray-500/90'} backdrop-blur text-white border-0 px-2 py-0.5 text-xs font-semibold`}>
                              {displaySchedule.isOpen ? t('common.open') : t('common.closed')}
                            </Badge>
                            {selectedDate && displaySchedule.isOpen && (
                              <Badge className="bg-blue-500/90 backdrop-blur text-white border-0 px-2 py-0.5 text-xs font-semibold">
                                📅 {format(selectedDate, 'MMM d')}
                              </Badge>
                            )}
                          </div>
                          
                          <button
                            onClick={(e) => toggleFavorite(e, clinic.id)}
                            disabled={toggleFavoriteMutation.isPending}
                            className="w-7 h-7 rounded-full bg-white/95 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-white hover:scale-110 transition-all disabled:opacity-50"
                          >
                            <Heart 
                              className={`w-3.5 h-3.5 transition-all ${
                                isFavorite 
                                  ? 'fill-red-500 text-red-500' 
                                  : 'text-gray-400'
                              }`} 
                            />
                          </button>
                        </div>

                        {/* Compact Logo - 40px */}
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
                          {clinic.logo_url ? (
                            <div className="w-10 h-10 rounded-xl bg-white shadow-lg p-1.5 border-2 border-white">
                              <img 
                                src={clinic.logo_url} 
                                alt={clinic.name} 
                                className="w-full h-full object-contain" 
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-white shadow-lg flex items-center justify-center border-2 border-white">
                              <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                                {clinic.name.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Compact Content */}
                      <div className="p-3 pt-6 space-y-2.5 flex-1"> {/* <-- Added flex-1 */}
                        {/* Name & Rating */}
                        <div className="text-center">
                          <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
                            {clinic.name}
                          </h3>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <Badge className="bg-blue-50 border-blue-200 text-blue-700 text-xs px-2 py-0.5">
                              {clinic.specialty}
                            </Badge>
                            {totalRatings > 0 && (
                                <div className="flex items-center text-sm text-yellow-600">
                                  <Star className="w-3 h-3 fill-yellow-500 text-yellow-500 mr-1" />
                                  <span className="font-semibold">{averageRating.toFixed(1)}</span>
                                  <span className="text-gray-400 ml-1">({totalRatings})</span>
                                </div>
                            )}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="line-clamp-1">{clinic.city}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-sky-500 shrink-0" />
                            <span className="line-clamp-1">
                              {selectedDate 
                                ? `${format(selectedDate, 'EEE, MMM d')}: ${displaySchedule.hours}`
                                : `${t('time.today')}: ${displaySchedule.hours}`
                              }
                            </span>
                          </div>
                          {selectedDate && displaySchedule.isOpen && (
                            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 -mx-1">
                              <CalendarDays className="w-4 h-4 text-blue-600 shrink-0" />
                              <span className="text-xs font-semibold text-blue-700">
                                {t('clinic.availableOnDate', 'Available on selected date')}
                              </span>
                            </div>
                          )}
                          {allowWalkIns && (
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-green-500 shrink-0" />
                              <span className="line-clamp-1 font-semibold text-green-700">
                                {t('features.walkInsOk')}
                              </span>
                            </div>
                          )}
                          {avgDuration && (
                            <div className="flex items-center gap-2">
                              <Timer className="w-4 h-4 text-cyan-500 shrink-0" />
                              <span className="line-clamp-1">
                                {t('features.averageTime')}: {avgDuration} {t('features.minutes')}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* Payment Methods */}
                        {paymentMethods.length > 0 && (
                          <div className="border-t border-gray-100 pt-2 flex flex-wrap gap-2">
                            {paymentMethods.map(method => (
                              <Badge 
                                key={method.name} 
                                variant="outline" 
                                className="border-cyan-200 text-cyan-700 bg-cyan-50 text-xs px-2 py-0.5 font-normal"
                              >
                                <method.icon className="w-3 h-3 mr-1" />
                                {method.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* ============================================================
                      ===                  START: BUTTON MODIFICATION            ===
                      ============================================================
                      */}
                      {/* Footer Button */}
                      <div className="p-3 border-t border-gray-100">
                        <Button 
                          className="w-full bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold py-2 h-auto rounded-xl transition-all"
                          onClick={(e) => {
                            e.stopPropagation(); // Stop the click from bubbling to the Card
                            navigate(`/booking/${clinic.id}`); // Navigate to booking flow
                          }}
                        >
                          {t('clinic.bookAppointment')}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                      {/* ============================================================
                      ===                   END: BUTTON MODIFICATION             ===
                      ============================================================
                      */}
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Styles for animation */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(12deg); }
          50% { transform: translateY(-20px) rotate(12deg); }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
};

export default ClinicDirectory;
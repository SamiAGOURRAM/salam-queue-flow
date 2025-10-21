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
  Layers, HeartHandshake, ClipboardCheck, BellRing, Pill
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ratingService } from "@/services/rating/RatingService";
import { favoriteService } from "@/services/favorite/FavoriteService";
import { useTranslation } from "react-i18next"; // Added import

interface ClinicSettings {
  buffer_time?: number;
  working_hours?: {
    [key: string]: {
      open?: string;
      close?: string;
      closed?: boolean;
    };
  };
  allow_walk_ins?: boolean;
  max_queue_size?: number;
  payment_methods?: {
    cash?: boolean;
    card?: boolean;
    online?: boolean;
    insurance?: boolean;
  };
  appointment_types?: Array<{
    name: string;
    label: string;
    duration: number;
    price?: number;
  }>;
  requires_appointment?: boolean;
  average_appointment_duration?: number;
}

interface Clinic {
  id: string;
  name: string;
  name_ar: string | null;
  specialty: string;
  city: string;
  address: string;
  phone: string;
  logo_url: string | null;
  settings: ClinicSettings | null;
}

const ClinicDirectory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation(); // Added hook
  
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Mouse tracking for parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Fetch clinics
  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("clinics")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setClinics((data as Clinic[]) ?? []);
    } catch (error) {
      console.error("Error fetching clinics:", error);
      toast({
        title: t('errors.error'),
        description: t('errors.failedToLoad') + '. ' + t('errors.tryAgain'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch rating stats for all clinics
  const { data: ratingsMap } = useQuery({
    queryKey: ['clinic-ratings-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_rating_stats')
        .select('*');
      
      if (error) throw error;
      
      const map = new Map();
      data?.forEach(stat => {
        map.set(stat.clinic_id, {
          average_rating: stat.average_rating,
          total_ratings: stat.total_ratings
        });
      });
      return map;
    },
    enabled: clinics.length > 0,
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

  const getTodaySchedule = (clinic: Clinic) => {
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

  const getPaymentMethods = (clinic: Clinic) => {
    const methods = clinic.settings?.payment_methods || {};
    return [
      { name: t('payment.cash'), icon: Wallet, enabled: methods.cash },
      { name: t('payment.card'), icon: CreditCard, enabled: methods.card },
      { name: t('payment.insurance'), icon: Building2, enabled: methods.insurance },
      { name: t('payment.online'), icon: Globe, enabled: methods.online },
    ].filter(m => m.enabled);
  };

  const filteredClinics = clinics.filter((clinic) => {
    const matchesSearch =
      searchTerm === "" ||
      clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clinic.specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clinic.city.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCity = selectedCity === "all" || clinic.city === selectedCity;
    const matchesSpecialty = selectedSpecialty === "all" || clinic.specialty === selectedSpecialty;

    return matchesSearch && matchesCity && matchesSpecialty;
  });

  const cities = Array.from(new Set(clinics.map((c) => c.city)));
  const specialties = Array.from(new Set(clinics.map((c) => c.specialty)));

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
        <div className="container mx-auto px-6 py-10">
          <div className="space-y-8">
            <Skeleton className="h-[500px] w-full rounded-[3rem] bg-transparent" />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[400px] rounded-3xl bg-transparent" />
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

      <div className="relative z-10 container mx-auto px-6 py-10">
        {/* Enhanced Hero Section with 3D Elements */}
        <div className="relative mb-16">
          <div 
            className="relative rounded-[3rem] bg-gradient-to-br from-blue-600 via-sky-600 to-cyan-600 p-1 shadow-2xl"
            style={{
              transform: 'perspective(1000px) rotateX(2deg)',
              transformStyle: 'preserve-3d'
            }}
          >
            <div className="relative rounded-[2.9rem] bg-white p-16 overflow-hidden">
              {/* Floating 3D Elements */}
              <div className="absolute top-10 right-10 w-32 h-32 opacity-20" style={parallaxStyle}>
                <div className="w-full h-full rounded-3xl bg-gradient-to-br from-blue-400 to-sky-400 transform rotate-12 animate-float"></div>
              </div>
              <div className="absolute bottom-10 left-20 w-24 h-24 opacity-20" style={{...parallaxStyle, animationDelay: '2s'}}>
                <div className="w-full h-full rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-400 transform -rotate-12 animate-float"></div>
              </div>

              <div className="relative grid lg:grid-cols-2 gap-16 items-center">
                <div className="space-y-8">
                  <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200 shadow-lg">
                    <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
                    <span className="text-sm font-semibold text-blue-900">{t('clinic.directory')}</span>
                    <Badge className="bg-gradient-to-r from-green-400 to-emerald-400 text-white border-0 shadow-md">
                      {clinics.length} {t('common.active')}
                    </Badge>
                  </div>
                  
                  <h1 className="text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
                    {/* Translating parts of clinic.findPerfectClinic based on component's split structure */}
                    {t('clinic.findPerfectClinic').split(' ').slice(0, 2).join(' ')} 
                    <span className="block bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent animate-gradient">
                      {t('clinic.findPerfectClinic').split(' ').slice(2).join(' ')}
                    </span>
                  </h1>
                  
                  <p className="text-xl text-gray-600 leading-relaxed max-w-xl">
                    {t('clinic.browseProviders')}
                  </p>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div 
                      className="relative p-5 rounded-2xl bg-white shadow-xl border border-blue-100 hover:shadow-2xl transition-all group"
                      style={{
                        transform: hoveredCard === 'stat1' ? 'perspective(500px) rotateY(-5deg) scale(1.05)' : '',
                        transformStyle: 'preserve-3d'
                      }}
                      onMouseEnter={() => setHoveredCard('stat1')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <Building2 className="w-8 h-8 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-3xl font-bold text-gray-900">{clinics.length}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('clinic.verifiedClinics')}</p>
                    </div>
                    
                    <div 
                      className="relative p-5 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-500 text-white shadow-xl hover:shadow-2xl transition-all group"
                      style={{
                        transform: hoveredCard === 'stat2' ? 'perspective(500px) rotateX(-5deg) scale(1.05)' : '',
                        transformStyle: 'preserve-3d'
                      }}
                      onMouseEnter={() => setHoveredCard('stat2')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <Users className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-3xl font-bold">10K+</p>
                      <p className="text-xs text-blue-100 mt-1">{t('clinic.patientsServed')}</p>
                    </div>

                    <div 
                      className="relative p-5 rounded-2xl bg-white shadow-xl border border-blue-100 hover:shadow-2xl transition-all group"
                      style={{
                        transform: hoveredCard === 'stat3' ? 'perspective(500px) rotateY(5deg) scale(1.05)' : '',
                        transformStyle: 'preserve-3d'
                      }}
                      onMouseEnter={() => setHoveredCard('stat3')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <Star className="w-8 h-8 text-yellow-500 mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-3xl font-bold text-gray-900">4.8</p>
                      <p className="text-xs text-gray-500 mt-1">{t('clinic.avgRating')}</p>
                    </div>
                  </div>
                </div>

                {/* 3D Graphic Cards */}
                <div className="relative h-[400px] hidden lg:block">
                  <div 
                    className="absolute top-0 right-0 w-72 h-44 rounded-3xl bg-gradient-to-br from-blue-500 to-sky-500 shadow-2xl p-6 text-white"
                    style={{
                      transform: `perspective(1000px) rotateX(${hoveredCard === 'card1' ? '0' : '10'}deg) rotateY(${hoveredCard === 'card1' ? '0' : '-20'}deg) translateZ(50px)`,
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.3s ease'
                    }}
                    onMouseEnter={() => setHoveredCard('card1')}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <Stethoscope className="w-10 h-10 mb-3" />
                    <h3 className="text-xl font-bold mb-2">{t('clinic.allSpecialtiesText')}</h3>
                    <p className="text-blue-100">{t('clinic.allSpecialtiesDesc')}</p>
                  </div>

                  <div 
                    className="absolute bottom-0 left-0 w-64 h-40 rounded-3xl bg-white shadow-2xl border border-blue-100 p-6"
                    style={{
                      transform: `perspective(1000px) rotateX(${hoveredCard === 'card2' ? '0' : '-10'}deg) rotateY(${hoveredCard === 'card2' ? '0' : '15'}deg) translateZ(30px)`,
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.3s ease'
                    }}
                    onMouseEnter={() => setHoveredCard('card2')}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{t('clinic.instantBooking')}</h3>
                        <p className="text-xs text-gray-500">{t('clinic.instantBookingDesc')}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100"></div>
                      ))}
                    </div>
                  </div>

                  {/* Floating icons */}
                  <div className="absolute top-1/2 right-1/3 w-16 h-16 animate-float">
                    <div className="w-full h-full rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-400 shadow-xl flex items-center justify-center transform rotate-12">
                      <Heart className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Search & Filters */}
        <div 
          className="relative mb-12 rounded-[2rem] bg-white border shadow-xl p-10"
          style={{
            transform: 'perspective(2000px) rotateX(1deg)',
            transformStyle: 'preserve-3d'
          }}
        >
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg">
                  <Search className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">{t('clinic.searchClinics')}</h2>
                  <p className="text-gray-600">{t('clinic.findPerfectProvider')}</p>
                </div>
              </div>
              <Button 
                variant="ghost"
                className="text-gray-600 hover:bg-blue-50 hover:text-blue-600 px-6 py-3 rounded-xl transition-all"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                }}
              >
                <Filter className="w-5 h-5 mr-2" />
                {t('common.clearFilters')}
              </Button>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-sky-400 rounded-2xl blur-2xl opacity-10 group-hover:opacity-20 transition-opacity"></div>
              <div className="relative flex items-center">
                <Search className="absolute left-6 h-6 w-6 text-gray-400" />
                <Input
                  placeholder={t('clinic.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-16 pr-6 h-20 bg-white/90 backdrop-blur border-2 border-blue-100 text-gray-900 placeholder:text-gray-400 rounded-2xl text-lg focus:border-blue-400 focus:shadow-xl focus:shadow-blue-100/50 transition-all"
                />
                <div className="absolute right-4 flex items-center gap-2">
                  {searchTerm && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      {t('common.search')}...
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="h-16 bg-white/90 backdrop-blur border-2 border-blue-100 text-gray-900 rounded-2xl hover:border-blue-300 focus:border-blue-400 focus:shadow-xl focus:shadow-blue-100/50 transition-all text-base">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <SelectValue placeholder={t('clinic.allCities')} />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-white/95 backdrop-blur-xl border-blue-100 rounded-xl">
                  <SelectItem value="all">
                    <div className="flex items-center gap-2 py-1">
                      <Globe className="w-4 h-4 text-blue-600" />
                      {t('clinic.allCities')}
                    </div>
                  </SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      <div className="flex items-center gap-2 py-1">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        {city}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                <SelectTrigger className="h-16 bg-white/90 backdrop-blur border-2 border-blue-100 text-gray-900 rounded-2xl hover:border-blue-300 focus:border-blue-400 focus:shadow-xl focus:shadow-blue-100/50 transition-all text-base">
                  <div className="flex items-center gap-3">
                    <Stethoscope className="w-5 h-5 text-blue-600" />
                    <SelectValue placeholder={t('clinic.allSpecialties')} />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-white/95 backdrop-blur-xl border-blue-100 rounded-xl">
                  <SelectItem value="all">
                    <div className="flex items-center gap-2 py-1">
                      <Layers className="w-4 h-4 text-blue-600" />
                      {t('clinic.allSpecialties')}
                    </div>
                  </SelectItem>
                  {specialties.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      <div className="flex items-center gap-2 py-1">
                        <Stethoscope className="w-4 h-4 text-blue-600" />
                        {specialty}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Results Count Bar */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200 shadow-lg">
              <p className="text-blue-900 font-bold text-lg">
                {/* Pluralization for "Clinics Available" */}
                {t('clinic.clinics', { count: filteredClinics.length, defaultValue: 'Clinics' })} {t('clinic.available')}
              </p>
            </div>
            {(searchTerm || selectedCity !== "all" || selectedSpecialty !== "all") && (
              <div className="flex items-center gap-2">
                <Badge className="bg-white border-blue-200 text-blue-600 shadow-md px-3 py-1.5">
                  {t('common.filtersActive')}
                </Badge>
                <div className="h-8 w-px bg-blue-200"></div>
                <div className="flex gap-2">
                  {searchTerm && (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                      "{searchTerm}"
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
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Clinics Grid with 3D Cards */}
  {/* Compact Clinics Grid - 4 columns on xl */}
  {filteredClinics.length === 0 ? (
          <div className="rounded-2xl bg-white border shadow-lg p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center mx-auto mb-6">
                <Search className="w-12 h-12 text-blue-400" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3">{t('clinic.noClinicsFound')}</h3>
              <p className="text-lg text-gray-600 mb-8">{t('clinic.tryAdjustingFilters')}</p>
              <Button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                }}
                className="px-8 py-5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold shadow-lg"
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
              const paymentMethods = getPaymentMethods(clinic);
              const allowWalkIns = clinic.settings?.allow_walk_ins;
              const avgDuration = clinic.settings?.average_appointment_duration;
              
              const ratingData = ratingsMap?.get(clinic.id);
              const averageRating = ratingData?.average_rating || 0;
              const totalRatings = ratingData?.total_ratings || 0;
              
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
                      className="relative h-full bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300"
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
                          <Badge className={`${todaySchedule.isOpen ? 'bg-green-500/90' : 'bg-gray-500/90'} backdrop-blur text-white border-0 px-2 py-0.5 text-xs font-semibold`}>
                            {todaySchedule.isOpen ? t('common.open') : t('common.closed')}
                          </Badge>
                          
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
                      <div className="p-3 pt-6 space-y-2.5">
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
                              {t('time.today')}: {todaySchedule.hours}
                            </span>
                          </div>
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
                      
                      {/* Footer Button */}
                      <div className="p-3 border-t border-gray-100">
                        <Button 
                          className="w-full bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold py-2 h-auto rounded-xl transition-all"
                        >
                          {t('clinic.bookAppointment')}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Styles for animation, included as requested */}
      <style jsx>{`
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
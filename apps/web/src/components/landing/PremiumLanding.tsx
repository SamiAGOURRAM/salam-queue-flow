import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MapPin, ArrowRight, Navigation, Loader2, Stethoscope,
  User, Building2, Search, Info, Calendar, LogOut, LogIn, Clock
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDoctorSearch } from "@/hooks/useDoctorSearch";
import { useDetectedLocation } from "@/hooks/useDetectedLocation";
import { useAuth } from "@/hooks/useAuth";
import { useForceLightMode } from "@/hooks/useForceLightMode";
import { SiteHeader } from "@/components/SiteHeader";
import CountUp from "@/components/ui/CountUp";
import heroImage from "@/assets/hero_image.png";
import stethoscopeImage from "@/assets/stetoscope.png";
import dentistryImage from "@/assets/dentistry.png";
import heartImage from "@/assets/heart.png";

const PremiumLanding = () => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  
  // Force light mode on landing page
  useForceLightMode();

  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [locationTouched, setLocationTouched] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Silent IP-based location (GPS opt-in via the badge button). Falls back to "Morocco".
  const detected = useDetectedLocation();

  // Fetch clinic metadata for stats and specialties
  const { data: clinicStats } = useQuery({
    queryKey: ['clinic-stats'],
    queryFn: async () => {
      const { data: clinics, error } = await supabase
        .from('clinics')
        .select('id, specialty, city, settings')
        .eq('is_active', true);

      if (error) throw error;

      const clinicIds = clinics?.map((clinic) => clinic.id) ?? [];
      let totalRatings = 0;
      let weightedRatingSum = 0;

      if (clinicIds.length > 0) {
        const { data: ratingStats, error: ratingError } = await supabase
          .from('clinic_rating_stats')
          .select('average_rating, total_ratings')
          .in('clinic_id', clinicIds);

        if (ratingError) throw ratingError;

        for (const rating of ratingStats ?? []) {
          const total = Number(rating.total_ratings ?? 0);
          const average = Number(rating.average_rating ?? 0);
          if (total > 0 && Number.isFinite(average)) {
            totalRatings += total;
            weightedRatingSum += average * total;
          }
        }
      }

      const specialties = [...new Set(clinics?.map(c => c.specialty) || [])];
      const cities = [...new Set(clinics?.map(c => c.city) || [])];
      const waitDurations = (clinics ?? [])
        .map((clinic) => {
          const settings = clinic.settings;
          if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            return null;
          }

          const duration = Number((settings as { average_appointment_duration?: unknown }).average_appointment_duration);
          if (!Number.isFinite(duration) || duration <= 0) {
            return null;
          }

          return duration;
        })
        .filter((duration): duration is number => duration !== null);

      const averageWaitMinutes = waitDurations.length > 0
        ? Math.round(waitDurations.reduce((sum, duration) => sum + duration, 0) / waitDurations.length)
        : null;

      return {
        totalClinics: clinics?.length || 0,
        specialties: specialties.slice(0, 6),
        cities,
        totalRatings,
        avgRating: totalRatings > 0 ? weightedRatingSum / totalRatings : null,
        averageWaitMinutes,
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const formatCompactNumber = (value: number) => {
    const locale = i18n.resolvedLanguage || i18n.language || 'en';
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  // Prefill the location field from the detected city, but never clobber a user edit.
  useEffect(() => {
    if (!locationTouched && detected.city) {
      setLocation(detected.city);
    }
  }, [detected.city, locationTouched]);

  // Live doctor typeahead — debounced, server-filtered, capped for the dropdown.
  const trimmedQuery = searchQuery.trim();
  const typeaheadEnabled = trimmedQuery.length >= 2;
  const { data: doctorResults = [], isFetching: isSearching } = useDoctorSearch({
    search: searchQuery,
    city: location || undefined,
    limit: 8,
    enabled: typeaheadEnabled,
  });

  // Distinct specialties among the matches (the "Specialties" group in the dropdown).
  const specialtyGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of doctorResults) {
      const s = d.specialization || d.clinicSpecialty;
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].slice(0, 2);
  }, [doctorResults]);

  // Flat navigable list: doctors first, then specialty rows.
  const navItems = useMemo(
    () => [
      ...doctorResults.map((doctor) => ({ kind: 'doctor' as const, doctor })),
      ...specialtyGroups.map(([value, count]) => ({ kind: 'specialty' as const, value, count })),
    ],
    [doctorResults, specialtyGroups],
  );

  const showDropdown = isSearchFocused && typeaheadEnabled && navItems.length > 0;

  const goToDoctor = (clinicId: string, staffId: string) => {
    navigate(`/booking/${clinicId}?staffId=${encodeURIComponent(staffId)}`);
  };

  const goToSpecialty = (specialty: string) => {
    const params = new URLSearchParams();
    params.set('specialty', specialty);
    if (location) params.set('city', location);
    navigate(`/doctors?${params.toString()}`);
  };

  const selectNavItem = (item: (typeof navItems)[number]) => {
    setIsSearchFocused(false);
    setActiveIndex(-1);
    if (item.kind === 'doctor') {
      goToDoctor(item.doctor.clinicId, item.doctor.staffId);
    } else {
      goToSpecialty(item.value);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % navItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? navItems.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < navItems.length) {
        e.preventDefault();
        selectNavItem(navItems[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsSearchFocused(false);
      setActiveIndex(-1);
    }
  };

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (location) params.set('city', location);
    navigate(`/doctors${params.toString() ? '?' + params.toString() : ''}`);
  };

  const handleSpecialtyClick = (specialty: string) => {
    navigate(`/doctors?specialty=${encodeURIComponent(specialty)}`);
  };

  const handleBrowseAll = () => {
    navigate('/clinics');
  };

  const handleUseExactLocation = () => {
    setLocationTouched(false);
    detected.requestPreciseLocation(clinicStats?.cities);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero Section - Search Focus + Illustration */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center min-h-[calc(100vh-120px)] py-12">

            {/* Left Side - Search Panel (Primary Focus) */}
            <div className="space-y-8">
              {/* Location Badge */}
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <MapPin className="w-4 h-4" />
                <span className="text-foreground">
                  {detected.status === 'detecting'
                    ? t('landing.location.detecting')
                    : detected.city
                      ? t('landing.location.near', { city: detected.city })
                      : t('landing.location.morocco')}
                </span>
                <button
                  type="button"
                  onClick={() => locationInputRef.current?.focus()}
                  className="text-foreground font-medium underline underline-offset-4 hover:no-underline"
                >
                  {t('landing.location.changeLocation')}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={handleUseExactLocation}
                  disabled={detected.isLocating}
                  className="text-foreground font-medium underline underline-offset-4 hover:no-underline inline-flex items-center gap-1 disabled:opacity-60"
                >
                  {detected.isLocating
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Navigation className="w-3.5 h-3.5" />}
                  {t('landing.location.useExactLocation')}
                </button>
              </div>

              {/* Main Headline */}
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground leading-[1.1] tracking-tight">
                  {t('landing.hero.title1')}{' '}
                  <span className="block">{t('landing.hero.title2')}</span>
                  <span className="block">{t('landing.hero.title3')}</span>
                </h1>
                <p className="text-lg lg:text-xl text-muted-foreground max-w-md">
                  {t('landing.hero.subtitle')}
                </p>
              </div>

              {/* Search Card */}
              <form onSubmit={handleSearch} className="bg-card rounded-2xl border border-border shadow-xl p-2 max-w-xl">
                <div className="space-y-1">
                  {/* Doctor / Specialty Search with live typeahead */}
                  <div className="relative">
                    <div className="relative flex items-center">
                      <div className="absolute left-4 w-2.5 h-2.5 rounded-full bg-obsidian z-10"></div>
                      <Input
                        type="text"
                        placeholder={t('landing.search.doctorPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setActiveIndex(-1);
                        }}
                        onFocus={() => {
                          if (blurTimeout.current) clearTimeout(blurTimeout.current);
                          setIsSearchFocused(true);
                        }}
                        onBlur={() => {
                          blurTimeout.current = setTimeout(() => setIsSearchFocused(false), 150);
                        }}
                        onKeyDown={handleSearchKeyDown}
                        role="combobox"
                        aria-expanded={showDropdown}
                        aria-autocomplete="list"
                        className="pl-10 pr-10 h-14 border-0 bg-muted rounded-xl text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:bg-muted"
                      />
                      {isSearching && typeaheadEnabled && (
                        <Loader2 className="absolute right-4 w-4 h-4 text-muted-foreground animate-spin" />
                      )}
                    </div>

                    {showDropdown && (
                      <div
                        className="absolute z-30 left-0 right-0 top-full mt-2 bg-card rounded-xl border border-border shadow-2xl overflow-hidden max-h-[360px] overflow-y-auto"
                        role="listbox"
                      >
                        {doctorResults.map((doctor, idx) => (
                          <button
                            key={doctor.staffId}
                            type="button"
                            role="option"
                            aria-selected={activeIndex === idx}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => selectNavItem({ kind: 'doctor', doctor })}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                              activeIndex === idx ? "bg-muted" : "hover:bg-muted",
                            )}
                          >
                            <div className="w-9 h-9 rounded-full bg-obsidian flex items-center justify-center text-white text-xs font-semibold shrink-0">
                              {doctor.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {doctor.fullName}
                                {(doctor.specialization || doctor.clinicSpecialty) && (
                                  <span className="text-muted-foreground font-normal">
                                    {' · '}{doctor.specialization || doctor.clinicSpecialty}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {doctor.clinicName}{doctor.city ? ` · ${doctor.city}` : ''}
                              </div>
                            </div>
                          </button>
                        ))}

                        {specialtyGroups.length > 0 && (
                          <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">
                            {t('landing.search.specialtyGroup')}
                          </div>
                        )}
                        {specialtyGroups.map(([value, count], i) => {
                          const idx = doctorResults.length + i;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="option"
                              aria-selected={activeIndex === idx}
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => selectNavItem({ kind: 'specialty', value, count })}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                activeIndex === idx ? "bg-muted" : "hover:bg-muted",
                              )}
                            >
                              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <Stethoscope className="w-4 h-4 text-foreground" />
                              </div>
                              <div className="text-sm text-foreground">
                                {value}
                                <span className="text-muted-foreground">
                                  {' '}({t('landing.search.specialtyCount', { count })})
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Vertical Line Connector */}
                  <div className="flex items-center pl-[18px]">
                    <div className="w-0.5 h-4 bg-muted"></div>
                  </div>

                  {/* Location Search */}
                  <div className="relative flex items-center">
                    <div className="absolute left-4 w-2.5 h-2.5 bg-obsidian"></div>
                    <Input
                      ref={locationInputRef}
                      type="text"
                      placeholder={t('landing.search.locationPlaceholder')}
                      value={location}
                      onChange={(e) => {
                        setLocation(e.target.value);
                        setLocationTouched(true);
                      }}
                      className="pl-10 pr-12 h-14 border-0 bg-muted rounded-xl text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:bg-muted"
                    />
                    <button
                      type="button"
                      onClick={() => locationInputRef.current?.focus()}
                      className="absolute right-3 p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Search Button */}
                <Button
                  type="submit"
                  className="w-full h-14 mt-3 bg-obsidian hover:bg-obsidian-hover text-white font-semibold text-base rounded-xl transition-all"
                >
                  {t('landing.search.searchDoctorsButton')}
                </Button>
              </form>

              {/* Quick Links */}
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <button
                  onClick={handleBrowseAll}
                  className="text-foreground font-medium underline underline-offset-4 hover:no-underline flex items-center gap-1"
                >
                  {t('landing.search.browseAll')}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(user ? '/my-appointments' : '/auth/login')}
                  className="text-muted-foreground font-medium hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  {user ? t('landing.search.myAppointments') : t('landing.search.signIn')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Side - Hero Illustration */}
            <div className="relative hidden lg:flex items-center justify-center">
              <div className="relative w-full max-w-[600px]">
                <img 
                  src={heroImage} 
                  alt={t('landing.accessibility.heroImageAlt')}
                  className="w-full h-auto rounded-3xl shadow-2xl object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Zero Wait Time Spotlight Section - Executive Dashboard */}
      <section className="relative py-20 lg:py-28 text-white overflow-hidden bg-obsidian">
        {/* Subtle noise texture overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
        
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center relative">
            {/* Center Vertical Divider - Dashboard feel */}
            <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[70%] w-px bg-card/10" />
            
            {/* Left - The Countdown Instrument */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 mb-6">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </div>
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.2em]">
                  {t('landing.spotlight.liveLabel')}
                </span>
              </div>
              
              {/* Precision Instrument Display */}
              <div className="flex items-baseline justify-center lg:justify-start gap-3">
                {typeof clinicStats?.averageWaitMinutes === 'number' ? (
                  <CountUp
                    from={0}
                    to={clinicStats.averageWaitMinutes}
                    duration={1.2}
                    delay={0.1}
                    className="text-[100px] lg:text-[140px] font-light text-white leading-none tracking-tight"
                    style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}
                  />
                ) : (
                  <span
                    className="text-[100px] lg:text-[140px] font-light text-white leading-none tracking-tight"
                    style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}
                  >
                    --
                  </span>
                )}
                <span className="text-3xl lg:text-4xl font-light text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
                  {t('features.minutes')}
                </span>
              </div>
              
              {/* Amber/Gold precision bar */}
              <div className="flex justify-center lg:justify-start mt-4">
                <div className="relative w-48 h-[2px] bg-card/10 rounded-full overflow-hidden">
                  <div 
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ 
                      width: '100%',
                      background: 'linear-gradient(90deg, #D4A853 0%, #C9A227 50%, #D4A853 100%)',
                      boxShadow: '0 0 12px rgba(201, 162, 39, 0.5)'
                    }}
                  />
                </div>
              </div>
              
              <p className="text-lg lg:text-xl text-muted-foreground mt-6 tracking-wide">
                {typeof clinicStats?.averageWaitMinutes === 'number'
                  ? t('landing.spotlight.averageWaitDescription')
                  : t('landing.spotlight.waitUnavailable')}
              </p>
            </div>

            {/* Right - Value Props */}
            <div className="space-y-8 lg:pl-8">
              <h2 className="text-3xl lg:text-4xl font-bold leading-tight">
                {t('landing.spotlight.title')}
              </h2>
              <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                {t('landing.spotlight.description')}
              </p>
              
              {/* Trust Grid with dividers */}
              <div className="flex items-start">
                <div className="flex-1 pr-6">
                  <p className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
                    {formatCompactNumber(clinicStats?.totalClinics || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 uppercase tracking-wider">{t('landing.spotlight.partnerClinics')}</p>
                </div>
                <div className="w-px h-14 bg-card/10" />
                <div className="flex-1 px-6">
                  <p className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
                    {formatCompactNumber(clinicStats?.totalRatings || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 uppercase tracking-wider">{t('landing.spotlight.patientReviews')}</p>
                </div>
                <div className="w-px h-14 bg-card/10" />
                <div className="flex-1 pl-6">
                  <p className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
                    {typeof clinicStats?.avgRating === 'number' ? clinicStats.avgRating.toFixed(1) : t('landing.spotlight.noRating')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 uppercase tracking-wider">{t('landing.spotlight.avgRating')}</p>
                </div>
              </div>

              <Button
                onClick={handleBrowseAll}
                className="h-12 px-8 bg-card text-foreground hover:bg-muted font-semibold rounded-xl border-0"
              >
                {t('landing.spotlight.findClinic')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Suggestions Section */}
      <section className="py-16 lg:py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-10">
            {t('landing.suggestions.title')}
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* General Practice Card */}
            <button
              onClick={() => handleSpecialtyClick('General Practice')}
              className="group relative bg-muted hover:bg-muted rounded-2xl p-6 text-left transition-all duration-300 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">{t('landing.suggestions.generalCare')}</h3>
                  <p className="text-muted-foreground text-sm max-w-[200px]">
                    {t('landing.suggestions.generalCareDesc')}
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:underline">
                      {t('landing.suggestions.details')}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
                <div className="w-32 h-32 relative rounded-xl overflow-hidden" style={{ backgroundColor: '#EEEEE8' }}>
                  <img 
                    src={stethoscopeImage} 
                    alt={t('landing.accessibility.generalCareAlt')}
                    className="w-full h-full object-contain block mix-blend-multiply transform scale-110 group-hover:scale-[1.15] transition-transform"
                    style={{ filter: 'contrast(1.05) brightness(1.02)' }}
                  />
                </div>
              </div>
            </button>

            {/* Dentistry Card */}
            <button
              onClick={() => handleSpecialtyClick('Dentistry')}
              className="group relative bg-muted hover:bg-muted rounded-2xl p-6 text-left transition-all duration-300 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">{t('landing.suggestions.dental')}</h3>
                  <p className="text-muted-foreground text-sm max-w-[200px]">
                    {t('landing.suggestions.dentalDesc')}
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:underline">
                      {t('landing.suggestions.details')}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
                <div className="w-32 h-32 relative rounded-xl overflow-hidden" style={{ backgroundColor: '#EEEEE8' }}>
                  <img 
                    src={dentistryImage} 
                    alt={t('landing.accessibility.dentalAlt')}
                    className="w-full h-full object-contain block mix-blend-multiply transform scale-110 group-hover:scale-[1.15] transition-transform"
                    style={{ filter: 'contrast(1.05) brightness(1.02)' }}
                  />
                </div>
              </div>
            </button>

            {/* Specialist Card */}
            <button
              onClick={() => handleSpecialtyClick('Cardiology')}
              className="group relative bg-muted hover:bg-muted rounded-2xl p-6 text-left transition-all duration-300 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">{t('landing.suggestions.specialists')}</h3>
                  <p className="text-muted-foreground text-sm max-w-[200px]">
                    {t('landing.suggestions.specialistsDesc')}
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:underline">
                      {t('landing.suggestions.details')}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
                <div className="w-32 h-32 relative rounded-xl overflow-hidden" style={{ backgroundColor: '#EEEEE8' }}>
                  <img 
                    src={heartImage} 
                    alt={t('landing.accessibility.specialistsAlt')}
                    className="w-full h-full object-contain block mix-blend-multiply transform scale-110 group-hover:scale-[1.15] transition-transform"
                    style={{ filter: 'contrast(1.05) brightness(1.02)' }}
                  />
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Account Section */}
      <section className="py-16 lg:py-24 bg-muted">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left Side - Image */}
            <div className="relative">
              <div className="aspect-[4/3] bg-muted rounded-3xl overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 bg-card rounded-full shadow-lg mx-auto flex items-center justify-center">
                      <User className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">{t('landing.account.dashboardLabel')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Content */}
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                {t('landing.account.title')}
              </h2>
              <p className="text-lg text-muted-foreground max-w-md">
                {t('landing.account.description')}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() => navigate('/auth/login')}
                  className="h-12 px-8 bg-obsidian hover:bg-obsidian-hover text-white font-semibold rounded-xl transition-colors"
                >
                  {t('landing.account.signIn')}
                </Button>
                <Button
                  onClick={() => navigate('/auth/signup')}
                  variant="outline"
                  className="h-12 px-8 border-2 border-obsidian text-obsidian font-semibold rounded-xl transition-colors hover:bg-obsidian hover:text-white"
                >
                  {t('landing.account.createAccount')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Clinics Section */}
      <section className="py-16 lg:py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left Side - Content */}
            <div className="space-y-6 order-2 lg:order-1">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                {t('landing.forClinics.title')}
              </h2>
              <p className="text-lg text-muted-foreground max-w-md">
                {t('landing.forClinics.description')}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() => navigate('/auth/signup')}
                  className="h-12 px-8 bg-obsidian hover:bg-obsidian-hover text-white font-semibold rounded-xl transition-colors"
                >
                  {t('landing.forClinics.register')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/welcome')}
                  className="h-12 px-8 border-2 border-obsidian text-obsidian font-semibold rounded-xl transition-colors hover:bg-obsidian hover:text-white"
                >
                  {t('landing.forClinics.learnMore')}
                </Button>
              </div>
            </div>

            {/* Right Side - Image */}
            <div className="relative order-1 lg:order-2">
              <div className="aspect-[4/3] rounded-3xl overflow-hidden bg-obsidian">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 bg-card rounded-full shadow-lg mx-auto flex items-center justify-center">
                      <Building2 className="w-12 h-12 text-foreground" />
                    </div>
                    <p className="text-muted-foreground">{t('landing.forClinics.dashboardLabel')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-white py-12 lg:py-16 bg-obsidian">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.company')}</h3>
              <ul className="space-y-3">
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.aboutUs')}</a></li>
                <li><a href="/auth/signup" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.careers')}</a></li>
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.blog')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.products')}</h3>
              <ul className="space-y-3">
                <li><a href="/clinics" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.findClinics')}</a></li>
                <li><a href="/auth/signup" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.forClinics')}</a></li>
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.api')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.support')}</h3>
              <ul className="space-y-3">
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.helpCenter')}</a></li>
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.contactUs')}</a></li>
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.safety')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.legal')}</h3>
              <ul className="space-y-3">
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.terms')}</a></li>
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.privacy')}</a></li>
                <li><a href="/welcome" className="text-muted-foreground hover:text-white transition-colors">{t('landing.footer.cookies')}</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-muted-foreground text-sm">{t('landing.footer.copyright')}</p>
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground text-sm">{t('landing.location.morocco')}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PremiumLanding;

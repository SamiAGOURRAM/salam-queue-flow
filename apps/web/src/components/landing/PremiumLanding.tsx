import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin, ArrowRight, Stethoscope, Heart, Activity,
  User, Shield, Star, Building2, Users, Menu, X
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const PremiumLanding = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch clinic metadata for stats and specialties
  const { data: clinicStats } = useQuery({
    queryKey: ['clinic-stats'],
    queryFn: async () => {
      const { data: clinics, error } = await supabase
        .from('clinics')
        .select('id, specialty, city')
        .eq('is_active', true);

      if (error) throw error;

      const specialties = [...new Set(clinics?.map(c => c.specialty) || [])];
      const cities = [...new Set(clinics?.map(c => c.city) || [])];

      return {
        totalClinics: clinics?.length || 0,
        specialties: specialties.slice(0, 6),
        cities,
        avgRating: '4.8'
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (location) params.set('city', location);
    navigate(`/clinics${params.toString() ? '?' + params.toString() : ''}`);
  };

  const handleSpecialtyClick = (specialty: string) => {
    navigate(`/clinics?specialty=${encodeURIComponent(specialty)}`);
  };

  const handleBrowseAll = () => {
    navigate('/clinics');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Premium Navigation Header - Uber Style */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <span className="text-2xl font-bold text-black tracking-tight">QueueMed</span>
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-8">
              <button
                onClick={() => navigate('/clinics')}
                className="text-sm font-medium text-gray-700 hover:text-black transition-colors"
              >
                {t('landing.nav.findClinics')}
              </button>
              <button
                onClick={() => navigate('/welcome')}
                className="text-sm font-medium text-gray-700 hover:text-black transition-colors"
              >
                {t('landing.nav.about')}
              </button>
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4">
              {/* Language Switcher */}
              <div className="hidden sm:block">
                <LanguageSwitcher />
              </div>

              {/* Help Link */}
              <button className="hidden lg:block text-sm font-medium text-gray-700 hover:text-black transition-colors">
                {t('landing.nav.help')}
              </button>

              {/* Auth Buttons */}
              {user ? (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => navigate('/my-appointments')}
                    variant="ghost"
                    className="hidden sm:inline-flex h-10 px-4 text-sm font-medium"
                  >
                    {t('landing.search.myAppointments')}
                  </Button>
                  <Button
                    onClick={signOut}
                    variant="outline"
                    className="h-10 px-4 text-sm font-medium border-2 border-black text-black rounded-full hover:bg-black hover:text-white transition-colors"
                  >
                    {t('landing.nav.signOut')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => navigate('/auth/login')}
                    variant="ghost"
                    className="hidden sm:inline-flex h-10 px-4 text-sm font-medium"
                  >
                    {t('landing.nav.logIn')}
                  </Button>
                  <Button
                    onClick={() => navigate('/auth/signup')}
                    className="h-10 px-4 text-sm font-medium bg-black text-white rounded-full hover:bg-gray-900 transition-colors"
                  >
                    {t('landing.nav.signUp')}
                  </Button>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 -mr-2"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-100">
              <nav className="flex flex-col gap-2">
                <button
                  onClick={() => { navigate('/clinics'); setMobileMenuOpen(false); }}
                  className="px-4 py-3 text-left text-base font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  {t('landing.nav.findClinics')}
                </button>
                <button
                  onClick={() => { navigate('/welcome'); setMobileMenuOpen(false); }}
                  className="px-4 py-3 text-left text-base font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  {t('landing.nav.about')}
                </button>
                {user && (
                  <button
                    onClick={() => { navigate('/my-appointments'); setMobileMenuOpen(false); }}
                    className="px-4 py-3 text-left text-base font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    {t('landing.search.myAppointments')}
                  </button>
                )}
                <div className="px-4 py-2">
                  <LanguageSwitcher />
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center min-h-[calc(100vh-80px)] py-12">

            {/* Left Side - Search Panel */}
            <div className="space-y-8">
              {/* Location Badge */}
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4" />
                <span className="text-gray-700">{t('landing.location.morocco')}</span>
                <button className="text-black font-medium underline underline-offset-4 hover:no-underline">
                  {t('landing.location.changeLocation')}
                </button>
              </div>

              {/* Main Headline */}
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold text-black leading-[1.1] tracking-tight">
                  {t('landing.hero.title1')}{' '}
                  <span className="block">{t('landing.hero.title2')}</span>
                  <span className="block">{t('landing.hero.title3')}</span>
                </h1>
                <p className="text-lg lg:text-xl text-gray-600 max-w-md">
                  {t('landing.hero.subtitle')}
                </p>
              </div>

              {/* Search Card - Uber Style */}
              <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 shadow-xl p-2 max-w-xl">
                {/* Search Inputs */}
                <div className="space-y-1">
                  {/* Specialty/Clinic Search */}
                  <div className="relative flex items-center">
                    <div className="absolute left-4 w-2.5 h-2.5 rounded-full bg-black"></div>
                    <Input
                      type="text"
                      placeholder={t('landing.search.specialtyPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 h-14 border-0 bg-gray-50 rounded-xl text-base placeholder:text-gray-400 focus-visible:ring-0 focus-visible:bg-gray-100"
                    />
                  </div>

                  {/* Vertical Line Connector */}
                  <div className="flex items-center pl-[18px]">
                    <div className="w-0.5 h-4 bg-gray-300"></div>
                  </div>

                  {/* Location Search */}
                  <div className="relative flex items-center">
                    <div className="absolute left-4 w-2.5 h-2.5 bg-black"></div>
                    <Input
                      type="text"
                      placeholder={t('landing.search.locationPlaceholder')}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="pl-10 pr-12 h-14 border-0 bg-gray-50 rounded-xl text-base placeholder:text-gray-400 focus-visible:ring-0 focus-visible:bg-gray-100"
                    />
                    <button type="button" className="absolute right-3 p-2 hover:bg-gray-200 rounded-lg transition-colors">
                      <MapPin className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>

                {/* Search Button */}
                <Button
                  type="submit"
                  className="w-full h-14 mt-3 bg-black hover:bg-gray-900 text-white font-semibold text-base rounded-xl transition-all"
                >
                  {t('landing.search.searchButton')}
                </Button>
              </form>

              {/* Quick Links */}
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <button
                  onClick={handleBrowseAll}
                  className="text-black font-medium underline underline-offset-4 hover:no-underline flex items-center gap-1"
                >
                  {t('landing.search.browseAll')}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(user ? '/my-appointments' : '/auth/login')}
                  className="text-gray-600 font-medium hover:text-black flex items-center gap-1 transition-colors"
                >
                  {user ? t('landing.search.myAppointments') : t('landing.search.signIn')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Side - Hero Image/Illustration */}
            <div className="relative hidden lg:block">
              <div className="relative w-full aspect-square max-w-[600px] mx-auto">
                {/* Background Shape */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-50 rounded-[3rem] overflow-hidden">
                  {/* Decorative Elements */}
                  <div className="absolute top-8 right-8 w-20 h-20 bg-black/5 rounded-3xl transform rotate-12"></div>
                  <div className="absolute bottom-12 left-8 w-16 h-16 bg-black/5 rounded-2xl transform -rotate-6"></div>

                  {/* Main Illustration Area */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Doctor/Medical Illustration Placeholder */}
                      <div className="w-72 h-72 bg-gradient-to-br from-blue-100 to-cyan-50 rounded-full flex items-center justify-center">
                        <div className="w-48 h-48 bg-white rounded-full shadow-xl flex items-center justify-center">
                          <Stethoscope className="w-24 h-24 text-gray-300" />
                        </div>
                      </div>

                      {/* Floating Stats Cards */}
                      <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-lg p-4 border border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                            <Shield className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">{t('landing.stats.verifiedClinics')}</p>
                            <p className="text-lg font-bold">{clinicStats?.totalClinics || '50'}+</p>
                          </div>
                        </div>
                      </div>

                      <div className="absolute -bottom-4 -left-8 bg-white rounded-2xl shadow-lg p-4 border border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                            <Star className="w-5 h-5 text-yellow-600" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">{t('landing.stats.avgRating')}</p>
                            <p className="text-lg font-bold">{clinicStats?.avgRating || '4.8'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="absolute top-1/2 -right-16 transform -translate-y-1/2 bg-black text-white rounded-2xl shadow-lg p-4">
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          <div>
                            <p className="text-xs text-gray-400">{t('landing.stats.patientsServed')}</p>
                            <p className="text-lg font-bold">10K+</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Suggestions Section - Uber Style */}
      <section className="py-16 lg:py-24 border-t border-gray-100">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <h2 className="text-3xl lg:text-4xl font-bold text-black mb-10">
            {t('landing.suggestions.title')}
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* General Practice Card */}
            <button
              onClick={() => handleSpecialtyClick('General Practice')}
              className="group relative bg-gray-50 hover:bg-gray-100 rounded-2xl p-6 text-left transition-all duration-300 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-black">{t('landing.suggestions.generalCare')}</h3>
                  <p className="text-gray-600 text-sm max-w-[200px]">
                    {t('landing.suggestions.generalCareDesc')}
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-black group-hover:underline">
                      {t('landing.suggestions.details')}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
                <div className="w-24 h-24 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl flex items-center justify-center transform group-hover:scale-105 transition-transform">
                    <Stethoscope className="w-12 h-12 text-blue-600" />
                  </div>
                </div>
              </div>
            </button>

            {/* Dentistry Card */}
            <button
              onClick={() => handleSpecialtyClick('Dentistry')}
              className="group relative bg-gray-50 hover:bg-gray-100 rounded-2xl p-6 text-left transition-all duration-300 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-black">{t('landing.suggestions.dental')}</h3>
                  <p className="text-gray-600 text-sm max-w-[200px]">
                    {t('landing.suggestions.dentalDesc')}
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-black group-hover:underline">
                      {t('landing.suggestions.details')}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
                <div className="w-24 h-24 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-100 to-cyan-50 rounded-2xl flex items-center justify-center transform group-hover:scale-105 transition-transform">
                    <Heart className="w-12 h-12 text-cyan-600" />
                  </div>
                </div>
              </div>
            </button>

            {/* Specialist Card */}
            <button
              onClick={() => handleSpecialtyClick('Cardiology')}
              className="group relative bg-gray-50 hover:bg-gray-100 rounded-2xl p-6 text-left transition-all duration-300 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-black">{t('landing.suggestions.specialists')}</h3>
                  <p className="text-gray-600 text-sm max-w-[200px]">
                    {t('landing.suggestions.specialistsDesc')}
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-black group-hover:underline">
                      {t('landing.suggestions.details')}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
                <div className="w-24 h-24 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-100 to-red-50 rounded-2xl flex items-center justify-center transform group-hover:scale-105 transition-transform">
                    <Activity className="w-12 h-12 text-red-500" />
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Account Section - Uber Style */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left Side - Image */}
            <div className="relative">
              <div className="aspect-[4/3] bg-gray-100 rounded-3xl overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 bg-white rounded-full shadow-lg mx-auto flex items-center justify-center">
                      <User className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="text-gray-500">Your health dashboard</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Content */}
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-4xl font-bold text-black leading-tight">
                {t('landing.account.title')}
              </h2>
              <p className="text-lg text-gray-600 max-w-md">
                {t('landing.account.description')}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() => navigate('/auth/login')}
                  className="h-12 px-8 bg-black hover:bg-gray-900 text-white font-semibold rounded-xl"
                >
                  {t('landing.account.signIn')}
                </Button>
                <Button
                  onClick={() => navigate('/auth/signup')}
                  variant="outline"
                  className="h-12 px-8 border-2 border-black text-black font-semibold rounded-xl hover:bg-black hover:text-white transition-colors"
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
              <h2 className="text-3xl lg:text-4xl font-bold text-black leading-tight">
                {t('landing.forClinics.title')}
              </h2>
              <p className="text-lg text-gray-600 max-w-md">
                {t('landing.forClinics.description')}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() => navigate('/auth/signup')}
                  className="h-12 px-8 bg-black hover:bg-gray-900 text-white font-semibold rounded-xl"
                >
                  {t('landing.forClinics.register')}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-8 border-2 border-black text-black font-semibold rounded-xl hover:bg-black hover:text-white transition-colors"
                >
                  {t('landing.forClinics.learnMore')}
                </Button>
              </div>
            </div>

            {/* Right Side - Image */}
            <div className="relative order-1 lg:order-2">
              <div className="aspect-[4/3] bg-gray-900 rounded-3xl overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 bg-white rounded-full shadow-lg mx-auto flex items-center justify-center">
                      <Building2 className="w-12 h-12 text-gray-700" />
                    </div>
                    <p className="text-gray-400">Clinic dashboard</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12 lg:py-16">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.company')}</h3>
              <ul className="space-y-3">
                <li><a href="/welcome" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.aboutUs')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.careers')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.blog')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.products')}</h3>
              <ul className="space-y-3">
                <li><a href="/clinics" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.findClinics')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.forClinics')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.api')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.support')}</h3>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.helpCenter')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.contactUs')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.safety')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">{t('landing.footer.legal')}</h3>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.terms')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.privacy')}</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">{t('landing.footer.cookies')}</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">{t('landing.footer.copyright')}</p>
            <div className="flex items-center gap-6">
              <span className="text-gray-400 text-sm">{t('landing.location.morocco')}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PremiumLanding;

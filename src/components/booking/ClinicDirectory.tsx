import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  ArrowRight, Zap, Timer, DollarSign, Stethoscope, X, Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

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
        title: "Error",
        description: "Failed to load clinics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTodaySchedule = (clinic: Clinic) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const schedule = clinic.settings?.working_hours?.[today];
    
    if (!schedule || schedule.closed) {
      return { isOpen: false, hours: "Closed" };
    }
    
    return { 
      isOpen: true, 
      hours: `${schedule.open} - ${schedule.close}` 
    };
  };

  const getPaymentMethods = (clinic: Clinic) => {
    const methods = clinic.settings?.payment_methods || {};
    return [
      { name: "Cash", icon: Wallet, enabled: methods.cash },
      { name: "Card", icon: CreditCard, enabled: methods.card },
      { name: "Insurance", icon: Building2, enabled: methods.insurance },
      { name: "Online", icon: Globe, enabled: methods.online },
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
    setFavorites(prev => 
      prev.includes(clinicId) 
        ? prev.filter(id => id !== clinicId)
        : [...prev, clinicId]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-96 w-full rounded-3xl bg-blue-100/50" />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-[320px] rounded-3xl bg-blue-100/50" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50 relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Hero Section - TRANSPARENT BACKGROUND */}
        <div className="relative mb-12 backdrop-blur-md bg-white/30 border border-white/20 rounded-[2.5rem] shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 to-sky-400/10 blur-3xl"></div>
          
          <div className="relative p-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200">
                  <Activity className="w-4 h-4 text-blue-600 animate-pulse" />
                  <span className="text-sm font-medium text-blue-900">Healthcare Excellence</span>
                  <Badge className="bg-gradient-to-r from-green-400 to-emerald-400 text-white border-0">LIVE</Badge>
                </div>
                
                <h1 className="text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
                  Your Health,
                  <span className="block bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
                    Our Priority
                  </span>
                </h1>
                
                <p className="text-xl text-gray-600 leading-relaxed">
                  Connect with top-rated healthcare providers. Real-time availability, instant booking, and exceptional care.
                </p>

                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white shadow-lg border border-blue-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{clinics.length}+</p>
                      <p className="text-xs text-gray-500">Verified Clinics</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white shadow-lg border border-blue-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-lg">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">10K+</p>
                      <p className="text-xs text-gray-500">Happy Patients</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white shadow-lg border border-blue-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">24/7</p>
                      <p className="text-xs text-gray-500">Instant Booking</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-sky-400/20 blur-2xl"></div>
                <div className="relative grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xl transform hover:scale-105 hover:-rotate-1 transition-all duration-300 cursor-pointer border-0">
                      <Shield className="w-8 h-8 mb-3" />
                      <p className="font-semibold">Verified Doctors</p>
                      <p className="text-blue-100 text-sm mt-1">All credentials checked</p>
                    </Card>
                    <Card className="p-6 bg-white shadow-xl border border-blue-100 transform hover:scale-105 hover:rotate-1 transition-all duration-300 cursor-pointer">
                      <Star className="w-8 h-8 text-yellow-500 mb-3" />
                      <p className="text-gray-900 font-semibold">Top Rated</p>
                      <p className="text-gray-500 text-sm mt-1">Patient reviews</p>
                    </Card>
                  </div>
                  <div className="space-y-4 mt-8">
                    <Card className="p-6 bg-white shadow-xl border border-blue-100 transform hover:scale-105 hover:-rotate-1 transition-all duration-300 cursor-pointer">
                      <Timer className="w-8 h-8 text-blue-600 mb-3" />
                      <p className="text-gray-900 font-semibold">No Wait Time</p>
                      <p className="text-gray-500 text-sm mt-1">Book instantly</p>
                    </Card>
                    <Card className="p-6 bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-xl transform hover:scale-105 hover:rotate-1 transition-all duration-300 cursor-pointer border-0">
                      <Award className="w-8 h-8 mb-3" />
                      <p className="font-semibold">Best Price</p>
                      <p className="text-sky-100 text-sm mt-1">Transparent pricing</p>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filters - TRANSPARENT BACKGROUND */}
        <Card className="backdrop-blur-md bg-white/30 border border-white/20 rounded-3xl p-8 mb-8 shadow-xl">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">Find Your Clinic</h2>
                <p className="text-gray-600">Search from our network of premium healthcare providers</p>
              </div>
              <Button 
                variant="ghost"
                className="text-gray-600 hover:bg-blue-50"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-sky-400 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity"></div>
              <div className="relative">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search clinics, specialties, or locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-14 pr-6 h-16 bg-white border-2 border-blue-100 text-gray-900 placeholder:text-gray-400 rounded-2xl text-lg focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="h-14 bg-white border-2 border-blue-100 text-gray-900 rounded-2xl hover:border-blue-300 focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all">
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent className="bg-white border-blue-100">
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        {city}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                <SelectTrigger className="h-14 bg-white border-2 border-blue-100 text-gray-900 rounded-2xl hover:border-blue-300 focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all">
                  <SelectValue placeholder="All Specialties" />
                </SelectTrigger>
                <SelectContent className="bg-white border-blue-100">
                  <SelectItem value="all">All Specialties</SelectItem>
                  {specialties.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      <div className="flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-blue-600" />
                        {specialty}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200">
              <p className="text-blue-900 font-semibold">
                {filteredClinics.length} {filteredClinics.length === 1 ? "Clinic" : "Clinics"} Found
              </p>
            </div>
            {(searchTerm || selectedCity !== "all" || selectedSpecialty !== "all") && (
              <Badge className="bg-white border-blue-200 text-blue-600">
                Filtered
              </Badge>
            )}
          </div>
        </div>

        {/* Clinics Grid */}
        {filteredClinics.length === 0 ? (
          <Card className="backdrop-blur-md bg-white/40 border border-white/20 rounded-3xl p-20 text-center shadow-xl">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center mx-auto mb-6">
                <Search className="w-12 h-12 text-blue-400" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3">No Clinics Found</h3>
              <p className="text-gray-500 mb-8">Try adjusting your filters or search terms</p>
              <Button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                }}
                className="bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white px-8 py-6 rounded-2xl text-lg font-semibold shadow-xl hover:shadow-2xl transition-all"
              >
                Clear All Filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
            {filteredClinics.map((clinic) => {
              const todaySchedule = getTodaySchedule(clinic);
              const paymentMethods = getPaymentMethods(clinic);
              const allowWalkIns = clinic.settings?.allow_walk_ins;
              const avgDuration = clinic.settings?.average_appointment_duration;
              const isFavorite = favorites.includes(clinic.id);

              return (
                <div
                  key={clinic.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredCard(clinic.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {/* Glow Effect */}
                  <div className={`absolute -inset-0.5 bg-gradient-to-r from-blue-400 to-sky-400 rounded-3xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300`}></div>
                  
                  <Card 
                    className="relative backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-300 h-full"
                    onClick={() => navigate(`/clinic/${clinic.id}`)}
                  >
                    {/* COMPACT Header */}
                    <div className="relative h-28 bg-gradient-to-br from-blue-400 via-sky-400 to-cyan-400">
                      <div className="absolute inset-0 bg-white/20"></div>
                      
                      {/* Minimal Floating Elements */}
                      <div className="absolute inset-0 opacity-10">
                        <Plus className="absolute top-2 left-4 w-4 h-4 text-white rotate-12" />
                        <Stethoscope className="absolute bottom-2 right-3 w-5 h-5 text-white -rotate-12" />
                      </div>
                      
                      {/* Status & Favorite in one row */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20">
                        <Badge className={`${todaySchedule.isOpen ? 'bg-green-500' : 'bg-gray-500'} text-white border-0 shadow-lg text-xs px-2 py-1`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${todaySchedule.isOpen ? 'bg-white animate-pulse' : 'bg-gray-300'} mr-1`}></div>
                          {todaySchedule.isOpen ? "Open" : "Closed"}
                        </Badge>
                        <button
                          onClick={(e) => toggleFavorite(e, clinic.id)}
                          className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center hover:bg-white transition-all"
                        >
                          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                        </button>
                      </div>

                      {/* Compact Logo */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {clinic.logo_url ? (
                          <img 
                            src={clinic.logo_url} 
                            alt={clinic.name} 
                            className="h-14 w-14 object-contain bg-white rounded-xl p-2 shadow-xl" 
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-white shadow-xl flex items-center justify-center">
                            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                              {clinic.name.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* COMPACT Content */}
                    <div className="p-4 space-y-3">
                      {/* Name, Specialty & Rating inline */}
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1.5 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {clinic.name}
                        </h3>
                        <div className="flex items-center justify-between gap-2">
                          <Badge className="bg-gradient-to-r from-blue-100/80 to-sky-100/80 border-blue-200/50 text-blue-700 text-xs px-2 py-0.5">
                            {clinic.specialty}
                          </Badge>
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-semibold text-gray-700">4.8</span>
                          </div>
                        </div>
                      </div>

                      {/* Compact Info */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="h-3 w-3 text-blue-600 flex-shrink-0" />
                          <span className="line-clamp-1">{clinic.city}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="h-3 w-3 text-sky-600 flex-shrink-0" />
                          <span className="font-medium">{todaySchedule.hours}</span>
                        </div>
                      </div>

                      {/* Features & Payment in one row */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100/50">
                        <div className="flex flex-wrap gap-1">
                          {allowWalkIns && (
                            <Badge className="bg-emerald-50/80 border-emerald-200/50 text-emerald-700 text-xs px-2 py-0.5">
                              <Zap className="w-2.5 h-2.5 mr-0.5" />
                              Walk-in
                            </Badge>
                          )}
                          {avgDuration && (
                            <Badge className="bg-amber-50/80 border-amber-200/50 text-amber-700 text-xs px-2 py-0.5">
                              {avgDuration}min
                            </Badge>
                          )}
                        </div>
                        
                        {paymentMethods.length > 0 && (
                          <div className="flex items-center gap-1">
                            {paymentMethods.slice(0, 3).map((method) => (
                              <div
                                key={method.name}
                                className="w-6 h-6 rounded-lg bg-gray-50/80 border border-gray-200/50 flex items-center justify-center"
                                title={method.name}
                              >
                                <method.icon className="h-3 w-3 text-gray-600" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Compact Book Button */}
                      <Button className="w-full h-10 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white border-0 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all group text-sm">
                        <Calendar className="w-3.5 h-3.5 mr-1.5" />
                        <span>Book Now</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDirectory;
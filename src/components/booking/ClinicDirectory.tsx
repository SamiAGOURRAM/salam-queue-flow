import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Phone, Clock, Calendar, CreditCard, Wallet, Building2, Globe, Check, Sparkles, TrendingUp, Filter } from "lucide-react";
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[420px] rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 p-12 text-white shadow-2xl mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-48 -mt-48 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-400/10 rounded-full -ml-32 -mb-32 blur-3xl"></div>
          
          <div className="relative z-10 text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 mb-4">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Find Quality Healthcare</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
              Your Health, Your Choice
            </h1>
            <p className="text-xl text-blue-100 mb-6">
              Browse trusted healthcare providers and book appointments instantly
            </p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                <span>{clinics.length} Active Clinics</span>
              </div>
              <div className="w-px h-4 bg-white/30"></div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span>Real-time Availability</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filters Card */}
        <Card className="border-0 shadow-xl mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 p-6 border-b">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">Find Your Perfect Clinic</h2>
            </div>
            <p className="text-sm text-muted-foreground">Search by name, specialty, or location</p>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by clinic name, specialty, or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-14 text-base border-2 focus:border-blue-400 rounded-xl"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="h-12 border-2 rounded-xl">
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent>
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
                <SelectTrigger className="h-12 border-2 rounded-xl">
                  <SelectValue placeholder="All Specialties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Specialties</SelectItem>
                  {specialties.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
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
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <span className="font-semibold text-gray-900">{filteredClinics.length}</span>
            {filteredClinics.length === 1 ? "clinic" : "clinics"} found
          </p>
          {(searchTerm || selectedCity !== "all" || selectedSpecialty !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setSelectedCity("all");
                setSelectedSpecialty("all");
              }}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              Clear all filters
            </Button>
          )}
        </div>

        {/* Clinics Grid */}
        {filteredClinics.length === 0 ? (
          <Card className="p-16 text-center border-0 shadow-lg">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
              <Search className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No clinics found</h3>
            <p className="text-muted-foreground mb-6">Try adjusting your search criteria</p>
            <Button
              onClick={() => {
                setSearchTerm("");
                setSelectedCity("all");
                setSelectedSpecialty("all");
              }}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
            >
              Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClinics.map((clinic) => {
              const todaySchedule = getTodaySchedule(clinic);
              const paymentMethods = getPaymentMethods(clinic);
              const allowWalkIns = clinic.settings?.allow_walk_ins;
              const avgDuration = clinic.settings?.average_appointment_duration;

              return (
                <Card
                  key={clinic.id}
                  className="group hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 cursor-pointer overflow-hidden border-0 shadow-lg"
                  onClick={() => navigate(`/clinic/${clinic.id}`)}
                >
                  {/* Logo Section with Gradient */}
                  <div className="h-36 bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
                    {clinic.logo_url ? (
                      <img src={clinic.logo_url} alt={clinic.name} className="h-20 object-contain relative z-10" />
                    ) : (
                      <div className="text-6xl font-bold text-white relative z-10">{clinic.name.charAt(0)}</div>
                    )}
                    
                    {/* Floating Badge */}
                    <div className="absolute top-4 right-4 z-10">
                      <Badge 
                        className={`${
                          todaySchedule.isOpen 
                            ? "bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/50" 
                            : "bg-gray-500"
                        } border-0 px-3 py-1 font-semibold`}
                      >
                        {todaySchedule.isOpen ? "Open Now" : "Closed"}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Clinic Name & Specialty */}
                    <div>
                      <h3 className="text-xl font-bold mb-1 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {clinic.name}
                      </h3>
                      <Badge className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0">
                        {clinic.specialty}
                      </Badge>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-2.5 text-sm">
                      <div className="flex items-start gap-2 text-gray-600">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                        <span className="line-clamp-1">{clinic.address}, {clinic.city}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="h-4 w-4 flex-shrink-0 text-blue-600" />
                        <span className="font-medium">{clinic.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="h-4 w-4 flex-shrink-0 text-blue-600" />
                        <span className="font-semibold text-gray-900">{todaySchedule.hours}</span>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    {paymentMethods.length > 0 && (
                      <div className="pt-3 border-t">
                        <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Payment Options</p>
                        <div className="flex flex-wrap gap-2">
                          {paymentMethods.map((method) => (
                            <div
                              key={method.name}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100"
                            >
                              <method.icon className="h-3.5 w-3.5" />
                              <span>{method.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Info Pills */}
                    {(allowWalkIns || avgDuration) && (
                      <div className="flex items-center gap-2 pt-3 border-t">
                        {allowWalkIns && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
                            <Check className="h-3 w-3" />
                            <span>Walk-ins OK</span>
                          </div>
                        )}
                        {avgDuration && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
                            <Clock className="h-3 w-3" />
                            <span>~{avgDuration}min</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Book Button */}
                    <Button className="w-full h-12 gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all text-base font-semibold">
                      <Calendar className="h-5 w-5" />
                      Book Appointment
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDirectory;
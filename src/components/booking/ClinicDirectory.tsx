import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Phone, Clock, Calendar, CreditCard, Wallet, Building2, Globe, Check } from "lucide-react";
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
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Skeleton className="h-12 w-full" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Find Your Healthcare Provider</h1>
          <p className="text-lg text-muted-foreground">Book appointments instantly with trusted clinics</p>
        </div>

        {/* Search & Filters */}
        <div className="bg-card rounded-lg shadow-lg p-6 mb-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by clinic name, specialty, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger>
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
              <SelectTrigger>
                <SelectValue placeholder="All Specialties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialties</SelectItem>
                {specialties.map((specialty) => (
                  <SelectItem key={specialty} value={specialty}>
                    {specialty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            Showing {filteredClinics.length} {filteredClinics.length === 1 ? "clinic" : "clinics"}
          </p>
        </div>

        {/* Clinics Grid */}
        {filteredClinics.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-lg text-muted-foreground mb-4">No clinics found matching your criteria</p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setSelectedCity("all");
                setSelectedSpecialty("all");
              }}
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
                  className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border-0"
                  onClick={() => navigate(`/clinic/${clinic.id}`)}
                >
                  {/* Logo Section */}
                  <div className="h-32 bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center relative">
                    {clinic.logo_url ? (
                      <img src={clinic.logo_url} alt={clinic.name} className="h-20 object-contain" />
                    ) : (
                      <div className="text-5xl font-bold text-white">{clinic.name.charAt(0)}</div>
                    )}
                    
                    {/* Open/Closed Badge */}
                    <div className="absolute top-3 right-3">
                      <Badge 
                        variant={todaySchedule.isOpen ? "default" : "secondary"}
                        className={todaySchedule.isOpen ? "bg-green-500 hover:bg-green-600" : ""}
                      >
                        {todaySchedule.isOpen ? "Open Today" : "Closed"}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Clinic Name & Specialty */}
                    <div>
                      <h3 className="text-xl font-semibold mb-1 group-hover:text-primary transition-colors">
                        {clinic.name}
                      </h3>
                      <p className="text-sm text-primary font-medium">{clinic.specialty}</p>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{clinic.address}, {clinic.city}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        <span>{clinic.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span className="font-medium">{todaySchedule.hours}</span>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    {paymentMethods.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Payment Methods</p>
                        <div className="flex flex-wrap gap-2">
                          {paymentMethods.map((method) => (
                            <div
                              key={method.name}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                            >
                              <method.icon className="h-3 w-3" />
                              <span>{method.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Info */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                      {allowWalkIns && (
                        <div className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-green-500" />
                          <span>Walk-ins</span>
                        </div>
                      )}
                      {avgDuration && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>~{avgDuration} min</span>
                        </div>
                      )}
                    </div>

                    {/* Book Button */}
                    <Button className="w-full gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                      <Calendar className="h-4 w-4" />
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
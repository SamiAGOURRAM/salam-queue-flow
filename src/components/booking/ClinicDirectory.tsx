import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, Phone, Clock, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Clinic {
  id: string;
  name: string;
  name_ar: string | null;
  specialty: string;
  city: string;
  address: string;
  phone: string;
  logo_url: string | null;
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
      setClinics(data || []);
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
              <Skeleton key={i} className="h-64" />
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
            {filteredClinics.map((clinic) => (
              <Card
                key={clinic.id}
                className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden"
                onClick={() => navigate(`/clinic/${clinic.id}`)}
              >
                <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  {clinic.logo_url ? (
                    <img src={clinic.logo_url} alt={clinic.name} className="h-20 object-contain" />
                  ) : (
                    <div className="text-4xl font-bold text-primary/30">{clinic.name.charAt(0)}</div>
                  )}
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-1 group-hover:text-primary transition-colors">
                      {clinic.name}
                    </h3>
                    <p className="text-sm text-primary font-medium">{clinic.specialty}</p>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{clinic.address}, {clinic.city}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      <span>{clinic.phone}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button className="flex-1 gap-2">
                      <Calendar className="h-4 w-4" />
                      Book Now
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicDirectory;

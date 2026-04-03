import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Building2, Stethoscope, Calendar, ArrowRight, User } from "lucide-react";

interface DoctorListing {
  staffId: string;
  clinicId: string;
  fullName: string;
  role: string;
  specialization: string | null;
  clinicName: string;
  clinicSpecialty: string;
  city: string;
}

function formatRole(role: string): string {
  const normalized = role.replace(/_/g, " ").trim();
  if (!normalized) return "Doctor";

  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function isDoctorLikeRole(role: string, specialization: string | null): boolean {
  const normalized = role.toLowerCase();
  if (normalized.includes("doctor")) return true;
  if (specialization) return true;

  const clinicalRoles = new Set([
    "surgeon",
    "dentist",
    "radiologist",
    "anesthesiologist",
    "physiotherapist",
    "cardiologist",
    "neurologist",
    "pediatrician",
    "orthopedist",
    "dermatologist",
  ]);

  return clinicalRoles.has(normalized);
}

const DoctorDirectory = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["doctor-directory"],
    queryFn: async () => {
      type StaffRow = Pick<Database["public"]["Tables"]["clinic_staff"]["Row"], "id" | "clinic_id" | "user_id" | "role" | "specialization">;
      type ClinicRow = Pick<Database["public"]["Tables"]["clinics"]["Row"], "id" | "name" | "specialty" | "city" | "is_active">;
      type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name">;

      const { data: staffData, error: staffError } = await supabase
        .from("clinic_staff")
        .select("id, clinic_id, user_id, role, specialization")
        .eq("is_active", true);

      if (staffError) throw staffError;

      const staffRows = (staffData as StaffRow[]) || [];
      if (staffRows.length === 0) return [] as DoctorListing[];

      const clinicIds = [...new Set(staffRows.map((row) => row.clinic_id))];
      const { data: clinicsData, error: clinicsError } = await supabase
        .from("clinics")
        .select("id, name, specialty, city, is_active")
        .in("id", clinicIds)
        .eq("is_active", true);

      if (clinicsError) throw clinicsError;

      const clinicRows = (clinicsData as ClinicRow[]) || [];
      const clinicsById = new Map(clinicRows.map((clinic) => [clinic.id, clinic]));

      const userIds = [...new Set(staffRows.map((row) => row.user_id))];
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profileRows = (profilesData as ProfileRow[]) || [];
      const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));

      const listings: DoctorListing[] = [];
      let fallbackCounter = 1;

      for (const staff of staffRows) {
        const clinic = clinicsById.get(staff.clinic_id);
        if (!clinic) continue;
        if (!isDoctorLikeRole(staff.role, staff.specialization)) continue;

        const profile = profilesById.get(staff.user_id);
        const fullName = profile?.full_name?.trim() || `Doctor ${fallbackCounter++}`;

        listings.push({
          staffId: staff.id,
          clinicId: clinic.id,
          fullName,
          role: formatRole(staff.role),
          specialization: staff.specialization,
          clinicName: clinic.name,
          clinicSpecialty: clinic.specialty,
          city: clinic.city,
        });
      }

      return listings.sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
    staleTime: 5 * 60 * 1000,
  });

  const cities = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.city))].sort((a, b) => a.localeCompare(b)),
    [doctors],
  );

  const specialties = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialization || doctor.clinicSpecialty))]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b)),
    [doctors],
  );

  const filteredDoctors = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return doctors.filter((doctor) => {
      if (selectedCity !== "all" && doctor.city !== selectedCity) return false;

      const specialtyValue = doctor.specialization || doctor.clinicSpecialty;
      if (selectedSpecialty !== "all" && specialtyValue !== selectedSpecialty) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        doctor.fullName,
        doctor.role,
        doctor.specialization || "",
        doctor.clinicName,
        doctor.clinicSpecialty,
        doctor.city,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [doctors, searchTerm, selectedCity, selectedSpecialty]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <Skeleton className="h-10 w-64 mb-6" />
          <Skeleton className="h-14 w-full mb-6 rounded-lg" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((id) => (
              <Skeleton key={id} className="h-[220px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Browse Doctors</h1>
          <p className="text-sm text-gray-500 mt-1">{filteredDoctors.length} doctors available</p>
        </header>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6 p-3 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by doctor, specialty, clinic, or city"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 pl-9 pr-3 border-gray-200 rounded-md text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="h-10 w-[140px] border-gray-200 rounded-md text-sm">
                <MapPin className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
              <SelectTrigger className="h-10 w-[180px] border-gray-200 rounded-md text-sm">
                <Stethoscope className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                <SelectValue placeholder="All specialties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All specialties</SelectItem>
                {specialties.map((specialty) => (
                  <SelectItem key={specialty} value={specialty}>{specialty}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredDoctors.length === 0 ? (
          <Card className="bg-white border border-gray-200 rounded-lg p-10 text-center">
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <User className="w-6 h-6 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No doctors found</h2>
            <p className="text-sm text-gray-500 mb-5">Try changing your search or browse clinics instead.</p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCity("all");
                  setSelectedSpecialty("all");
                }}
                variant="outline"
                className="h-9 px-4 rounded-md"
              >
                Clear filters
              </Button>
              <Button
                onClick={() => navigate("/clinics")}
                className="h-9 px-4 bg-obsidian hover:bg-obsidian-hover text-white rounded-md"
              >
                Browse Clinics
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDoctors.map((doctor) => (
              <Card
                key={doctor.staffId}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-obsidian flex items-center justify-center text-white text-sm font-semibold">
                    {doctor.fullName.charAt(0).toUpperCase()}
                  </div>
                  <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px] font-medium">
                    {doctor.role}
                  </Badge>
                </div>

                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{doctor.fullName}</h3>
                <p className="text-xs text-gray-500 mb-3">{doctor.specialization || doctor.clinicSpecialty}</p>

                <div className="space-y-1.5 text-xs text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{doctor.clinicName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span>{doctor.city}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => navigate(`/booking/${doctor.clinicId}?staffId=${encodeURIComponent(doctor.staffId)}`)}
                    className="flex-1 h-9 bg-obsidian hover:bg-obsidian-hover text-white text-xs font-medium rounded-md"
                  >
                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                    Book
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/clinic/${doctor.clinicId}`)}
                    className="h-9 px-3 border-gray-200 text-xs font-medium rounded-md"
                  >
                    Clinic
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorDirectory;

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Phone, Mail, Clock, Calendar, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Clinic {
  id: string;
  name: string;
  name_ar: string | null;
  specialty: string;
  city: string;
  address: string;
  phone: string;
  email: string | null;
  logo_url: string | null;
  settings: any;
}

interface Staff {
  id: string;
  role: string;
  specialization: string | null;
  user_id: string;
  profiles: {
    full_name: string;
  };
}

const ClinicDetailView = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clinicId) {
      fetchClinicDetails();
    }
  }, [clinicId]);

  const fetchClinicDetails = async () => {
    try {
      setLoading(true);

      const { data: clinicData, error: clinicError } = await supabase
        .from("clinics")
        .select("*")
        .eq("id", clinicId)
        .eq("is_active", true)
        .single();

      if (clinicError) throw clinicError;
      setClinic(clinicData);

      const { data: staffData, error: staffError } = await supabase
        .from("clinic_staff")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("is_active", true);

      if (staffError) throw staffError;

      // Fetch profile data for each staff member
      if (staffData && staffData.length > 0) {
        const staffWithProfiles = await Promise.all(
          staffData.map(async (member) => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", member.user_id)
              .single();

            return {
              ...member,
              profiles: profile || { full_name: "Staff Member" },
            };
          })
        );
        setStaff(staffWithProfiles as any);
      }
    } catch (error) {
      console.error("Error fetching clinic details:", error);
      toast({
        title: "Error",
        description: "Failed to load clinic details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-12 text-center">
          <p className="text-lg text-muted-foreground mb-4">Clinic not found</p>
          <Button onClick={() => navigate("/")}>Back to Directory</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => navigate("/")} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Clinics
        </Button>

        {/* Clinic Header */}
        <Card className="p-8 mb-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-32 h-32 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg flex items-center justify-center flex-shrink-0">
              {clinic.logo_url ? (
                <img src={clinic.logo_url} alt={clinic.name} className="h-24 object-contain" />
              ) : (
                <div className="text-5xl font-bold text-primary/30">{clinic.name.charAt(0)}</div>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">{clinic.name}</h1>
                <Badge variant="secondary" className="text-sm">{clinic.specialty}</Badge>
              </div>

              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>{clinic.address}, {clinic.city}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{clinic.phone}</span>
                </div>
                {clinic.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{clinic.email}</span>
                  </div>
                )}
              </div>

              <Button size="lg" onClick={() => navigate(`/booking/${clinic.id}`)} className="gap-2">
                <Calendar className="h-5 w-5" />
                Book Appointment
              </Button>
            </div>
          </div>
        </Card>

        {/* Working Hours */}
        {clinic.settings?.working_hours && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Working Hours
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(clinic.settings.working_hours).map(([day, hours]: [string, any]) => (
                <div key={day} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium capitalize">{day}</span>
                  <span className="text-sm text-muted-foreground">
                    {hours.closed ? "Closed" : `${hours.open} - ${hours.close}`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Staff Members */}
        {staff.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Our Team
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staff.map((member) => (
                <div key={member.id} className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <h3 className="font-semibold">{member.profiles?.full_name || "Staff Member"}</h3>
                  <p className="text-sm text-primary">{member.role}</p>
                  {member.specialization && (
                    <p className="text-sm text-muted-foreground">{member.specialization}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ClinicDetailView;

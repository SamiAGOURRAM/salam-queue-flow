import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Calendar, 
  User,
  CreditCard,
  Wallet,
  Building2,
  Globe,
  Check,
  X,
  Timer,
  Users
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

  const getTodaySchedule = () => {
    if (!clinic?.settings?.working_hours) return { isOpen: false, hours: "Closed" };
    
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const schedule = clinic.settings.working_hours[today];
    
    if (!schedule || schedule.closed) {
      return { isOpen: false, hours: "Closed" };
    }
    
    return { 
      isOpen: true, 
      hours: `${schedule.open} - ${schedule.close}` 
    };
  };

  const getPaymentMethods = () => {
    if (!clinic?.settings?.payment_methods) return [];
    
    const methods = clinic.settings.payment_methods;
    return [
      { name: "Cash", icon: Wallet, enabled: methods.cash },
      { name: "Card", icon: CreditCard, enabled: methods.card },
      { name: "Insurance", icon: Building2, enabled: methods.insurance },
      { name: "Online Payment", icon: Globe, enabled: methods.online },
    ];
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

  const todaySchedule = getTodaySchedule();
  const paymentMethods = getPaymentMethods();
  const appointmentTypes = clinic.settings?.appointment_types || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 ">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate("/")} 
          className="mb-6 gap-2 hover:gap-3 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clinics
        </Button>

        {/* Hero Section - Clinic Header */}
{/* Hero Section - Clinic Header */}
<Card className="overflow-hidden border-0 shadow-xl mb-6">
  <div className="h-12 bg-gradient-to-br from-blue-600 to-cyan-600 relative">
    <div className="absolute top-2 right-4">
      <Badge 
        variant={todaySchedule.isOpen ? "default" : "secondary"}
        className={`${todaySchedule.isOpen ? "bg-green-500 hover:bg-green-600" : ""} text-sm px-3 py-1`}
      >
        {todaySchedule.isOpen ? "Open Now" : "Closed"}
      </Badge>
    </div>
  </div>

  <div className="p-4 pt-4">
    <div className="flex flex-col md:flex-row gap-6">
      {/* Logo */}
      <div className="w-20 h-20 bg-white rounded-xl shadow-lg flex items-center justify-center flex-shrink-0 border-4 border-background">
        {clinic.logo_url ? (
          <img src={clinic.logo_url} alt={clinic.name} className="h-14 object-contain" />
        ) : (
          <div className="text-3xl font-bold text-primary">{clinic.name.charAt(0)}</div>
        )}
      </div>

      {/* Clinic Info */}
      <div className="flex-1 space-y-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{clinic.name}</h1>
          <Badge className="text-sm bg-gradient-to-r from-blue-600 to-cyan-600">
            {clinic.specialty}
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0" />
            <span className="font-medium">{clinic.address}, {clinic.city}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <span className="font-medium">{clinic.phone}</span>
          </div>
          {clinic.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <span className="font-medium">{clinic.email}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <span className="font-medium">Today: {todaySchedule.hours}</span>
          </div>
        </div>

        <Button 
          size="lg" 
          onClick={() => navigate(`/booking/${clinic.id}`)} 
          className="gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
        >
          <Calendar className="h-5 w-5" />
          Book Appointment
        </Button>
      </div>
    </div>
  </div>
</Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Payment Methods */}
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Payment Methods
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {paymentMethods.map((method) => (
                  <div
                    key={method.name}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                      method.enabled
                        ? "border-blue-200 bg-blue-50 dark:bg-blue-950/20"
                        : "border-gray-200 bg-gray-50 dark:bg-gray-900/20 opacity-50"
                    }`}
                  >
                    <method.icon className={`h-6 w-6 ${method.enabled ? "text-blue-600" : "text-gray-400"}`} />
                    <span className="text-xs font-medium text-center">{method.name}</span>
                    {method.enabled ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Appointment Types */}
            {appointmentTypes.length > 0 && (
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Timer className="h-5 w-5 text-blue-600" />
                Available Services
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {appointmentTypes.map((type) => (
                  <div
                    key={type.name}
                    className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border border-blue-100 dark:border-blue-900"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-lg">{type.label}</h3>
                      {/* NEW: Price Display */}
                      {type.price ? (
                        <div className="text-right">
                          <p className="text-xl font-bold text-blue-600">
                            {type.price.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">MAD</p>
                        </div>
                      ) : (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
                          Free
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {type.duration} minutes
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

            {/* Working Hours */}
            {clinic.settings?.working_hours && (
              <Card className="p-6 border-0 shadow-lg">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Working Hours
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(clinic.settings.working_hours).map(([day, hours]: [string, any]) => {
                    const isToday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()] === day;
                    return (
                      <div 
                        key={day} 
                        className={`flex justify-between items-center p-3 rounded-lg transition-all ${
                          isToday 
                            ? "bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-950/40 dark:to-cyan-950/40 border border-blue-200 dark:border-blue-800" 
                            : "bg-muted/50"
                        }`}
                      >
                        <span className={`font-medium capitalize ${isToday ? "text-blue-700 dark:text-blue-400" : ""}`}>
                          {day}
                          {isToday && " (Today)"}
                        </span>
                        <span className={`text-sm ${hours.closed ? "text-red-500" : "text-muted-foreground font-medium"}`}>
                          {hours.closed ? "Closed" : `${hours.open} - ${hours.close}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Clinic Features */}
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-xl font-semibold mb-4">Clinic Info</h2>
              <div className="space-y-3">
                {clinic.settings?.allow_walk_ins !== undefined && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    {clinic.settings.allow_walk_ins ? (
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">Walk-in Patients</p>
                      <p className="text-sm text-muted-foreground">
                        {clinic.settings.allow_walk_ins ? "Accepted" : "Not accepted"}
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.average_appointment_duration && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Clock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Avg. Appointment</p>
                      <p className="text-sm text-muted-foreground">
                        ~{clinic.settings.average_appointment_duration} minutes
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.max_queue_size && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Users className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Max Queue Size</p>
                      <p className="text-sm text-muted-foreground">
                        {clinic.settings.max_queue_size} patients
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.buffer_time && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Timer className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Buffer Time</p>
                      <p className="text-sm text-muted-foreground">
                        {clinic.settings.buffer_time} minutes between appointments
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Staff Members */}
            {staff.length > 0 && (
              <Card className="p-6 border-0 shadow-lg">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-600" />
                  Our Team
                </h2>
                <div className="space-y-3">
                  {staff.map((member) => (
                    <div key={member.id} className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-lg border border-blue-100 dark:border-blue-900">
                      <h3 className="font-semibold">{member.profiles?.full_name || "Staff Member"}</h3>
                      <p className="text-sm text-blue-600 font-medium">{member.role}</p>
                      {member.specialization && (
                        <p className="text-sm text-muted-foreground mt-1">{member.specialization}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicDetailView;
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
  Users,
  Star,
  Stethoscope,
  Shield,
  Zap
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
      { name: "Online", icon: Globe, enabled: methods.online },
    ];
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-14 w-48 mb-8 rounded-full bg-blue-100/50" />
          <Skeleton className="h-80 mb-6 rounded-3xl bg-blue-100/50" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 rounded-3xl bg-blue-100/50" />
              <Skeleton className="h-96 rounded-3xl bg-blue-100/50" />
            </div>
            <Skeleton className="h-96 rounded-3xl bg-blue-100/50" />
          </div>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="min-h-screen w-full">
        <div className="container mx-auto px-4 py-8">
          <Card className="backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl p-12 text-center shadow-xl">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center mx-auto mb-6">
              <Stethoscope className="w-12 h-12 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-2">Clinic not found</p>
            <p className="text-gray-600 mb-6">The clinic you're looking for doesn't exist or has been removed.</p>
            <Button 
              onClick={() => navigate("/")}
              className="bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white px-8 py-6 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Directory
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const todaySchedule = getTodaySchedule();
  const paymentMethods = getPaymentMethods();
  const appointmentTypes = clinic.settings?.appointment_types || [];

  return (
    <div className="min-h-screen w-full">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-8">
          <Button 
            onClick={() => navigate("/")} 
            className="bg-white/80 backdrop-blur-md border-2 border-white/60 shadow-lg hover:shadow-xl text-gray-900 hover:text-blue-600 rounded-full px-6 py-6 font-semibold transition-all group hover:scale-105"
          >
            <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Clinics
          </Button>
        </div>

        {/* Hero Section - Clinic Header */}
        <div className="relative mb-8">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-sky-400 rounded-3xl blur-2xl opacity-20"></div>
          <Card className="relative backdrop-blur-md bg-white/70 border border-white/40 rounded-3xl overflow-hidden shadow-2xl">
            {/* Header Gradient Bar - Increased height to h-32 */}
            <div className="h-16 bg-gradient-to-br from-blue-400 via-sky-400 to-cyan-400 relative">
              <div className="absolute inset-0 bg-white/20"></div>
              
              {/* Status Badge */}
              <div className="absolute top-4 right-4">
                <Badge className={`${todaySchedule.isOpen ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500'} text-white border-0 shadow-lg px-4 py-2`}>
                  <div className={`w-2 h-2 rounded-full ${todaySchedule.isOpen ? 'bg-white animate-pulse' : 'bg-gray-300'} mr-2`}></div>
                  {todaySchedule.isOpen ? "Open Now" : "Closed"}
                </Badge>
              </div>

              {/* Decorative Elements */}
              <div className="absolute inset-0 opacity-20">
                <Stethoscope className="absolute bottom-4 right-8 w-20 h-20 text-white -rotate-12" />
                <Shield className="absolute top-8 left-12 w-12 h-12 text-white rotate-12" />
              </div>
            </div>

            {/* Content Section - Adjusted margin to -mt-12 for better logo positioning */}
            <div className="p-8 -mt-6 relative">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Logo */}
                <div className="w-24 h-24 bg-white rounded-2xl shadow-2xl flex items-center justify-center flex-shrink-0 border-4 border-white relative z-10">
                  {clinic.logo_url ? (
                    <img src={clinic.logo_url} alt={clinic.name} className="h-16 object-contain" />
                  ) : (
                    <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                      {clinic.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Clinic Info - Added pt-2 for better vertical alignment */}
                <div className="flex-1 space-y-6 pt-2">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">{clinic.name}</h1>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className="bg-gradient-to-r from-blue-100 to-sky-100 border-blue-200 text-blue-700 text-sm px-4 py-1.5">
                        <Stethoscope className="w-4 h-4 mr-2" />
                        {clinic.specialty}
                      </Badge>
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} className={`w-4 h-4 ${i <= 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                        ))}
                        <span className="text-gray-700 text-sm ml-1 font-medium">4.8 (120 reviews)</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/60 backdrop-blur-sm">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center flex-shrink-0">
                        <MapPin className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Location</p>
                        <p className="font-semibold text-gray-900">{clinic.address}, {clinic.city}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/60 backdrop-blur-sm">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                        <Phone className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Phone</p>
                        <p className="font-semibold text-gray-900">{clinic.phone}</p>
                      </div>
                    </div>

                    {clinic.email && (
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/60 backdrop-blur-sm">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                          <Mail className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Email</p>
                          <p className="font-semibold text-gray-900">{clinic.email}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/60 backdrop-blur-sm">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                        <Clock className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Today's Hours</p>
                        <p className="font-semibold text-gray-900">{todaySchedule.hours}</p>
                      </div>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => navigate(`/booking/${clinic.id}`)} 
                    className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white px-8 h-14 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all text-lg group"
                  >
                    <Calendar className="h-5 w-5 mr-2" />
                    Book Appointment
                    <Zap className="h-5 w-5 ml-2 group-hover:rotate-12 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Payment Methods */}
            <Card className="backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl p-6 shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                Payment Methods
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {paymentMethods.map((method) => (
                  <div
                    key={method.name}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${
                      method.enabled
                        ? "border-blue-300 bg-gradient-to-br from-blue-50 to-sky-50 shadow-md hover:shadow-lg hover:scale-105"
                        : "border-gray-200 bg-gray-50 opacity-50"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      method.enabled ? "bg-gradient-to-br from-blue-500 to-sky-500" : "bg-gray-300"
                    }`}>
                      <method.icon className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-center text-gray-900">{method.name}</span>
                    {method.enabled ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Appointment Types */}
            {appointmentTypes.length > 0 && (
              <Card className="backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl p-6 shadow-xl">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center">
                    <Timer className="h-5 w-5 text-white" />
                  </div>
                  Available Services
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {appointmentTypes.map((type) => (
                    <div
                      key={type.name}
                      className="p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-100 shadow-md hover:shadow-lg transition-all hover:scale-105 cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-lg text-gray-900">{type.label}</h3>
                        {type.price ? (
                          <div className="text-right">
                            <p className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                              {type.price.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 font-medium">MAD</p>
                          </div>
                        ) : (
                          <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0">
                            Free
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">{type.duration} minutes</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Working Hours */}
            {clinic.settings?.working_hours && (
              <Card className="backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl p-6 shadow-xl">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  Working Hours
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(clinic.settings.working_hours).map(([day, hours]: [string, any]) => {
                    const isToday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()] === day;
                    return (
                      <div 
                        key={day} 
                        className={`flex justify-between items-center p-4 rounded-xl transition-all ${
                          isToday 
                            ? "bg-gradient-to-r from-blue-100 to-cyan-100 border-2 border-blue-300 shadow-md" 
                            : "bg-white/60 border border-gray-200"
                        }`}
                      >
                        <span className={`font-semibold capitalize ${isToday ? "text-blue-700" : "text-gray-900"}`}>
                          {day}
                          {isToday && <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Today</span>}
                        </span>
                        <span className={`text-sm font-medium ${hours.closed ? "text-red-500" : "text-gray-700"}`}>
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
            <Card className="backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl p-6 shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Clinic Info</h2>
              <div className="space-y-3">
                {clinic.settings?.allow_walk_ins !== undefined && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      clinic.settings.allow_walk_ins ? "bg-green-500" : "bg-red-500"
                    }`}>
                      {clinic.settings.allow_walk_ins ? (
                        <Check className="h-5 w-5 text-white" />
                      ) : (
                        <X className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Walk-in Patients</p>
                      <p className="text-sm text-gray-600">
                        {clinic.settings.allow_walk_ins ? "Accepted" : "Not accepted"}
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.average_appointment_duration && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center flex-shrink-0">
                      <Clock className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Avg. Appointment</p>
                      <p className="text-sm text-gray-600">
                        ~{clinic.settings.average_appointment_duration} minutes
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.max_queue_size && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Max Queue Size</p>
                      <p className="text-sm text-gray-600">
                        {clinic.settings.max_queue_size} patients
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.buffer_time && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <Timer className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Buffer Time</p>
                      <p className="text-sm text-gray-600">
                        {clinic.settings.buffer_time} min between appointments
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Staff Members */}
            {staff.length > 0 && (
              <Card className="backdrop-blur-md bg-white/60 border border-white/30 rounded-3xl p-6 shadow-xl">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  Our Team
                </h2>
                <div className="space-y-3">
                  {staff.map((member) => (
                    <div 
                      key={member.id} 
                      className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-100 shadow-md hover:shadow-lg transition-all hover:scale-105 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-sky-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">
                          {member.profiles?.full_name?.charAt(0) || "S"}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900">{member.profiles?.full_name || "Staff Member"}</h3>
                          <p className="text-sm font-semibold text-blue-600">{member.role}</p>
                          {member.specialization && (
                            <p className="text-sm text-gray-600 mt-1">{member.specialization}</p>
                          )}
                        </div>
                      </div>
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
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/shared/logging/Logger";
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
  ArrowRight,
  Heart,
  Share2,
  ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface WorkingHoursEntry {
  open?: string;
  close?: string;
  closed?: boolean;
}

interface ClinicSettings {
  buffer_time?: number;
  working_hours?: Record<string, WorkingHoursEntry>;
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
  settings: ClinicSettings | null;
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

interface StaffRecord {
  id: string;
  role: string;
  specialization: string | null;
  user_id: string;
}

const ClinicDetailView = () => {
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClinicDetails = useCallback(async () => {
    if (!clinicId) return;
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

      const staffRows = (staffData as StaffRecord[]) || [];

      if (staffRows.length > 0) {
        const staffWithProfiles = await Promise.all(
          staffRows.map(async (member) => {
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
        setStaff(staffWithProfiles as Staff[]);
      }
    } catch (error) {
      logger.error("Error fetching clinic details", error instanceof Error ? error : new Error(String(error)), { clinicId });
      toast({
        title: t('errors.error'),
        description: t('errors.failedToLoad'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [clinicId, toast, t]);

  useEffect(() => {
    if (clinicId) {
      fetchClinicDetails();
    }
  }, [clinicId, fetchClinicDetails]);

  const getTodaySchedule = () => {
    if (!clinic?.settings?.working_hours) return { isOpen: false, hours: t('common.closed') };

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const schedule = clinic.settings.working_hours[today];

    if (!schedule || schedule.closed) {
      return { isOpen: false, hours: t('common.closed') };
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
      { name: t('payment.cash'), icon: Wallet, enabled: methods.cash },
      { name: t('payment.card'), icon: CreditCard, enabled: methods.card },
      { name: t('payment.insurance'), icon: Building2, enabled: methods.insurance },
      { name: t('payment.online'), icon: Globe, enabled: methods.online },
    ];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-48 w-full mb-6 rounded-lg" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-40 rounded-lg" />
              <Skeleton className="h-56 rounded-lg" />
            </div>
            <Skeleton className="h-80 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Stethoscope className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">{t('clinic.noClinicsFound')}</h2>
            <p className="text-sm text-gray-500 mb-6">The clinic you're looking for doesn't exist or has been removed.</p>
            <Button
              onClick={() => navigate("/clinics")}
              className="h-9 px-4 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-md"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Clinics
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const todaySchedule = getTodaySchedule();
  const paymentMethods = getPaymentMethods();
  const appointmentTypes = clinic.settings?.appointment_types || [];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Back Navigation */}
        <button
          onClick={() => navigate("/clinics")}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to clinics
        </button>

        {/* Header Card */}
        <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              {/* Logo */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {clinic.logo_url ? (
                  <img src={clinic.logo_url} alt={clinic.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-gray-400">
                    {clinic.name.charAt(0)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
                        {clinic.name}
                      </h1>
                      <Badge className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        todaySchedule.isOpen
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      } border`}>
                        {todaySchedule.isOpen ? t('common.open') : t('common.closed')}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{clinic.specialty}</p>

                    {/* Rating */}
                    <div className="flex items-center gap-1.5 mb-4">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-medium text-gray-900">4.8</span>
                      <span className="text-xs text-gray-400">(120 reviews)</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="hidden sm:flex items-center gap-2">
                    <button className="w-9 h-9 rounded-md flex items-center justify-center border border-gray-200 hover:bg-gray-50 transition-colors">
                      <Heart className="w-4 h-4 text-gray-500" />
                    </button>
                    <button className="w-9 h-9 rounded-md flex items-center justify-center border border-gray-200 hover:bg-gray-50 transition-colors">
                      <Share2 className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Contact Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{clinic.address}, {clinic.city}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>{clinic.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>{todaySchedule.hours}</span>
                  </div>
                  {clinic.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{clinic.email}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => navigate(`/booking/${clinic.id}`)}
                className="h-10 px-6 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-md flex-1 sm:flex-none"
              >
                <Calendar className="w-4 h-4 mr-2" />
                {t('clinic.bookAppointment')}
              </Button>
              <p className="text-xs text-gray-400 self-center">Instant confirmation</p>
            </div>
          </div>
        </Card>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Services */}
            {appointmentTypes.length > 0 && (
              <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Available Services</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {appointmentTypes.map((type) => (
                    <div
                      key={type.name}
                      className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center">
                          <Timer className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{type.label}</p>
                          <p className="text-xs text-gray-500">{type.duration} {t('features.minutes')}</p>
                        </div>
                      </div>
                      {type.price ? (
                        <span className="text-sm font-semibold text-gray-900">{type.price} MAD</span>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px] font-medium">Free</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Payment Methods */}
            <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">{t('payment.methods')}</h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {paymentMethods.map((method) => (
                    <div
                      key={method.name}
                      className={`flex flex-col items-center gap-2 p-3 rounded-md transition-all ${
                        method.enabled
                          ? "bg-gray-50"
                          : "opacity-40"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-md flex items-center justify-center ${
                        method.enabled ? "bg-gray-900" : "bg-gray-300"
                      }`}>
                        <method.icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-xs font-medium text-gray-700">{method.name}</span>
                      {method.enabled ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Working Hours */}
            {clinic.settings?.working_hours && (
              <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">{t('time.workingHours')}</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {Object.entries(clinic.settings.working_hours).map(([day, hours]) => {
                    const isToday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()] === day;
                    return (
                      <div
                        key={day}
                        className={`px-5 py-3 flex items-center justify-between ${
                          isToday ? "bg-gray-900 text-white" : ""
                        }`}
                      >
                        <span className={`text-sm font-medium capitalize ${isToday ? "text-white" : "text-gray-700"}`}>
                          {day}
                          {isToday && (
                            <Badge className="ml-2 bg-white text-gray-900 text-[10px] font-medium border-0">
                              {t('time.today')}
                            </Badge>
                          )}
                        </span>
                        <span className={`text-sm ${
                          hours.closed
                            ? isToday ? "text-gray-300" : "text-red-500"
                            : isToday ? "text-white" : "text-gray-600"
                        }`}>
                          {hours.closed ? t('common.closed') : `${hours.open} - ${hours.close}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">

            {/* Clinic Features */}
            <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Clinic Info</h2>
              </div>
              <div className="p-5 space-y-3">
                {clinic.settings?.allow_walk_ins !== undefined && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-gray-50">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                      clinic.settings.allow_walk_ins ? "bg-emerald-500" : "bg-gray-400"
                    }`}>
                      {clinic.settings.allow_walk_ins ? (
                        <Check className="h-4 w-4 text-white" />
                      ) : (
                        <X className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t('features.walkIn')}</p>
                      <p className="text-xs text-gray-500">
                        {clinic.settings.allow_walk_ins ? t('features.walkInsOk') : "Appointment required"}
                      </p>
                    </div>
                  </div>
                )}

                {clinic.settings?.average_appointment_duration && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-gray-50">
                    <div className="w-8 h-8 rounded-md bg-gray-900 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t('features.averageTime')}</p>
                      <p className="text-xs text-gray-500">~{clinic.settings.average_appointment_duration} {t('features.minutes')}</p>
                    </div>
                  </div>
                )}

                {clinic.settings?.max_queue_size && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-gray-50">
                    <div className="w-8 h-8 rounded-md bg-gray-900 flex items-center justify-center">
                      <Users className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Max Queue</p>
                      <p className="text-xs text-gray-500">{clinic.settings.max_queue_size} patients</p>
                    </div>
                  </div>
                )}

                {clinic.settings?.buffer_time && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-gray-50">
                    <div className="w-8 h-8 rounded-md bg-gray-900 flex items-center justify-center">
                      <Timer className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Buffer Time</p>
                      <p className="text-xs text-gray-500">{clinic.settings.buffer_time} min between</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Team */}
            {staff.length > 0 && (
              <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Our Team</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {staff.map((member) => (
                    <div
                      key={member.id}
                      className="px-5 py-3 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
                        {member.profiles?.full_name?.charAt(0) || "S"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {member.profiles?.full_name || "Staff Member"}
                        </p>
                        <p className="text-xs text-gray-500">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Quick Book CTA */}
            <Card className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="p-5">
                <h3 className="text-base font-semibold text-white mb-1">Ready to book?</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Schedule your appointment now and skip the wait.
                </p>
                <Button
                  onClick={() => navigate(`/booking/${clinic.id}`)}
                  className="w-full h-9 bg-white hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-md"
                >
                  {t('clinic.bookNow')}
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicDetailView;

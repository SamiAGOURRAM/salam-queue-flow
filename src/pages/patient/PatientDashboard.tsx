import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { queueService } from "@/services/queue";
import { patientService } from "@/services/patient";
import { AppointmentStatus } from "@/services/queue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Clock, 
  Activity, 
  Search, 
  MapPin, 
  Building2, 
  Sparkles, 
  ArrowRight, 
  X, 
  MessageSquare,
  XCircle 
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import ReviewModal from "@/components/ReviewModal";
import { useTranslation } from "react-i18next";
import { logger } from "@/services/shared/logging/Logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Appointment {
  id: string;
  clinic_id: string;
  appointment_date: string;
  start_time: string | null;
  appointment_type: string;
  status: string;
  queue_position: number | null;
  clinic: {
    name: string;
    specialty: string;
    city: string;
  };
}

type FilterType = 'all' | 'upcoming' | 'completed' | 'cancelled' | null;

export default function PatientDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [patientFullName, setPatientFullName] = useState("");
  
  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedClinicForReview, setSelectedClinicForReview] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Cancel Confirmation State
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<{
    id: string;
    clinic_name: string;
    date: string;
    time: string;
  } | null>(null);

  const fetchPatientProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const profile = await patientService.getPatientProfile(user.id);
      setPatientFullName(profile.fullName);
    } catch (error) {
      logger.error("Error fetching patient name", error instanceof Error ? error : new Error(String(error)), { userId: user?.id });
    }
  }, [user]);

  const fetchAppointments = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingAppointments(true);
      
      const queueEntries = await queueService.getPatientAppointments(user.id);

      // Map QueueEntry to Appointment interface for backward compatibility
      const appointments: Appointment[] = queueEntries.map(entry => ({
        id: entry.id,
        clinic_id: entry.clinicId,
        appointment_date: entry.appointmentDate.toISOString().split('T')[0],
        start_time: entry.startTime?.toISOString() || null,
        appointment_type: entry.appointmentType,
        status: entry.status,
        queue_position: entry.queuePosition,
        clinic: entry.clinic ? {
          name: entry.clinic.name || 'Unknown Clinic',
          specialty: entry.clinic.specialty || '',
          city: entry.clinic.city || '',
        } : {
          name: 'Unknown Clinic',
          specialty: '',
          city: '',
        },
      }));

      setAppointments(appointments);
    } catch (error) {
      logger.error("Error fetching appointments", error instanceof Error ? error : new Error(String(error)), { userId: user?.id });
      toast({
        title: t('errors.error'),
        description: t('errors.failedToLoad'),
        variant: "destructive",
      });
    } finally {
      setLoadingAppointments(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (!loading && !user) {
      // Handle navigation if necessary
    } else if (user) {
      fetchPatientProfile();
      fetchAppointments();
    }
  }, [user, loading, navigate, fetchPatientProfile, fetchAppointments]);


  const handleCancelAppointment = async () => {
    if (!appointmentToCancel || !user?.id) return;
  
    try {
      logger.debug("Starting cancellation for appointment", { appointmentId: appointmentToCancel.id });
  
      // First verify patient owns this appointment
      const entry = await queueService.getQueueEntry(appointmentToCancel.id);
      
      if (entry.patientId !== user.id) {
        throw new Error("You don't have permission to cancel this appointment");
      }
      
      // Cancel using QueueService (proper service method)
      const cancelledEntry = await queueService.cancelAppointment(
        appointmentToCancel.id,
        user.id,
        "patient_request"
      );
  
      logger.info("Appointment cancelled successfully", { appointmentId: appointmentToCancel.id });
  
      // Refresh appointments list to get updated data
      await fetchAppointments();
  
      toast({
        title: "✅ Appointment Cancelled",
        description: `Your appointment at ${appointmentToCancel.clinic_name} has been cancelled.`,
      });
  
      setCancelDialogOpen(false);
      setAppointmentToCancel(null);

    } catch (error: unknown) {
      logger.error("Error cancelling appointment", error instanceof Error ? error : new Error(String(error)), { appointmentId: appointmentToCancel?.id, userId: user?.id });
      const description =
        error instanceof Error
          ? error.message
          : "Failed to cancel appointment. Please try again.";
      toast({
        title: "Cancellation Failed",
        description,
        variant: "destructive",
      });
    }
  };

  const confirmCancel = (
    appointmentId: string, 
    clinicName: string,
    date: string,
    time: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setAppointmentToCancel({
      id: appointmentId,
      clinic_name: clinicName,
      date: date,
      time: time
    });
    setCancelDialogOpen(true);
  };

  const getUpcomingAppointments = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return appointments.filter(apt => {
      const aptDate = new Date(apt.appointment_date);
      const isFutureOrToday = aptDate >= today;
      const isActiveStatus = ['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status);
      return isFutureOrToday && isActiveStatus;
    });
  };

  const getCompletedAppointments = () => {
    return appointments.filter(apt => apt.status === 'completed');
  };

  const getCancelledAppointments = () => {
    return appointments.filter(apt => apt.status === 'cancelled');
  };

  const getRecentAppointments = () => {
    return appointments
      .filter(apt => ['completed', 'cancelled', 'no_show'].includes(apt.status))
      .sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime())
      .slice(0, 5);
  };

  const getFilteredAppointments = () => {
    switch (activeFilter) {
      case 'all':
        return appointments;
      case 'upcoming':
        return getUpcomingAppointments();
      case 'completed':
        return getCompletedAppointments();
      case 'cancelled':
        return getCancelledAppointments();
      default:
        return getUpcomingAppointments();
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { labelKey: string, className: string }> = {
      scheduled: { labelKey: "scheduled", className: "bg-blue-500 text-white" },
      confirmed: { labelKey: "confirmed", className: "bg-indigo-500 text-white" },
      waiting: { labelKey: "waiting", className: "bg-amber-500 text-white" },
      in_progress: { labelKey: "in_progress", className: "bg-cyan-500 text-white" },
      completed: { labelKey: "completed", className: "bg-green-600 text-white" },
      cancelled: { labelKey: "cancelled", className: "bg-gray-400 text-white" },
      no_show: { labelKey: "no_show", className: "bg-red-500 text-white" }
    };
    
    const config = variants[status] || { labelKey: status, className: "bg-gray-300 text-gray-800" };
    return (
      <Badge className={`text-xs font-semibold rounded-full px-3 py-1 ${config.className}`}>
        {t(`appointments.status.${config.labelKey}`, { defaultValue: config.labelKey.replace(/_/g, ' ') })} 
      </Badge>
    );
  };

  const getFilterTitle = () => {
    switch (activeFilter) {
      case 'all':
        return t('appointments.filter.all', { defaultValue: 'All Appointments' }); 
      case 'upcoming':
        return t('appointments.filter.upcoming', { defaultValue: 'Upcoming Appointments' }); 
      case 'completed':
        return t('appointments.filter.completed', { defaultValue: 'Completed Appointments' });
      case 'cancelled':
        return t('appointments.filter.cancelled', { defaultValue: 'Cancelled Appointments' });
      default:
        return t('appointments.filter.upcoming', { defaultValue: 'Upcoming Appointments' });
    }
  };

  const handleOpenReviewModal = (clinicId: string, clinicName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClinicForReview({ id: clinicId, name: clinicName });
    setReviewModalOpen(true);
  };

  const handleCloseReviewModal = () => {
    setReviewModalOpen(false);
    setSelectedClinicForReview(null);
  };

  const upcomingAppointments = getUpcomingAppointments();
  const completedAppointments = getCompletedAppointments();
  const cancelledAppointments = getCancelledAppointments();
  const recentAppointments = getRecentAppointments();
  const displayedAppointments = getFilteredAppointments();

  const displayName = patientFullName || user?.user_metadata?.first_name || t('common.friend', { defaultValue: 'friend' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('common.loading')}</p> 
        </div>
      </div>
    );
  }
  
  if (!user && !loadingAppointments) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold">{t('auth.loginRequired')}</h3> 
        <p className="text-muted-foreground mb-6">
          {t('auth.pleaseLogin')}
        </p>
        <Button onClick={() => navigate("/auth/login")}>{t('nav.login')}</Button> 
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 p-8 md:p-16 text-white shadow-2xl mb-10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-40 -mt-40 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-120 h-120 bg-cyan-400/10 rounded-full -ml-60 -mb-60 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span className="text-sm font-medium text-blue-100 uppercase tracking-widest">
              {t('appointments.hero.journey', { defaultValue: 'Your Health Journey' })}
            </span> 
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-3 leading-tight">
            {t('appointments.hero.welcome', { defaultValue: 'Welcome back' })} <span className="text-amber-200">{displayName}</span> 👋
          </h1>
          <p className="text-xl text-blue-100 mb-10 max-w-3xl">
            {t('appointments.hero.tagline', { defaultValue: 'Quickly manage your upcoming visits and find new healthcare providers.' })} 
          </p>

          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => navigate("/")}
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 shadow-xl shadow-blue-900/20 h-14 px-8 gap-2 font-bold text-base transition-transform transform hover:scale-[1.03]"
            >
              <Search className="w-5 h-5" />
              {t('clinic.searchClinics')}
            </Button>
            
            {upcomingAppointments.length > 0 && (
              <Button
                onClick={() => document.getElementById('upcoming-list')?.scrollIntoView({ behavior: 'smooth' })}
                size="lg"
                variant="outline"
                className="bg-white/20 backdrop-blur-md border-2 border-white/50 text-white hover:bg-white/30 h-14 px-8 font-semibold transition-transform transform hover:scale-[1.03]"
              >
                <Calendar className="w-5 h-5 mr-2" />
                {t('appointments.count', { count: upcomingAppointments.length, context: 'upcoming', defaultValue: `${upcomingAppointments.length} Upcoming Appointments` })} 
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards - Clickable */}
      <div className="grid gap-6 md:grid-cols-3 mb-10">
        <Card 
          className={`border-0 shadow-xl transition-all overflow-hidden group cursor-pointer relative ${
            activeFilter === 'all' ? 'ring-4 ring-offset-2 ring-blue-500 shadow-2xl' : 'hover:shadow-2xl'
          }`}
          onClick={() => setActiveFilter('all')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-lg">
                <Calendar className="w-7 h-7 text-white" />
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-md text-muted-foreground mb-1">{t('appointments.total', { defaultValue: 'Total Appointments' })}</p> 
            <p className="text-4xl font-extrabold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {appointments.length}
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`border-0 shadow-xl transition-all overflow-hidden group cursor-pointer relative ${
            activeFilter === 'upcoming' ? 'ring-4 ring-offset-2 ring-amber-500 shadow-2xl' : 'hover:shadow-2xl'
          }`}
          onClick={() => setActiveFilter('upcoming')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center shadow-lg">
                <Clock className="w-7 h-7 text-white" />
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-md text-muted-foreground mb-1">{t('appointments.filter.upcoming', { defaultValue: 'Upcoming' })}</p> 
            <p className="text-4xl font-extrabold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              {upcomingAppointments.length}
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`border-0 shadow-xl transition-all overflow-hidden group cursor-pointer relative ${
            activeFilter === 'completed' ? 'ring-4 ring-offset-2 ring-green-600 shadow-2xl' : 'hover:shadow-2xl'
          }`}
          onClick={() => setActiveFilter('completed')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center shadow-lg">
                <Activity className="w-7 h-7 text-white" />
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-md text-muted-foreground mb-1">{t('appointments.filter.completed', { defaultValue: 'Completed' })}</p> 
            <p className="text-4xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {completedAppointments.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Appointments List */}
        <Card id="upcoming-list" className={`border-0 shadow-xl ${activeFilter ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
          <CardHeader className="border-b rounded-t-xl bg-gradient-to-r from-gray-50 to-blue-50/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold text-gray-800">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                  {getFilterTitle()}
                </CardTitle>
                <CardDescription className="text-base mt-1">
                  {loadingAppointments ? 
                    `${t('common.loading')}` 
                    : t('appointments.count', { count: displayedAppointments.length, defaultValue: `${displayedAppointments.length} appointments found.` })} 
                </CardDescription>
              </div>
              {activeFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFilter(null)}
                  className="gap-1 text-sm text-gray-600 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                  {t('common.clearFilter')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loadingAppointments ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : displayedAppointments.length === 0 ? (
              <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
                  <Calendar className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{t('appointments.noAppointments', { defaultValue: 'No appointments found' })}</h3> 
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  {activeFilter === 'completed' ? 
                    t('appointments.noCompleted', { defaultValue: "It looks like you haven't completed any visits yet." }) 
                    : activeFilter === 'cancelled' ?
                    "You haven't cancelled any appointments."
                    : t('appointments.schedulePrompt', { defaultValue: "Ready to schedule your next visit? Start by finding a clinic." }) 
                  }
                </p>
                <Button 
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-md transition-all h-10"
                  onClick={() => navigate("/")}
                >
                  <Search className="w-4 h-4 mr-2" />
                  {t('nav.clinics')} 
                </Button>
              </div>
            ) : (
              <div className={`grid gap-5 ${activeFilter ? 'md:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-1'}`}>
                {displayedAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="group p-5 border border-gray-100 rounded-xl hover:border-blue-400 hover:shadow-2xl transition-all cursor-pointer bg-white"
                    onClick={() => {
                      if (['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status)) {
                        navigate(`/patient/queue/${apt.id}`);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 pr-4">
                        <h4 className="font-extrabold text-lg flex items-center gap-2 mb-1 group-hover:text-blue-700 transition-colors">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          {apt.clinic.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">{apt.clinic.specialty}</p>
                      </div>
                      {getStatusBadge(apt.status)}
                    </div>
                    
                    <div className="flex flex-wrap gap-3 text-sm mb-4">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold">
                        <Calendar className="w-4 h-4" />
                        <span>{format(new Date(apt.appointment_date), t('appointments.dateFormat', { defaultValue: 'MMM d, yyyy' }))}</span> 
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">
                        <Clock className="w-4 h-4" />
                        <span>
                          {apt.start_time 
                            ? format(new Date(apt.start_time), 'HH:mm')
                            : 'N/A'
                          }
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-600 text-sm mb-4 border-t pt-3">
                      <MapPin className="w-4 h-4 text-green-600" />
                      <span className="font-medium">{apt.clinic.city}</span>
                      <Badge variant="outline" className="ml-auto text-xs border-blue-200 text-blue-600 font-medium">
                        {t(`appointments.type.${apt.appointment_type.toLowerCase()}`, { defaultValue: apt.appointment_type.replace(/_/g, ' ').toUpperCase() })} 
                      </Badge>
                    </div>
                    
                    {/* Actions Section */}
                    <div className="pt-3 border-t space-y-3">
                      {/* Queue Position */}
                      {apt.queue_position && ['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status) && (
                        <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 font-bold">
                          Position #{apt.queue_position}
                        </Badge>
                      )}
                      
                      {/* Active appointments - Buttons Row */}
                      {['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status) && (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-blue-600 group-hover:gap-2 transition-all flex-1">
                            <p className="text-sm font-bold">Go to Queue</p>
                            <ArrowRight className="w-4 h-4" />
                          </div>
                          
                          {/* Cancel Button */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 font-bold gap-2 transition-all"
                            onClick={(e) => confirmCancel(
                              apt.id, 
                              apt.clinic.name,
                              format(new Date(apt.appointment_date), 'MMM d, yyyy'),
                              apt.start_time ? format(new Date(apt.start_time), 'HH:mm') : 'N/A',
                              e
                            )}
                          >
                            <XCircle className="w-4 h-4" />
                            Cancel
                          </Button>
                        </div>
                      )}
                      
                      {/* Completed appointments - Leave Review button */}
                      {apt.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 text-amber-700 hover:bg-amber-50 font-bold gap-2 w-full"
                          onClick={(e) => handleOpenReviewModal(apt.clinic_id, apt.clinic.name, e)}
                        >
                          <MessageSquare className="w-4 h-4" />
                          Leave Review
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity - Only show when no filter is active */}
        {!activeFilter && (
          <Card className="border-0 shadow-xl">
            <CardHeader className="border-b rounded-t-xl bg-gradient-to-r from-gray-50 to-green-50/50 p-6">
              <CardTitle className="flex items-center gap-2 text-2xl font-bold text-gray-800">
                <Activity className="w-6 h-6 text-green-600" />
                {t('appointments.recentActivity.title', { defaultValue: 'Recent Activity' })} 
              </CardTitle>
              <CardDescription className="text-base mt-1">
                {t('appointments.recentActivity.description', { defaultValue: 'Last 5 completed or cancelled visits.' })} 
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {loadingAppointments ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
                </div>
              ) : recentAppointments.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Activity className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('appointments.recentActivity.none', { defaultValue: 'No recent activity to display.' })} 
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="p-4 border border-gray-100 rounded-lg hover:border-green-300 hover:bg-green-50/50 transition-all cursor-pointer"
                      onClick={() => navigate(`/patient/queue/${apt.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-md text-gray-800">{apt.clinic.name}</p>
                        {getStatusBadge(apt.status)}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span className="font-medium">{format(new Date(apt.appointment_date), t('appointments.recentActivity.dateFormat', { defaultValue: 'MMMM d, yyyy' }))}</span> at <span className="font-bold">{apt.start_time ? format(new Date(apt.start_time), 'HH:mm') : 'N/A'}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <XCircle className="w-6 h-6 text-red-600" />
              Cancel Appointment?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-base space-y-3 pt-2">
                <p>Are you sure you want to cancel this appointment?</p>
                {appointmentToCancel && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2 text-sm">
                    <p className="font-semibold text-red-900">{appointmentToCancel.clinic_name}</p>
                    <p className="text-red-700">
                      <span className="font-medium">{appointmentToCancel.date}</span> at <span className="font-medium">{appointmentToCancel.time}</span>
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">This action cannot be undone. The clinic will be notified.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setCancelDialogOpen(false);
              setAppointmentToCancel(null);
            }}>
              No, Keep It
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelAppointment}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Modal */}
      {selectedClinicForReview && (
        <ReviewModal
          isOpen={reviewModalOpen}
          onClose={handleCloseReviewModal}
          clinicId={selectedClinicForReview.id}
          clinicName={selectedClinicForReview.name}
        />
      )}
    </div>
  );
}
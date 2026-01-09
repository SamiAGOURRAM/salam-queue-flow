import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { queueService } from "@/services/queue";
import { patientService } from "@/services/patient";
import { AppointmentStatus } from "@/services/queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Clock, 
  Activity, 
  Search, 
  MapPin, 
  Building2, 
  ArrowRight, 
  X, 
  MessageSquare,
  XCircle,
  ChevronRight,
  Sparkles,
  Plus
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import ReviewModal from "@/components/ReviewModal";
import { useTranslation } from "react-i18next";
import { logger } from "@/services/shared/logging/Logger";
import { cn } from "@/lib/utils";
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

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string, bg: string, text: string }> = {
      scheduled: { label: "Scheduled", bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
      confirmed: { label: "Confirmed", bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
      waiting: { label: "In Queue", bg: "bg-amber-50 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
      in_progress: { label: "In Progress", bg: "bg-blue-50 dark:bg-primary/15", text: "text-blue-700 dark:text-primary" },
      completed: { label: "Completed", bg: "bg-slate-100 dark:bg-muted", text: "text-slate-600 dark:text-muted-foreground" },
      cancelled: { label: "Cancelled", bg: "bg-slate-100 dark:bg-muted", text: "text-slate-500 dark:text-muted-foreground" },
      no_show: { label: "Missed", bg: "bg-red-50 dark:bg-red-500/15", text: "text-red-600 dark:text-red-400" }
    };
    return configs[status] || { label: status, bg: "bg-slate-100 dark:bg-muted", text: "text-slate-600 dark:text-muted-foreground" };
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
  const firstName = displayName.split(' ')[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p> 
        </div>
      </div>
    );
  }
  
  if (!user && !loadingAppointments) {
    return (
      <div className="text-center py-20">
        <h3 className="text-lg font-semibold mb-2">{t('auth.loginRequired')}</h3> 
        <p className="text-sm text-muted-foreground mb-6">
          {t('auth.pleaseLogin')}
        </p>
        <Button onClick={() => navigate("/auth/login")} className="rounded-full px-6">{t('nav.login')}</Button> 
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          Hey, {firstName} 👋
        </h1>
        <p className="text-muted-foreground">
          {upcomingAppointments.length > 0 
            ? `You have ${upcomingAppointments.length} upcoming appointment${upcomingAppointments.length > 1 ? 's' : ''}`
            : "No upcoming appointments"}
        </p>
      </div>

      {/* Quick Action - Book New */}
      <button
        onClick={() => navigate("/clinics")}
        className="w-full mb-8 p-5 rounded-2xl bg-foreground text-background flex items-center justify-between group hover:opacity-90 transition-all dark:hover:glow-primary"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-background/20 dark:bg-primary/20 flex items-center justify-center">
            <Plus className="w-6 h-6 dark:text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-lg">Book an appointment</p>
            <p className="text-sm opacity-70">Find a clinic near you</p>
          </div>
        </div>
        <ChevronRight className="w-6 h-6 opacity-70 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Filter Pills */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { key: null, label: "Upcoming", count: upcomingAppointments.length },
          { key: 'all' as FilterType, label: "All", count: appointments.length },
          { key: 'completed' as FilterType, label: "Past", count: completedAppointments.length },
        ].map((filter) => (
          <button
            key={filter.key || 'upcoming'}
            onClick={() => setActiveFilter(filter.key)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
              (activeFilter === filter.key || (filter.key === null && activeFilter === null))
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {filter.label} ({filter.count})
          </button>
        ))}
      </div>

      {/* Appointments List */}
      <div className="space-y-4">
        {loadingAppointments ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
          </div>
        ) : displayedAppointments.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No appointments yet</h3>
            <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
              {activeFilter === 'completed' 
                ? "You haven't completed any visits yet"
                : "Book your first appointment to get started"}
            </p>
            <Button 
              onClick={() => navigate("/clinics")}
              className="rounded-full px-6 bg-foreground text-background hover:bg-foreground/90"
            >
              <Search className="w-4 h-4 mr-2" />
              Find Clinics
            </Button>
          </div>
        ) : (
          displayedAppointments.map((apt) => {
            const statusConfig = getStatusConfig(apt.status);
            const isActive = ['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status);
            
            return (
              <div
                key={apt.id}
                className={cn(
                  "rounded-2xl border border-border bg-card overflow-hidden transition-all",
                  isActive && "hover:shadow-lg hover:border-border/80 cursor-pointer dark:interactive-card"
                )}
                onClick={() => {
                  if (isActive) {
                    navigate(`/patient/queue/${apt.id}`);
                  }
                }}
              >
                {/* Main Content */}
                <div className="p-5">
                  {/* Top Row: Clinic & Status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-foreground truncate mb-0.5">
                        {apt.clinic.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{apt.clinic.specialty}</p>
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium",
                      statusConfig.bg,
                      statusConfig.text
                    )}>
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Date & Time - Prominent */}
                  <div className="flex items-center gap-6 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-foreground" />
                      <span className="font-medium">{format(new Date(apt.appointment_date), 'EEE, MMM d')}</span>
                    </div>
                    {apt.start_time && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-foreground" />
                        <span className="font-medium">{format(new Date(apt.start_time), 'h:mm a')}</span>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{apt.clinic.city}</span>
                    <span className="mx-1">•</span>
                    <span className="capitalize">{apt.appointment_type.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Action Footer */}
                {isActive && (
                  <div className="border-t border-border bg-muted/30 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {apt.queue_position && (
                        <span className="text-sm font-medium text-foreground">
                          #{apt.queue_position} in queue
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => confirmCancel(
                          apt.id, 
                          apt.clinic.name,
                          format(new Date(apt.appointment_date), 'MMM d, yyyy'),
                          apt.start_time ? format(new Date(apt.start_time), 'h:mm a') : 'N/A',
                          e
                        )}
                        className="text-sm text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Cancel
                      </button>
                      <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                        View details
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Completed Action */}
                {apt.status === 'completed' && (
                  <div className="border-t border-border bg-muted/30 px-5 py-3">
                    <button
                      onClick={(e) => handleOpenReviewModal(apt.clinic_id, apt.clinic.name, e)}
                      className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Leave a review
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="rounded-2xl max-w-sm dark:glass-card">
          <AlertDialogHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-xl">
              Cancel appointment?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-center space-y-3">
                {appointmentToCancel && (
                  <div className="py-3">
                    <p className="font-semibold text-foreground">{appointmentToCancel.clinic_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {appointmentToCancel.date} at {appointmentToCancel.time}
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. The clinic will be notified.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={handleCancelAppointment}
              className="w-full rounded-full bg-red-500 hover:bg-red-600 text-white"
            >
              Yes, cancel appointment
            </AlertDialogAction>
            <AlertDialogCancel 
              onClick={() => {
                setCancelDialogOpen(false);
                setAppointmentToCancel(null);
              }}
              className="w-full rounded-full border-2"
            >
              Keep appointment
            </AlertDialogCancel>
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

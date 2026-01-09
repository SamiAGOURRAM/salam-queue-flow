import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { queueService } from "@/services/queue";
import { DisruptionDetector } from "@/services/ml/DisruptionDetector";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  MapPin, 
  Users, 
  ArrowLeft, 
  Building2,
  Calendar,
  Bell,
  Navigation,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { logger } from "@/services/shared/logging/Logger";
import { cn } from "@/lib/utils";

interface QueueInfo {
  id: string;
  clinic_name: string;
  queue_position: number;
  predicted_start_time: string | null;
  predicted_wait_time: number | null;
  status: string;
  scheduled_time: string | null;
  appointment_type: string;
  checked_in_at: string | null;
}

type QueueInfoRecord = Omit<QueueInfo, "clinic_name"> & {
  clinics: {
    name: string;
  } | null;
};

export default function MyQueue() {
  const { appointmentId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [timeToLeave, setTimeToLeave] = useState<number | null>(null);
  const [hasDisruption, setHasDisruption] = useState(false);
  const [disruptionDetector] = useState(() => new DisruptionDetector());

  const fetchQueueInfo = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const entry = await queueService.getQueueEntry(appointmentId);

      setQueueInfo({
        id: entry.id,
        clinic_name: entry.clinic?.name || 'Unknown Clinic',
        queue_position: entry.queuePosition || 0,
        predicted_start_time: entry.predictedStartTime?.toISOString() || null,
        predicted_wait_time: entry.estimatedWaitTime || null,
        status: entry.status,
        scheduled_time: entry.startTime ? format(entry.startTime, 'HH:mm') : null,
        appointment_type: entry.appointmentType,
        checked_in_at: entry.checkedInAt?.toISOString() || null
      });
    } catch (error) {
      logger.error("Error fetching queue info", error instanceof Error ? error : new Error(String(error)), { appointmentId });
      toast({
        title: "Error",
        description: "Failed to load queue information",
        variant: "destructive"
      });
    } finally {
      setLoadingQueue(false);
    }
  }, [appointmentId]);

  const checkDisruption = useCallback(async (appointmentId: string) => {
    try {
      const disruptionInfo = await disruptionDetector.checkDisruption(appointmentId);
      setHasDisruption(disruptionInfo.hasDisruption);
    } catch (error) {
      logger.error("Error checking disruption", error instanceof Error ? error : new Error(String(error)), { appointmentId });
      setHasDisruption(false);
    }
  }, [disruptionDetector]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && appointmentId) {
      fetchQueueInfo();
    }
  }, [user, loading, appointmentId, navigate, fetchQueueInfo]);

  useEffect(() => {
    if (queueInfo && appointmentId) {
      checkDisruption(appointmentId);
    }
  }, [queueInfo, appointmentId, checkDisruption]);

  useEffect(() => {
    if (!appointmentId) return;

    const channel = supabase
      .channel('my-queue-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `id=eq.${appointmentId}`
        },
        () => {
          fetchQueueInfo();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointmentId, fetchQueueInfo]);

  useEffect(() => {
    if (!queueInfo?.predicted_start_time) return;

    const interval = setInterval(() => {
      const predictedTime = new Date(queueInfo.predicted_start_time!);
      const travelTimeMinutes = 15;
      const leaveTime = new Date(predictedTime.getTime() - travelTimeMinutes * 60000);
      const now = new Date();
      const minutesUntilLeave = Math.round((leaveTime.getTime() - now.getTime()) / 60000);
      
      setTimeToLeave(minutesUntilLeave);
    }, 1000);

    return () => clearInterval(interval);
  }, [queueInfo?.predicted_start_time]);

  if (loading || loadingQueue) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading queue info...</p>
        </div>
      </div>
    );
  }

  if (!queueInfo) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Appointment not found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This appointment may have been cancelled or doesn't exist.
        </p>
        <Button 
          onClick={() => navigate("/my-appointments")}
          className="rounded-full px-6 bg-foreground text-background"
        >
          Back to Appointments
        </Button>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string, color: string, bg: string }> = {
      scheduled: { label: "Scheduled", color: "text-foreground", bg: "bg-muted" },
      waiting: { label: "In Queue", color: "text-amber-700", bg: "bg-amber-50" },
      in_progress: { label: "Your Turn!", color: "text-emerald-700", bg: "bg-emerald-50" },
      completed: { label: "Completed", color: "text-muted-foreground", bg: "bg-muted" },
      no_show: { label: "Missed", color: "text-red-700", bg: "bg-red-50" }
    };
    return configs[status] || { label: status, color: "text-foreground", bg: "bg-muted" };
  };

  const getEstimatedTimeDisplay = () => {
    if (loadingQueue || !queueInfo) {
      return 'Calculating...';
    }

    if (!hasDisruption && queueInfo.scheduled_time) {
      const [hours, minutes] = queueInfo.scheduled_time.split(':');
      const scheduledDate = new Date();
      scheduledDate.setHours(parseInt(hours || '0'), parseInt(minutes || '0'), 0, 0);
      return scheduledDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
    }

    if (hasDisruption && queueInfo.predicted_start_time) {
      try {
        return new Date(queueInfo.predicted_start_time).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true
        });
      } catch (error) {
        if (queueInfo.scheduled_time) {
          const [hours, minutes] = queueInfo.scheduled_time.split(':');
          const scheduledDate = new Date();
          scheduledDate.setHours(parseInt(hours || '0'), parseInt(minutes || '0'), 0, 0);
          return scheduledDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true
          });
        }
      }
    }

    if (hasDisruption && queueInfo.scheduled_time) {
      const [hours, minutes] = queueInfo.scheduled_time.split(':');
      const scheduledDate = new Date();
      scheduledDate.setHours(parseInt(hours || '0'), parseInt(minutes || '0'), 0, 0);
      return scheduledDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
    }

    return queueInfo.scheduled_time || 'Calculating...';
  };

  const estimatedTime = getEstimatedTimeDisplay();
  const statusConfig = getStatusConfig(queueInfo.status);
  const isActive = ['scheduled', 'waiting', 'in_progress'].includes(queueInfo.status);

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      {/* Back Button */}
      <button 
        onClick={() => navigate("/my-appointments")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm font-medium">Back</span>
      </button>

      {/* Status Hero */}
      {queueInfo.status === 'in_progress' ? (
        <div className="bg-emerald-500 dark:bg-gradient-to-br dark:from-emerald-500 dark:to-teal-600 text-white rounded-3xl p-8 mb-6 text-center dark:glow-success">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-2">It's Your Turn! 🎉</h1>
          <p className="text-emerald-100">Please proceed to the consultation room</p>
        </div>
      ) : (
        <div className="bg-foreground text-background rounded-3xl p-8 mb-6 dark:card-gradient dark:border dark:border-border">
          {/* Queue Position - Hero */}
          <div className="text-center mb-6">
            <p className="text-sm text-background/60 dark:text-foreground/50 uppercase tracking-wider mb-2">Your Position</p>
            <div className="text-7xl font-bold mb-1 dark:gradient-text">#{queueInfo.queue_position}</div>
            <span className={cn(
              "inline-block px-3 py-1 rounded-full text-xs font-medium",
              queueInfo.status === 'waiting' 
                ? "bg-amber-400 text-amber-900 dark:bg-amber-500/20 dark:text-amber-400" 
                : "bg-background/20 dark:bg-primary/15 dark:text-primary"
            )}>
              {statusConfig.label}
            </span>
          </div>

          {/* Estimated Time */}
          <div className="flex items-center justify-center gap-3 pt-6 border-t border-background/20 dark:border-border">
            <Clock className="w-5 h-5 text-background/60 dark:text-primary" />
            <div className="text-center">
              <p className="text-sm text-background/60 dark:text-foreground/50">Estimated time</p>
              <p className="text-xl font-semibold dark:text-primary">{estimatedTime}</p>
            </div>
          </div>
        </div>
      )}

      {/* Clinic Info Card */}
      <div className="rounded-2xl border border-border bg-card p-5 mb-4 dark:interactive-card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-muted dark:bg-primary/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-muted-foreground dark:text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-lg">{queueInfo.clinic_name}</h2>
            <p className="text-sm text-muted-foreground capitalize">
              {queueInfo.appointment_type.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Time to Leave Alert */}
      {timeToLeave !== null && timeToLeave > 0 && timeToLeave <= 30 && queueInfo.status === 'waiting' && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-5 mb-4 dark:animate-border-gradient">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500 dark:bg-amber-500/20 flex items-center justify-center animate-pulse">
              <Navigation className="w-6 h-6 text-white dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-300">
                {timeToLeave <= 5 ? '🚀 Leave now!' : `Leave in ${timeToLeave} min`}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400/70">
                Based on 15 min travel time
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Cards */}
      {isActive && (
        <div className="space-y-3">
          {/* Real-time Updates */}
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4 dark:glass-card">
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
              <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Real-time updates</p>
              <p className="text-xs text-muted-foreground">This page updates automatically</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 dark:animate-pulse-glow animate-pulse" />
          </div>

          {/* How it works */}
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4 dark:glass-card">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-primary/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600 dark:text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">No check-in needed</p>
              <p className="text-xs text-muted-foreground">Staff will call you when ready</p>
            </div>
          </div>
        </div>
      )}

      {/* Completed State */}
      {queueInfo.status === 'completed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">Appointment Complete</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Thank you for your visit
          </p>
          <Button 
            onClick={() => navigate("/my-appointments")}
            className="rounded-full px-6 bg-foreground text-background"
          >
            Back to Appointments
          </Button>
        </div>
      )}
    </div>
  );
}

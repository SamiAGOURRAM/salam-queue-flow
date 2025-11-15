import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, MapPin, Users, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

  const fetchQueueInfo = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          queue_position,
          predicted_start_time,
          predicted_wait_time,
          status,
          scheduled_time,
          appointment_type,
          checked_in_at,
          clinics:clinic_id (name)
        `)
        .eq("id", appointmentId)
        .single();

      if (error) throw error;

      const record = data as QueueInfoRecord;

      setQueueInfo({
        id: record.id,
        clinic_name: record.clinics?.name || 'Unknown Clinic',
        queue_position: record.queue_position,
        predicted_start_time: record.predicted_start_time,
        predicted_wait_time: record.predicted_wait_time,
        status: record.status,
        scheduled_time: record.scheduled_time,
        appointment_type: record.appointment_type,
        checked_in_at: record.checked_in_at
      });
    } catch (error) {
      console.error("Error fetching queue info:", error);
      toast({
        title: "Error",
        description: "Failed to load queue information",
        variant: "destructive"
      });
    } finally {
      setLoadingQueue(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && appointmentId) {
      fetchQueueInfo();
    }
  }, [user, loading, appointmentId, navigate, fetchQueueInfo]);

  useEffect(() => {
    if (!appointmentId) return;

    // Subscribe to real-time updates
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

    // Calculate time to leave (assuming 15 min travel time)
    const interval = setInterval(() => {
      const predictedTime = new Date(queueInfo.predicted_start_time!);
      const travelTimeMinutes = 15; // TODO: Get from user settings
      const leaveTime = new Date(predictedTime.getTime() - travelTimeMinutes * 60000);
      const now = new Date();
      const minutesUntilLeave = Math.round((leaveTime.getTime() - now.getTime()) / 60000);
      
      setTimeToLeave(minutesUntilLeave);
    }, 1000);

    return () => clearInterval(interval);
  }, [queueInfo?.predicted_start_time]);

  

  const handleCheckIn = async () => {
    try {
      const { error } = await supabase
        .from("appointments")
        .update({
          checked_in_at: new Date().toISOString(),
          status: "waiting",
          patient_arrival_time: new Date().toISOString()
        })
        .eq("id", appointmentId);

      if (error) throw error;

      toast({
        title: "Checked in successfully",
        description: "You've been added to the queue",
      });

      fetchQueueInfo();
    } catch (error) {
      console.error("Error checking in:", error);
      toast({
        title: "Error",
        description: "Failed to check in",
        variant: "destructive"
      });
    }
  };

  if (loading || loadingQueue) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!queueInfo) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-0 shadow-lg">
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">Appointment not found</p>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              onClick={() => navigate("/my-appointments")}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-gray-500",
      waiting: "bg-blue-500",
      in_progress: "bg-green-500",
      completed: "bg-gray-400",
      no_show: "bg-red-500"
    };
    return colors[status] || "bg-gray-500";
  };

  const estimatedTime = queueInfo.predicted_start_time
    ? new Date(queueInfo.predicted_start_time).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : queueInfo.scheduled_time || 'Calculating...';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back Button */}
      <Button 
        variant="ghost" 
        onClick={() => navigate("/my-appointments")}
        className="mb-6 gap-2 hover:bg-blue-50"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Appointments
      </Button>

      {/* Clinic Header Card */}
      <Card className="mb-6 border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-blue-50/30 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{queueInfo.clinic_name}</CardTitle>
              <CardDescription className="text-base capitalize">{queueInfo.appointment_type.replace('_', ' ')}</CardDescription>
            </div>
            <Badge className={getStatusColor(queueInfo.status)}>
              {queueInfo.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Queue Stats */}
      <div className="grid gap-4 mb-6">
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <Users className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Your Position in Queue</p>
                <p className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  #{queueInfo.queue_position}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                <Clock className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Estimated Time</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  {estimatedTime}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {timeToLeave !== null && timeToLeave > 0 && queueInfo.status === 'waiting' && (
          <Card className="border-2 border-blue-300 bg-blue-50/50 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-lg animate-pulse">
                  <MapPin className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-sm text-blue-700 mb-1 font-medium">Time to Leave</p>
                  <p className="text-3xl font-bold text-blue-900">
                    {timeToLeave <= 0 ? '🚀 Leave Now!' : `${timeToLeave} min`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Check-In Card */}
      {(queueInfo.status === 'scheduled' || queueInfo.status === 'confirmed') && !queueInfo.checked_in_at && (
        <Card className="border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Ready to Join the Queue?</h3>
              <p className="text-muted-foreground mb-6 text-base">
                Check in when you arrive at the clinic to join the virtual queue
              </p>
              <Button 
                onClick={handleCheckIn} 
                size="lg" 
                className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
              >
                <Activity className="w-5 h-5 mr-2" />
                I've Arrived - Check In Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* In Progress Card */}
      {queueInfo.status === 'in_progress' && (
        <Card className="border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Activity className="w-8 h-8 text-white animate-pulse" />
              </div>
              <h3 className="text-2xl font-bold mb-2 text-green-900">It's Your Turn! 🎉</h3>
              <p className="text-green-700 text-base font-medium">
                Please proceed to the consultation room
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
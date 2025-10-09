import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, MapPin, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";

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

export default function MyQueue() {
  const { appointmentId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [timeToLeave, setTimeToLeave] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && appointmentId) {
      fetchQueueInfo();
    }
  }, [user, loading, appointmentId, navigate]);

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
  }, [appointmentId]);

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

  const fetchQueueInfo = async () => {
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

      setQueueInfo({
        id: data.id,
        clinic_name: (data as any).clinics?.name || 'Unknown Clinic',
        queue_position: data.queue_position,
        predicted_start_time: data.predicted_start_time,
        predicted_wait_time: data.predicted_wait_time,
        status: data.status,
        scheduled_time: data.scheduled_time,
        appointment_type: data.appointment_type,
        checked_in_at: data.checked_in_at
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
  };

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!queueInfo) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="pt-16 container mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Appointment not found</p>
              <Button className="mt-4" onClick={() => navigate("/patient/dashboard")}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
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
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{queueInfo.clinic_name}</CardTitle>
                  <CardDescription>{queueInfo.appointment_type}</CardDescription>
                </div>
                <Badge className={getStatusColor(queueInfo.status)}>
                  {queueInfo.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Your Position</p>
                      <p className="text-3xl font-bold">#{queueInfo.queue_position}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Estimated Time</p>
                      <p className="text-2xl font-bold">{estimatedTime}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {timeToLeave !== null && timeToLeave > 0 && queueInfo.status === 'waiting' && (
              <Card className="border-primary">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-8 h-8 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Time to Leave</p>
                        <p className="text-2xl font-bold">
                          {timeToLeave <= 0 ? 'Leave Now!' : `${timeToLeave} min`}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {(queueInfo.status === 'scheduled' || queueInfo.status === 'waiting') && !queueInfo.checked_in_at && (
            <Card className="border-primary">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Activity className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">Ready to Join the Queue?</h3>
                  <p className="text-muted-foreground mb-4">
                    Check in when you're ready to join the virtual queue
                  </p>
                  <Button onClick={handleCheckIn} size="lg" className="w-full">
                    I've Arrived - Check In
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {queueInfo.status === 'in_progress' && (
            <Card className="border-green-500">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Activity className="w-12 h-12 text-green-500 mx-auto mb-4 animate-pulse" />
                  <h3 className="text-xl font-bold mb-2">Your Turn!</h3>
                  <p className="text-muted-foreground">
                    Please proceed to the consultation room
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 text-center">
            <Button variant="outline" onClick={() => navigate("/patient/dashboard")}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

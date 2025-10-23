import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Users, Clock, TrendingUp, Calendar, UserPlus, ArrowRight, Sparkles } from "lucide-react";
import { AppointmentStatus, SkipReason } from "@/services/queue";

export default function ClinicDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<any>(null);
  const [today] = useState(() => new Date());

  // Fetch real queue data
  const {
    queue,
    summary,
    isLoading: queueLoading,
  } = useQueueService({
    clinicId: clinic?.id || '',
    date: today,
    autoRefresh: true,
  });

  // Filter out absent patients for display
  const activeQueue = queue.filter(p => 
    (p.status === AppointmentStatus.WAITING || 
     p.status === AppointmentStatus.SCHEDULED || 
     p.status === AppointmentStatus.IN_PROGRESS) &&
    p.skipReason !== SkipReason.PATIENT_ABSENT
  );

  useEffect(() => {
    if (user) {
      fetchClinic();
    }
  }, [user]);

  const fetchClinic = async () => {
    const { data } = await supabase
      .from("clinics")
      .select("*")
      .eq("owner_id", user?.id)
      .single();

    setClinic(data);
  };

  // Format wait time
  const formatWaitTime = (minutes: number) => {
    if (minutes === 0) return "-";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 p-8 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400/10 rounded-full -ml-48 -mb-48 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5" />
                <span className="text-sm font-medium text-blue-100">Welcome back!</span>
              </div>
              <h1 className="text-4xl font-bold mb-2">{clinic?.name || "Your Clinic"}</h1>
              <p className="text-xl text-blue-100">
                {clinic?.practice_type === "solo_practice" ? "Solo Practice" : "Group Clinic"} • {clinic?.specialty}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <Button
              onClick={() => navigate("/clinic/queue")}
              size="lg"
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 border-2 border-white/30 text-white h-auto py-4 justify-start"
            >
              <Activity className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Manage Queue</div>
                <div className="text-xs text-blue-100">View live patient queue</div>
              </div>
            </Button>
            
            <Button
              onClick={() => navigate("/clinic/calendar")}
              size="lg"
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 border-2 border-white/30 text-white h-auto py-4 justify-start"
            >
              <Calendar className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">View Calendar</div>
                <div className="text-xs text-blue-100">Schedule appointments</div>
              </div>
            </Button>
            
            <Button
              onClick={() => navigate("/clinic/team")}
              size="lg"
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 border-2 border-white/30 text-white h-auto py-4 justify-start"
            >
              <UserPlus className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Manage Team</div>
                <div className="text-xs text-blue-100">Invite staff members</div>
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid - NOW WITH REAL DATA */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Queue</CardTitle>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {queueLoading ? '...' : summary?.waiting || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              patients waiting
              <ArrowRight className="w-3 h-3" />
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Wait Time</CardTitle>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              {queueLoading ? '...' : formatWaitTime(summary?.averageWaitTime || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.averageWaitTime ? 'average wait' : 'No data yet'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Today</CardTitle>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {queueLoading ? '...' : summary?.completed || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">appointments</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {queueLoading ? '...' : summary?.inProgress || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">being served</p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Live Queue Status - NOW WITH REAL DATA */}
        <Card className="lg:col-span-2 border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  Live Queue Status
                </CardTitle>
                <CardDescription className="text-base mt-1">Real-time patient flow</CardDescription>
              </div>
              <Button 
                onClick={() => navigate("/clinic/queue")}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                View Full Queue
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {queueLoading ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-10 h-10 text-blue-600 animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Loading queue...</h3>
              </div>
            ) : activeQueue.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No patients in queue</h3>
                <p className="text-muted-foreground mb-4">Your queue is currently empty</p>
                <Button 
                  onClick={() => navigate("/clinic/queue")}
                  variant="outline"
                  className="border-2"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Walk-in Patient
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">
                    Showing first {Math.min(activeQueue.length, 5)} of {activeQueue.length} patients
                  </div>
                </div>
                {activeQueue.slice(0, 5).map((patient, index) => (
                  <div
                    key={patient.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:border-blue-300 transition-all"
                  >
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {patient.queuePosition}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{patient.patient?.fullName || 'Patient'}</p>
                      <p className="text-xs text-muted-foreground">{patient.appointmentType}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        patient.status === AppointmentStatus.IN_PROGRESS
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {patient.status === AppointmentStatus.IN_PROGRESS ? 'In Progress' : 'Waiting'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
            <CardTitle className="text-xl">Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            <Button
              onClick={() => navigate("/clinic/settings")}
              variant="outline"
              className="w-full justify-start h-auto py-3 border-2 hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-sm">Clinic Settings</div>
                  <div className="text-xs text-muted-foreground">Configure hours & types</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={() => navigate("/clinic/team")}
              variant="outline"
              className="w-full justify-start h-auto py-3 border-2 hover:border-green-300 hover:bg-green-50"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-sm">Invite Staff</div>
                  <div className="text-xs text-muted-foreground">Add team members</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={() => navigate("/clinic/calendar")}
              variant="outline"
              className="w-full justify-start h-auto py-3 border-2 hover:border-purple-300 hover:bg-purple-50"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-sm">Book Appointment</div>
                  <div className="text-xs text-muted-foreground">Schedule a patient</div>
                </div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Clinic Info Card */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
          <CardTitle className="text-xl">Clinic Information</CardTitle>
          <CardDescription>Your practice details</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Practice Type</p>
              <p className="text-lg font-semibold">
                {clinic?.practice_type === "solo_practice" ? "Solo Practice" : "Group Clinic"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Specialty</p>
              <p className="text-lg font-semibold">{clinic?.specialty || "Not set"}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="text-lg font-semibold">{clinic?.city || "Not set"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
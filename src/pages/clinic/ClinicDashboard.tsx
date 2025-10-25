import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Users, Clock, TrendingUp, Calendar, UserPlus, ArrowRight, Sparkles } from "lucide-react";
import { AppointmentStatus, SkipReason } from "@/services/queue";
import { Badge } from "@/components/ui/badge";


interface Clinic {
  id: string;
  name: string;
  practice_type: string;
  specialty: string;
  city: string;
}
interface StaffProfile {
  id: string; // This is the staff_id
  user_id: string;
}


export default function ClinicDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);

  // --- STEP 1: Fetch Clinic and Staff Profile ---
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;

      // Fetch the clinic owned by the current user
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("id, name, practice_type, specialty, city")
        .eq("owner_id", user.id)
        .single();
      
      if (clinicData) {
        setClinic(clinicData);

        // Once we have the clinic, find the staff entry for the current user in that clinic
        const { data: staffData } = await supabase
          .from("clinic_staff")
          .select("id, user_id") // 'id' here is the staff_id we need
          .eq("clinic_id", clinicData.id)
          .eq("user_id", user.id)
          .single();
        
        setStaffProfile(staffData);
      }
    };

    fetchInitialData();
  }, [user]);

  // --- STEP 2: Use the new hook with the fetched staffId ---
  const {
    schedule,
    isLoading: queueLoading,
    error,
  } = useQueueService({
    // The hook is now driven by staffId. It will be disabled until staffProfile.id is available.
    staffId: staffProfile?.id,
    autoRefresh: true,
  });

  // --- STEP 3: Calculate summaries locally using useMemo for efficiency ---
  const summary = useMemo(() => {
    if (!schedule) return { waiting: 0, inProgress: 0, completed: 0, averageWaitTime: 0 };

    const waiting = schedule.filter(p => (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) && p.skipReason !== SkipReason.PATIENT_ABSENT).length;
    const inProgress = schedule.filter(p => p.status === AppointmentStatus.IN_PROGRESS).length;
    const completed = schedule.filter(p => p.status === AppointmentStatus.COMPLETED).length;

    const completedWithTimes = schedule.filter(e => e.status === AppointmentStatus.COMPLETED && e.checkedInAt && e.actualStartTime);
    const totalWaitMinutes = completedWithTimes.reduce((sum, entry) => {
      const waitTime = (new Date(entry.actualStartTime!).getTime() - new Date(entry.checkedInAt!).getTime()) / (1000 * 60);
      return sum + waitTime;
    }, 0);
    const averageWaitTime = completedWithTimes.length > 0 ? Math.round(totalWaitMinutes / completedWithTimes.length) : 0;

    return { waiting, inProgress, completed, averageWaitTime };
  }, [schedule]);

  const activeQueue = useMemo(() => 
    schedule.filter(p => 
      (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED || p.status === AppointmentStatus.IN_PROGRESS) &&
      p.skipReason !== SkipReason.PATIENT_ABSENT
    ), [schedule]);

  // --- UTILITY FUNCTIONS ---
  const formatWaitTime = (minutes: number) => {
    if (!minutes || minutes === 0) return "-";
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

       {/* Stats Grid - Now using the locally calculated 'summary' */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Queue</CardTitle>
            <Users className="w-5 h-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{queueLoading ? '...' : summary.waiting}</div>
            <p className="text-xs text-muted-foreground">patients waiting</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Wait Time</CardTitle>
            <Clock className="w-5 h-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{queueLoading ? '...' : formatWaitTime(summary.averageWaitTime)}</div>
            <p className="text-xs text-muted-foreground">{summary.averageWaitTime ? 'average wait' : 'No data yet'}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Today</CardTitle>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{queueLoading ? '...' : summary.completed}</div>
            <p className="text-xs text-muted-foreground">appointments</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Activity className="w-5 h-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{queueLoading ? '...' : summary.inProgress}</div>
            <p className="text-xs text-muted-foreground">being served</p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
                {/* Live Queue Status - NOW WITH REAL DATA & ORIGINAL STYLING */}
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
                      {/* LOGIC CHANGE: Use position if available, otherwise show time-based info */}
                      {patient.queuePosition || (patient.startTime && new Date(patient.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) || 'N/A'}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{patient.patient?.fullName || 'Patient'}</p>
                      <p className="text-xs text-muted-foreground">{patient.appointmentType}</p>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant={patient.status === AppointmentStatus.IN_PROGRESS ? 'default' : 'outline'}
                        className={
                          patient.status === AppointmentStatus.IN_PROGRESS
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-orange-100 text-orange-700 border-orange-200'
                        }
                      >
                        {patient.status === AppointmentStatus.IN_PROGRESS ? 'In Progress' : 'Waiting'}
                      </Badge>
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
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQueueService } from "@/hooks/useQueueService";
import { supabase } from "@/integrations/supabase/client";
import { clinicService } from "@/services/clinic";
import { staffService } from "@/services/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Users, Clock, TrendingUp, Calendar, UserPlus, ArrowRight, Sparkles, Settings, CheckCircle2, Timer } from "lucide-react";
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
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Mouse tracking for parallax effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // --- STEP 1: Fetch Clinic and Staff Profile ---
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;

      // Fetch the clinic owned by the current user using ClinicService
      const clinicData = await clinicService.getClinicByOwner(user.id);
      
      if (clinicData) {
        setClinic({
          id: clinicData.id,
          name: clinicData.name,
          practice_type: clinicData.practiceType,
          specialty: clinicData.specialty,
          city: clinicData.city,
        });

        // Find the staff entry for the current user in that clinic using StaffService
        const staffData = await staffService.getStaffByClinicAndUser(clinicData.id, user.id);
        
        if (staffData) {
          setStaffProfile({
            id: staffData.id,
            user_id: staffData.userId,
          });
        }
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

    // Wait time = time from scheduled start (startTime) to check-in (entry)
    const completedWithTimes = schedule.filter(e => e.status === AppointmentStatus.COMPLETED && e.checkedInAt && e.startTime);
    const totalWaitMinutes = completedWithTimes.reduce((sum, entry) => {
      const waitTime = (new Date(entry.checkedInAt!).getTime() - new Date(entry.startTime!).getTime()) / (1000 * 60);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <div className="space-y-8 pb-12">
        {/* Enhanced Hero Section with Parallax */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-500 shadow-2xl">
          {/* Animated background elements */}
          <div 
            className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-float"
            style={{
              transform: `translate(${mousePosition.x * 0.02}px, ${mousePosition.y * 0.02}px)`
            }}
          ></div>
          <div 
            className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-300/20 rounded-full blur-3xl"
            style={{
              transform: `translate(${mousePosition.x * -0.015}px, ${mousePosition.y * -0.015}px)`
            }}
          ></div>
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-400/10 rounded-full blur-2xl"></div>
          
          <div className="relative z-10 p-8 lg:p-12">
            <div className="flex items-start justify-between mb-8">
              <div className="space-y-3">
                <div className="flex items-center gap-3 mb-3 group">
                  <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white/90 tracking-wide uppercase">Welcome back!</span>
                </div>
                <h1 className="text-5xl lg:text-6xl font-bold text-white mb-3 tracking-tight">
                  {clinic?.name || "Your Clinic"}
                </h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className="bg-white/20 backdrop-blur-sm border-white/30 text-white text-sm px-4 py-1.5 hover:bg-white/30 transition-colors">
                    {clinic?.practice_type === "solo_practice" ? "Solo Practice" : "Group Clinic"}
                  </Badge>
                  <Badge className="bg-white/20 backdrop-blur-sm border-white/30 text-white text-sm px-4 py-1.5 hover:bg-white/30 transition-colors">
                    {clinic?.specialty}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
              <Button
                onClick={() => navigate("/clinic/queue")}
                size="lg"
                className="group bg-white/15 backdrop-blur-md hover:bg-white/25 border-2 border-white/30 text-white h-auto py-5 px-6 justify-start rounded-2xl transition-all hover:scale-105 hover:shadow-xl"
              >
                <div className="p-2.5 rounded-xl bg-white/20 mr-4 group-hover:rotate-12 transition-transform">
                  <Activity className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base">Manage Queue</div>
                  <div className="text-xs text-white/80 mt-0.5">View live patient queue</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
              
              <Button
                onClick={() => navigate("/clinic/calendar")}
                size="lg"
                className="group bg-white/15 backdrop-blur-md hover:bg-white/25 border-2 border-white/30 text-white h-auto py-5 px-6 justify-start rounded-2xl transition-all hover:scale-105 hover:shadow-xl"
              >
                <div className="p-2.5 rounded-xl bg-white/20 mr-4 group-hover:rotate-12 transition-transform">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base">View Calendar</div>
                  <div className="text-xs text-white/80 mt-0.5">Schedule appointments</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
              
              <Button
                onClick={() => navigate("/clinic/team")}
                size="lg"
                className="group bg-white/15 backdrop-blur-md hover:bg-white/25 border-2 border-white/30 text-white h-auto py-5 px-6 justify-start rounded-2xl transition-all hover:scale-105 hover:shadow-xl"
              >
                <div className="p-2.5 rounded-xl bg-white/20 mr-4 group-hover:rotate-12 transition-transform">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base">Manage Team</div>
                  <div className="text-xs text-white/80 mt-0.5">Invite staff members</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </div>
          </div>
        </div>

        {/* Enhanced Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Today's Queue Card */}
          <Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-blue-50/50">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-2xl"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-gray-600">Today's Queue</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                {summary.waiting}
              </div>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Patients waiting
              </p>
            </CardContent>
          </Card>

          {/* In Progress Card */}
          <Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-green-50/50">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/10 to-transparent rounded-full blur-2xl"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-gray-600">In Progress</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-100 to-emerald-200 group-hover:scale-110 transition-transform">
                <Activity className="w-5 h-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {summary.inProgress}
              </div>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <Activity className="w-3 h-3 animate-pulse" />
                Active consultations
              </p>
            </CardContent>
          </Card>

          {/* Completed Card */}
          <Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-purple-50/50">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-gray-600">Completed Today</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-100 to-purple-200 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-5 h-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {summary.completed}
              </div>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Appointments done
              </p>
            </CardContent>
          </Card>

          {/* Average Wait Time Card */}
          <Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-white to-orange-50/50">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full blur-2xl"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-gray-600">Avg Wait Time</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-100 to-amber-200 group-hover:scale-110 transition-transform">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                {formatWaitTime(summary.averageWaitTime)}
              </div>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Average duration
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Enhanced Live Queue Status */}
          <Card className="lg:col-span-2 group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all bg-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-transparent rounded-full blur-3xl"></div>
            <CardHeader className="border-b bg-gradient-to-r from-blue-50/50 via-sky-50/30 to-cyan-50/50 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-3 font-bold">
                    <div className="relative">
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                      <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500/50 animate-ping"></div>
                    </div>
                    Live Queue Status
                  </CardTitle>
                  <CardDescription className="text-base mt-2 text-gray-600">Real-time patient flow</CardDescription>
                </div>
                <Button 
                  onClick={() => navigate("/clinic/queue")}
                  className="group bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all hover:scale-105 rounded-xl"
                >
                  View Full Queue
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 relative z-10">
              {queueLoading ? (
                <div className="text-center py-20">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <Users className="w-12 h-12 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900">Loading queue...</h3>
                  <p className="text-gray-500">Please wait while we fetch the data</p>
                </div>
              ) : activeQueue.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
                    <Users className="w-12 h-12 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-gray-900">No patients in queue</h3>
                  <p className="text-gray-500 mb-6">Your queue is currently empty</p>
                  <Button 
                    onClick={() => navigate("/clinic/queue")}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all hover:scale-105 rounded-xl"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Walk-in Patient
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-6 pb-3 border-b">
                    <div className="text-sm font-semibold text-gray-600">
                      Showing first {Math.min(activeQueue.length, 5)} of {activeQueue.length} patients
                    </div>
                  </div>
                  {activeQueue.slice(0, 5).map((patient, index) => (
                    <div
                      key={patient.id}
                      className="group flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 transition-all hover:shadow-md"
                    >
                      <div className={`relative h-14 w-14 rounded-2xl flex items-center justify-center font-bold text-lg transition-all group-hover:scale-110 ${
                        index === 0 
                          ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg' 
                          : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700'
                      }`}>
                        {patient.queuePosition || (patient.startTime && new Date(patient.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) || 'N/A'}
                        {index === 0 && (
                          <div className="absolute -top-1 -right-1">
                            <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base text-gray-900 truncate">{patient.patient?.fullName || 'Patient'}</p>
                        <p className="text-sm text-gray-500 truncate">{patient.appointmentType}</p>
                      </div>
                      <div className="text-right">
                        <Badge 
                          className={`px-4 py-1.5 text-sm font-semibold ${
                            patient.status === AppointmentStatus.IN_PROGRESS
                              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-md'
                              : 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 border-orange-200'
                          }`}
                        >
                          {patient.status === AppointmentStatus.IN_PROGRESS ? (
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3 animate-pulse" />
                              In Progress
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Waiting
                            </span>
                          )}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enhanced Quick Actions */}
          <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all bg-white">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-500/5 to-transparent rounded-full blur-3xl"></div>
            <CardHeader className="border-b bg-gradient-to-r from-blue-50/50 via-sky-50/30 to-cyan-50/50 relative z-10">
              <CardTitle className="text-2xl font-bold">Quick Actions</CardTitle>
              <CardDescription className="text-base text-gray-600">Common tasks</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 relative z-10">
              <Button
                onClick={() => navigate("/clinic/settings")}
                variant="outline"
                className="w-full justify-start h-auto py-4 px-4 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group rounded-2xl hover:shadow-md"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Settings className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-base text-gray-900">Clinic Settings</div>
                    <div className="text-sm text-gray-500">Configure hours & types</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
              </Button>

              <Button
                onClick={() => navigate("/clinic/team")}
                variant="outline"
                className="w-full justify-start h-auto py-4 px-4 border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all group rounded-2xl hover:shadow-md"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <UserPlus className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-base text-gray-900">Invite Staff</div>
                    <div className="text-sm text-gray-500">Add team members</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all" />
                </div>
              </Button>

              <Button
                onClick={() => navigate("/clinic/calendar")}
                variant="outline"
                className="w-full justify-start h-auto py-4 px-4 border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all group rounded-2xl hover:shadow-md"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Calendar className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-base text-gray-900">Book Appointment</div>
                    <div className="text-sm text-gray-500">Schedule a patient</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
                </div>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Clinic Info Card */}
        <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all bg-white">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-full blur-3xl"></div>
          <CardHeader className="border-b bg-gradient-to-r from-blue-50/50 via-sky-50/30 to-cyan-50/50 relative z-10">
            <CardTitle className="text-2xl font-bold">Clinic Information</CardTitle>
            <CardDescription className="text-base text-gray-600">Your practice details</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 relative z-10">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="space-y-3 group">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Practice Type</p>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 group-hover:scale-110 transition-transform">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {clinic?.practice_type === "solo_practice" ? "Solo Practice" : "Group Clinic"}
                  </p>
                </div>
              </div>
              <div className="space-y-3 group">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Specialty</p>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{clinic?.specialty || "Not set"}</p>
                </div>
              </div>
              <div className="space-y-3 group">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Location</p>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{clinic?.city || "Not set"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Styles for animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
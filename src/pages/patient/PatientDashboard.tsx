import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Activity, Search, MapPin, Building2, Sparkles, ArrowRight, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Appointment {
  id: string;
  clinic_id: string;
  appointment_date: string;
  scheduled_time: string;
  appointment_type: string;
  status: string;
  queue_position: number | null;
  clinic: {
    name: string;
    specialty: string;
    city: string;
  };
}

type FilterType = 'all' | 'upcoming' | 'completed' | null;

export default function PatientDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  // --- ENHANCEMENT: State to hold the user's name from the profiles table ---
  const [patientFullName, setPatientFullName] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      // Handle navigation if necessary
    } else if (user) {
      // Call both fetch functions
      fetchPatientProfile();
      fetchAppointments();
    }
  }, [user, loading, navigate]);
  
  // --- ENHANCEMENT: New function to fetch the name from the profiles table ---
  const fetchPatientProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user?.id)
        .single();
        
      if (error && error.code !== 'PGRST116') throw error; // Ignore "No rows found" error
      
      if (data?.full_name) {
        setPatientFullName(data.full_name);
      }
    } catch (error) {
      console.error("Error fetching patient name:", error);
    }
  };
  // --------------------------------------------------------------------------

  const fetchAppointments = async () => {
    try {
      setLoadingAppointments(true);
      
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          clinic_id,
          appointment_date,
          scheduled_time,
          appointment_type,
          status,
          queue_position,
          clinic:clinics(name, specialty, city)
        `)
        .eq("patient_id", user?.id)
        .order("appointment_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (error) throw error;

      setAppointments(data || []);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      toast({
        title: "Error",
        description: "Failed to load appointments",
        variant: "destructive",
      });
    } finally {
      setLoadingAppointments(false);
    }
  };

  const getUpcomingAppointments = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return appointments.filter(apt => {
      const aptDate = new Date(apt.appointment_date);
      // Check date is today or later, and status is active
      const isFutureOrToday = aptDate >= today;
      const isActiveStatus = ['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status);
      return isFutureOrToday && isActiveStatus;
    });
  };

  const getCompletedAppointments = () => {
    return appointments.filter(apt => apt.status === 'completed');
  };

  const getRecentAppointments = () => {
    return appointments
      .filter(apt => ['completed', 'cancelled', 'no_show'].includes(apt.status))
      .sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()) // Sort by most recent first
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
      default:
        return getUpcomingAppointments();
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string, className: string }> = {
      scheduled: { label: "Scheduled", className: "bg-blue-500 text-white" },
      confirmed: { label: "Confirmed", className: "bg-indigo-500 text-white" },
      waiting: { label: "Waiting", className: "bg-amber-500 text-white" },
      in_progress: { label: "In Progress", className: "bg-cyan-500 text-white" },
      completed: { label: "Completed", className: "bg-green-600 text-white" },
      cancelled: { label: "Cancelled", className: "bg-gray-400 text-white" },
      no_show: { label: "No Show", className: "bg-red-500 text-white" }
    };
    
    const config = variants[status] || { label: status, className: "bg-gray-300 text-gray-800" };
    return <Badge className={`text-xs font-semibold rounded-full px-3 py-1 ${config.className}`}>{config.label}</Badge>;
  };

  const upcomingAppointments = getUpcomingAppointments();
  const completedAppointments = getCompletedAppointments();
  const recentAppointments = getRecentAppointments();
  const displayedAppointments = getFilteredAppointments();

  const getFilterTitle = () => {
    switch (activeFilter) {
      case 'all':
        return 'All Appointments';
      case 'upcoming':
        return 'Upcoming Appointments';
      case 'completed':
        return 'Completed Appointments';
      default:
        return 'Upcoming Appointments';
    }
  };

  // Determine the display name (Use patientFullName, fallback to auth metadata first name, then 'friend')
  const displayName = patientFullName || user?.user_metadata?.first_name || 'friend';


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }
  
  // Render nothing if user is logged out and still loading data (should be rare due to App.tsx guard)
  if (!user && !loadingAppointments) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold">Please log in</h3>
        <p className="text-muted-foreground mb-6">
          You need to be signed in to view your dashboard.
        </p>
        <Button onClick={() => navigate("/auth/login")}>Go to Login</Button>
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
            <span className="text-sm font-medium text-blue-100 uppercase tracking-widest">Your Health Journey</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-3 leading-tight">
            {/* --- ENHANCEMENT: Use displayName variable --- */}
            Welcome back, <span className="text-amber-200">{displayName}!</span> 👋
          </h1>
          <p className="text-xl text-blue-100 mb-10 max-w-3xl">
            Quickly manage your upcoming visits and find new healthcare providers.
          </p>

          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => navigate("/")}
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 shadow-xl shadow-blue-900/20 h-14 px-8 gap-2 font-bold text-base transition-transform transform hover:scale-[1.03]"
            >
              <Search className="w-5 h-5" />
              Find a Clinic
            </Button>
            
            {upcomingAppointments.length > 0 && (
              <Button
                onClick={() => document.getElementById('upcoming-list')?.scrollIntoView({ behavior: 'smooth' })}
                size="lg"
                variant="outline"
                className="bg-white/20 backdrop-blur-md border-2 border-white/50 text-white hover:bg-white/30 h-14 px-8 font-semibold transition-transform transform hover:scale-[1.03]"
              >
                <Calendar className="w-5 h-5 mr-2" />
                {upcomingAppointments.length} Upcoming Appointments
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards - Now Clickable */}
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
            <p className="text-md text-muted-foreground mb-1">Total Appointments</p>
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
            <p className="text-md text-muted-foreground mb-1">Upcoming</p>
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
            <p className="text-md text-muted-foreground mb-1">Completed</p>
            <p className="text-4xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {completedAppointments.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Appointments List (takes more space when filtered) */}
        <Card id="upcoming-list" className={`border-0 shadow-xl ${activeFilter ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
          <CardHeader className="border-b rounded-t-xl bg-gradient-to-r from-gray-50 to-blue-50/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold text-gray-800">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                  {getFilterTitle()}
                </CardTitle>
                <CardDescription className="text-base mt-1">
                  {loadingAppointments ? "Loading appointments data..." : `${displayedAppointments.length} appointment${displayedAppointments.length !== 1 ? 's' : ''} found.`}
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
                  Clear Filter
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
                <h3 className="text-xl font-semibold mb-2">No appointments found</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  {activeFilter === 'completed' ? 
                    "It looks like you haven't completed any visits yet." : 
                    "Ready to schedule your next visit? Start by finding a clinic."
                  }
                </p>
                <Button 
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-md transition-all h-10"
                  onClick={() => navigate("/")}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Browse Clinics
                </Button>
              </div>
            ) : (
              <div className={`grid gap-5 ${activeFilter ? 'md:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-1'}`}>
                {displayedAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="group p-5 border border-gray-100 rounded-xl hover:border-blue-400 hover:shadow-2xl transition-all cursor-pointer bg-white"
                    onClick={() => navigate(`/patient/queue/${apt.id}`)}
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
                        <span>{format(new Date(apt.appointment_date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">
                        <Clock className="w-4 h-4" />
                        <span>{apt.scheduled_time}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-600 text-sm mb-4 border-t pt-3">
                      <MapPin className="w-4 h-4 text-green-600" />
                      <span className="font-medium">{apt.clinic.city}</span>
                      <Badge variant="outline" className="ml-auto text-xs border-blue-200 text-blue-600 font-medium">
                        {apt.appointment_type.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between">
                        {apt.queue_position && ['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status) ? (
                          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 font-bold">
                            Position #{apt.queue_position}
                          </Badge>
                        ) : (
                          <div className="h-6"></div> // Spacer for alignment
                        )}
                        
                        {['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status) && (
                          <div className="flex items-center gap-1 text-blue-600 group-hover:gap-2 transition-all">
                            <p className="text-sm font-bold">
                              Go to Queue
                            </p>
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        )}
                      </div>
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
                Recent Activity
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Last 5 completed or cancelled visits.
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
                    No recent activity to display.
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
                        <span className="font-medium">{format(new Date(apt.appointment_date), 'MMMM d, yyyy')}</span> at <span className="font-bold">{apt.scheduled_time}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

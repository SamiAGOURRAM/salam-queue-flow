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

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user) {
      fetchAppointments();
    }
  }, [user, loading, navigate]);

  const fetchAppointments = async () => {
    try {
      setLoadingAppointments(true);
      console.log("Current user ID:", user?.id);
      
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
      console.log("Fetched appointments:", data);
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
      return aptDate >= today && ['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status);
    });
  };

  const getCompletedAppointments = () => {
    return appointments.filter(apt => apt.status === 'completed');
  };

  const getRecentAppointments = () => {
    return appointments
      .filter(apt => ['completed', 'cancelled', 'no_show'].includes(apt.status))
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
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string, className: string }> = {
      scheduled: { variant: "outline", label: "Scheduled", className: "border-blue-300 text-blue-700 bg-blue-50" },
      confirmed: { variant: "default", label: "Confirmed", className: "bg-green-500" },
      waiting: { variant: "secondary", label: "Waiting", className: "bg-amber-500" },
      in_progress: { variant: "default", label: "In Progress", className: "bg-cyan-500" },
      completed: { variant: "default", label: "Completed", className: "bg-green-600" },
      cancelled: { variant: "destructive", label: "Cancelled", className: "" },
      no_show: { variant: "destructive", label: "No Show", className: "" }
    };
    
    const config = variants[status] || { variant: "outline", label: status, className: "" };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 p-8 md:p-12 text-white shadow-2xl mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400/10 rounded-full -ml-48 -mb-48 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium text-blue-100">Your Health Journey</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">Welcome back! 👋</h1>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl">
            Manage your appointments and track your healthcare journey
          </p>

          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => navigate("/")}
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 shadow-lg h-14 px-8 gap-2 font-semibold"
            >
              <Search className="w-5 h-5" />
              Find a Clinic
            </Button>
            
            {upcomingAppointments.length > 0 && (
              <Button
                onClick={() => document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth' })}
                size="lg"
                variant="outline"
                className="bg-white/20 backdrop-blur-sm border-2 border-white/30 text-white hover:bg-white/30 h-14 px-8"
              >
                <Calendar className="w-5 h-5 mr-2" />
                View My Appointments
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards - Now Clickable */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card 
          className={`border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden group cursor-pointer ${
            activeFilter === 'all' ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => setActiveFilter('all')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Total Appointments</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {appointments.length}
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden group cursor-pointer ${
            activeFilter === 'upcoming' ? 'ring-2 ring-amber-500' : ''
          }`}
          onClick={() => setActiveFilter('upcoming')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Upcoming</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              {upcomingAppointments.length}
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden group cursor-pointer ${
            activeFilter === 'completed' ? 'ring-2 ring-green-500' : ''
          }`}
          onClick={() => setActiveFilter('completed')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Completed</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {completedAppointments.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Appointments List (takes more space when filtered) */}
        <Card id="upcoming" className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${activeFilter ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
          <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  {getFilterTitle()}
                </CardTitle>
                <CardDescription className="text-base">
                  {loadingAppointments ? "Loading..." : `${displayedAppointments.length} appointment${displayedAppointments.length !== 1 ? 's' : ''}`}
                </CardDescription>
              </div>
              {activeFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFilter(null)}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear Filter
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {loadingAppointments ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              </div>
            ) : displayedAppointments.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No appointments found</h3>
                <p className="text-muted-foreground mb-6">
                  {activeFilter === 'completed' ? 
                    "You haven't completed any appointments yet." : 
                    "Ready to book your next visit?"
                  }
                </p>
                <Button 
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
                  onClick={() => navigate("/")}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Browse Clinics
                </Button>
              </div>
            ) : (
              <div className={`grid gap-4 ${activeFilter ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
                {displayedAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="group p-5 border-2 border-gray-100 rounded-xl hover:border-blue-300 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer bg-white"
                    onClick={() => navigate(`/patient/queue/${apt.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-bold text-lg flex items-center gap-2 mb-1 group-hover:text-blue-600 transition-colors">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          {apt.clinic.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">{apt.clinic.specialty}</p>
                      </div>
                      {getStatusBadge(apt.status)}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-sm mb-3">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700">
                        <Calendar className="w-4 h-4" />
                        <span className="font-medium">{format(new Date(apt.appointment_date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700">
                        <Clock className="w-4 h-4" />
                        <span className="font-medium">{apt.scheduled_time}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 w-fit mb-3">
                      <MapPin className="w-4 h-4" />
                      <span className="font-medium">{apt.clinic.city}</span>
                    </div>
                    
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-gray-900 capitalize">{apt.appointment_type.replace('_', ' ')}</span>
                        </p>
                        {apt.queue_position && (
                          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                            Position #{apt.queue_position}
                          </Badge>
                        )}
                      </div>
                      {['scheduled', 'waiting', 'confirmed', 'in_progress'].includes(apt.status) && (
                        <div className="flex items-center gap-2 text-blue-600 group-hover:gap-3 transition-all">
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                          <p className="text-sm font-medium">
                            Track Live Queue
                          </p>
                          <ArrowRight className="w-4 h-4 ml-auto" />
                        </div>
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
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Activity className="w-5 h-5 text-green-600" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-base">
                {recentAppointments.length} completed
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingAppointments ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-green-600"></div>
                </div>
              ) : recentAppointments.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Activity className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No recent appointments
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="p-4 border-2 border-gray-100 rounded-lg hover:border-green-200 hover:bg-green-50/50 transition-all cursor-pointer"
                      onClick={() => navigate(`/patient/queue/${apt.id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-semibold text-sm">{apt.clinic.name}</p>
                        {getStatusBadge(apt.status)}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(apt.appointment_date), 'MMM d')} at {apt.scheduled_time}
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
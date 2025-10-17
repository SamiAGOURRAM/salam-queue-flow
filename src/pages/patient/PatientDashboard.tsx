import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Activity, Search, LogOut } from "lucide-react";

export default function PatientDashboard() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Enhanced Header with Navigation */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/30">
                <Activity className="w-6 h-6 text-white" />
                <span className="text-lg font-bold text-white">QueueMed</span>
              </div>
              <span className="text-sm text-gray-500 hidden md:block">Patient Portal</span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => navigate("/")}
                className="text-gray-700 hover:text-blue-600 hover:bg-blue-50"
              >
                <Search className="w-4 h-4 mr-2" />
                Browse Clinics
              </Button>
              
              <Button 
                variant="ghost" 
                onClick={() => navigate("/patient/appointments")}
                className="text-gray-700 hover:text-blue-600 hover:bg-blue-50"
              >
                <Calendar className="w-4 h-4 mr-2" />
                My Appointments
              </Button>
              
              <Button 
                variant="ghost" 
                onClick={signOut}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Welcome back! 👋
          </h1>
          <p className="text-gray-600 mt-2">
            Manage your appointments and track queue positions
          </p>
        </div>

        {/* Browse Clinics CTA Card */}
        <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 hover:shadow-xl transition-all hover:scale-[1.01]">
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-6">
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-semibold text-gray-900 mb-2 flex items-center justify-center md:justify-start gap-2">
                <Search className="w-6 h-6 text-blue-600" />
                Looking for a clinic?
              </h3>
              <p className="text-gray-600">
                Browse trusted healthcare providers and book appointments instantly
              </p>
            </div>
            <Button 
              onClick={() => navigate("/")}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg h-12 px-8"
            >
              <Search className="w-5 h-5 mr-2" />
              Browse Clinics
            </Button>
          </CardContent>
        </Card>

        {/* Dashboard Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Upcoming Appointments */}
          <Card className="shadow-lg border-0 hover:shadow-xl transition-shadow">
            <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
                Upcoming Appointments
              </CardTitle>
              <CardDescription>You have no upcoming appointments</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Button 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                onClick={() => navigate("/")}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Book New Appointment
              </Button>
            </CardContent>
          </Card>

          {/* Queue Status */}
          <Card className="shadow-lg border-0 hover:shadow-xl transition-shadow">
            <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5 text-orange-600" />
                Queue Status
              </CardTitle>
              <CardDescription>No active queue position</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 mb-3">
                  <Clock className="w-8 h-8 text-orange-600" />
                </div>
                <p className="text-sm text-gray-600">
                  Your queue position will appear here when you check in for an appointment.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="shadow-lg border-0 hover:shadow-xl transition-shadow">
            <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="w-5 h-5 text-green-600" />
                Recent Activity
              </CardTitle>
              <CardDescription>No recent appointments</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-3">
                  <Activity className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-sm text-gray-600">
                  Your appointment history will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

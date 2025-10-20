import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  Search, 
  Calendar, 
  User,
  LogOut,
  LogIn,
  Info // 1. IMPORT THE NEW ICON
} from "lucide-react";

export default function PatientLayout() {
  const { user, signOut } = useAuth(); 
  const navigate = useNavigate();
  const location = useLocation();

  const navigationItems = [
    {
      name: "Browse Clinics",
      path: "/clinics",
      icon: Search,
    },
    // 2. ADD THE NEW "ABOUT" LINK HERE
    {
      name: "My Appointments",
      path: "/my-appointments",
      icon: Calendar,
    },
    {
      name: "Profile",
      path: "/patient/profile",
      icon: User,
    },
    {
      name: "About",
      path: "/welcome", // This will link to Welcome.tsx
      icon: Info,
    },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };
  

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Persistent Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo/Brand */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/30 cursor-pointer hover:shadow-xl transition-shadow"
                onClick={() => navigate("/")}
              >
                <Activity className="w-6 h-6 text-white" />
                <span className="text-xl font-bold text-white">INTIDAR</span>
              </div>
            </div>

            {/* Navigation Tabs (Only show if logged in, typically) */}
            <nav className="hidden md:flex items-center gap-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                
                return (
                  <Button
                    key={item.path}
                    variant={active ? "default" : "ghost"}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "gap-2 transition-all",
                      active && "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Button>
                );
              })}
            </nav>

            {/* 🟢 CONDITIONAL BUTTON: Sign Out vs Log In */}
            {user ? (
              // If user is logged in, show Sign Out
              <Button 
                variant="ghost" 
                onClick={signOut} 
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            ) : (
              // If user is NOT logged in (or just signed out), show Log In
              <Button 
                variant="default" 
                onClick={() => navigate('/auth/login')} 
                className="gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Log In</span>
              </Button>
            )}
          </div>

          {/* Mobile Navigation */}
          <nav className="md:hidden flex items-center gap-2 mt-4 overflow-x-auto pb-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              
              return (
                <Button
                  key={item.path}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "gap-2 flex-shrink-0",
                    active && "bg-gradient-to-r from-blue-600 to-cyan-600"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area - Pages render here */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
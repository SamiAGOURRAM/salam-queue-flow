import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  Users, 
  Calendar, 
  Settings, 
  UserPlus, 
  LayoutDashboard,
  LogOut
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

  

export default function ClinicLayout() {
  const { user, loading, isClinicOwner, isStaff, rolesLoading, userRoles, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clinic, setClinic] = useState<ClinicRow | null>(null);

  const fetchClinic = useCallback(async () => {
    if (!user) return;
    
    // Debug: Log current role state
    logger.debug("Fetching clinic - checking roles", { 
      userId: user?.id, 
      isClinicOwner, 
      isStaff,
      rolesLoading,
      userRolesCount: userRoles.length,
      hasRoles: userRoles.length > 0
    });
    
    // If roles are still loading, wait for them to finish
    // This prevents the initial false negative when roles haven't loaded yet
    if (rolesLoading) {
      logger.debug("Roles still loading, will retry when roles are available", { userId: user?.id });
      return;
    }
    
    // Even if rolesLoading is false, we need to ensure roles have actually been loaded
    // When waiting for another instance's promise, rolesLoading might be false before userRoles is set
    // Check if we have roles OR if isClinicOwner/isStaff are true (which means roles have been processed)
    const hasRolesLoaded = userRoles.length > 0 || isClinicOwner || isStaff;
    
    if (!hasRolesLoaded) {
      // Roles haven't loaded yet, even though rolesLoading is false
      // This can happen when waiting for another instance's promise
      logger.debug("Roles not loaded yet (waiting for promise resolution), will retry", { userId: user?.id });
      return;
    }
    
    // If roles have finished loading and user has no clinic owner or staff role, they shouldn't be here
    if (!isClinicOwner && !isStaff) {
      logger.warn("User is not clinic owner or staff", { userId: user?.id, roles: userRoles });
      return;
    }
    
    try {
      let query = supabase.from("clinics").select("*");

      if (isClinicOwner) {
        logger.debug("User is clinic owner, fetching clinic by owner_id", { userId: user?.id });
        query = query.eq("owner_id", user?.id);
      } else if (isStaff) {
        // For staff, get clinic from clinic_staff table
        const { data: staffData, error: staffError } = await supabase
          .from("clinic_staff")
          .select("clinic_id")
          .eq("user_id", user?.id)
          .maybeSingle();

        if (staffError) {
          // Check if it's a 406 error (RLS blocking or format mismatch)
          const is406Error = staffError.code === 'PGRST116' || 
                            staffError.message?.includes('406') || 
                            staffError.message?.includes('Not Acceptable') ||
                            staffError.message?.includes('application/vnd.pgrst.object');
          
          if (is406Error) {
            logger.error("RLS policy blocking clinic_staff access or format mismatch", { userId: user?.id, error: staffError });
            return;
          }
          logger.error("Error fetching clinic_staff", staffError, { userId: user?.id });
          return;
        }

        if (staffData) {
          query = query.eq("id", staffData.clinic_id);
        } else {
          // Staff user but no clinic_staff record found
          logger.warn("Staff user has no clinic_staff record", { userId: user?.id });
          return;
        }
      }

      // Use .maybeSingle() instead of .single() to avoid 406 errors when RLS blocks
      const { data, error } = await query.maybeSingle();
      
      if (error) {
        // Check if it's a 406 error (RLS blocking or format mismatch)
        const is406Error = error.code === 'PGRST116' || 
                          error.message?.includes('406') || 
                          error.message?.includes('Not Acceptable') ||
                          error.message?.includes('application/vnd.pgrst.object');
        
        if (is406Error) {
          logger.error("RLS policy blocking clinic access or format mismatch", { userId: user?.id, isClinicOwner, isStaff, error });
        } else {
          logger.error("Error fetching clinic", error, { userId: user?.id, isClinicOwner });
        }
        return;
      }

      setClinic(data || null);
    } catch (error) {
      logger.error("Error fetching clinic", error instanceof Error ? error : new Error(String(error)), { userId: user?.id, isClinicOwner });
    }
  }, [isClinicOwner, isStaff, rolesLoading, user, userRoles]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && !loading && !rolesLoading) {
      // Wait for user, loading, and rolesLoading to be complete before fetching clinic
      // The fetchClinic callback will re-run when isClinicOwner/isStaff change
      fetchClinic();
    }
  }, [user, loading, rolesLoading, isClinicOwner, isStaff, navigate, fetchClinic]);

  const navigationItems = [
    {
      name: "Dashboard",
      path: "/clinic/dashboard",
      icon: LayoutDashboard,
      showFor: ["owner"], // Only owners see dashboard
    },
    {
      name: "Live Queue",
      path: "/clinic/queue",
      icon: Activity,
      showFor: ["owner", "staff"],
    },
    {
      name: "Calendar",
      path: "/clinic/calendar",
      icon: Calendar,
      showFor: ["owner", "staff"],
    },
    {
      name: "Team",
      path: "/clinic/team",
      icon: UserPlus,
      showFor: ["owner"], // Only owners manage team
    },
    {
      name: "Settings",
      path: "/clinic/settings",
      icon: Settings,
      showFor: ["owner"], // Only owners access settings
    },
  ];

  const userRole = isClinicOwner ? "owner" : isStaff ? "staff" : null;

  const visibleNavItems = navigationItems.filter((item) =>
    item.showFor.includes(userRole || "")
  );

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Persistent Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Clinic Name/Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{clinic?.name || "QueueMed"}</h1>
                <p className="text-xs text-muted-foreground">{clinic?.specialty}</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-2">
              {visibleNavItems.map((item) => {
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

            {/* Sign Out */}
            <Button variant="outline" onClick={signOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>

          {/* Mobile Navigation */}
          <nav className="md:hidden flex items-center gap-2 mt-4 overflow-x-auto pb-2">
            {visibleNavItems.map((item) => {
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
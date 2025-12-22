import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/shared/logging/Logger";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Activity,
  Calendar,
  Settings,
  UserPlus,
  LayoutDashboard,
  LogOut,
  Search,
  Bell,
  Mail,
  Sun,
  Moon,
  Menu,
  X,
  ChevronDown
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

export default function ClinicLayout() {
  // ===== ALL HOOKS PRESERVED IN EXACT ORDER =====
  const { user, loading, isClinicOwner, isStaff, rolesLoading, userRoles, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ===== ALL CALLBACKS PRESERVED =====
  const fetchClinic = useCallback(async () => {
    if (!user) return;

    if (rolesLoading) {
      logger.debug("Roles still loading, will retry when roles are available", { userId: user?.id });
      return;
    }

    const hasRolesLoaded = userRoles.length > 0 || isClinicOwner || isStaff;

    if (!hasRolesLoaded) {
      logger.debug("Roles not loaded yet, will retry", { userId: user?.id });
      return;
    }

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
        const { data: staffData, error: staffError } = await supabase
          .from("clinic_staff")
          .select("clinic_id")
          .eq("user_id", user?.id)
          .maybeSingle();

        if (staffError) {
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
          logger.warn("Staff user has no clinic_staff record", { userId: user?.id });
          return;
        }
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
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

  // ===== ALL EFFECTS PRESERVED =====
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && !loading && !rolesLoading) {
      fetchClinic();
    }
  }, [user, loading, rolesLoading, isClinicOwner, isStaff, navigate, fetchClinic]);

  // ===== ALL NAVIGATION LOGIC PRESERVED =====
  const navigationItems = [
    {
      name: "Dashboard",
      path: "/clinic/dashboard",
      icon: LayoutDashboard,
      showFor: ["owner"],
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
      showFor: ["owner"],
    },
    {
      name: "Settings",
      path: "/clinic/settings",
      icon: Settings,
      showFor: ["owner"],
    },
  ];

  const userRole = isClinicOwner ? "owner" : isStaff ? "staff" : null;
  const visibleNavItems = navigationItems.filter((item) =>
    item.showFor.includes(userRole || "")
  );

  const isActive = (path: string) => location.pathname === path;

  // ===== LOADING STATE PRESERVED =====
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-200",
        sidebarCollapsed ? "w-[60px]" : "w-[220px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4 text-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
              <span className="text-sm font-semibold text-foreground truncate">
                {clinic?.name || "QueueMed"}
              </span>
            )}
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 flex-shrink-0", active && "text-primary")} />
                {!sidebarCollapsed && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 h-12 bg-card border-b border-border flex items-center px-3 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md hover:bg-muted"
          >
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex p-1.5 rounded-md hover:bg-muted"
          >
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full h-8 pl-8 pr-3 text-[13px] bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative p-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <Sun className="w-4 h-4 text-muted-foreground transition-transform dark:hidden" />
              <Moon className="w-4 h-4 text-muted-foreground hidden dark:block" />
            </button>

            {/* Notifications */}
            <button className="relative p-1.5 rounded-md hover:bg-muted transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Mail */}
            <button className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Profile */}
            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border">
              <div className="hidden sm:block text-right">
                <p className="text-[13px] font-medium text-foreground leading-tight">
                  {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
                </p>
                <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  Online
                </p>
              </div>
              <Avatar className="w-7 h-7">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="text-[11px] font-medium bg-muted">
                  {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

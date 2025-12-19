import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { 
  Activity, 
  Users, 
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
  ChevronDown,
  User
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

export default function ClinicLayout() {
  const { user, loading, isClinicOwner, isStaff, rolesLoading, userRoles, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [clinic, setClinic] = useState<ClinicRow | null>(null);

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

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (user && !loading && !rolesLoading) {
      fetchClinic();
    }
  }, [user, loading, rolesLoading, isClinicOwner, isStaff, navigate, fetchClinic]);

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
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="border-r border-border/50">
          <SidebarHeader className="border-b border-border/50 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground-primary">{clinic?.name || "QueueMed"}</h1>
                <p className="text-xs text-foreground-muted">{clinic?.specialty || "Healthcare"}</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-foreground-muted uppercase tracking-wider px-3 py-2">
                Main Menu
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.path)}
                          isActive={active}
                          className={cn(
                            "w-full justify-start",
                            active && "bg-sidebar-primary text-sidebar-primary-foreground"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-border/50 p-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={signOut}
                  className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              
              {/* Search */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                  <Input
                    type="search"
                    placeholder="Search..."
                    className="pl-9 h-10 rounded-full border-border/50 bg-background-secondary"
                  />
                </div>
              </div>

              {/* Right side actions */}
              <div className="flex items-center gap-3 ml-auto">
                {/* Theme Toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="h-10 w-10 rounded-full"
                >
                  <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>

                {/* Notifications */}
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full relative">
                  <Bell className="h-5 w-5" />
                  <Badge className="absolute top-1 right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                    1
                  </Badge>
                </Button>

                {/* Mail */}
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
                  <Mail className="h-5 w-5" />
                </Button>

                {/* Profile */}
                <div className="flex items-center gap-3 pl-3 border-l border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-foreground-primary">
                        {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
                      </p>
                      <p className="text-xs text-foreground-muted flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                        Online
                      </p>
                    </div>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user?.user_metadata?.avatar_url} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

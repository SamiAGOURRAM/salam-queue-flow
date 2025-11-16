import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/services/shared/logging/Logger";
// 🟢 NEW: Import useNavigate to handle redirects from the hook
import { useNavigate } from "react-router-dom"; 

export interface UserRole {
  role: 'super_admin' | 'clinic_owner' | 'staff' | 'patient';
  clinic_id: string | null;
}

// 🟢 NEW: Custom Hook is now a Function Component (Hook)
// Hooks that use hooks (like useNavigate) must be functions
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const { toast } = useToast();
  // 🟢 NEW: Initialize useNavigate
  const navigate = useNavigate(); 

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoles(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoles(session.user.id);
      } else {
        // Clear roles and, critically, ensure we navigate away if the user is out
        setUserRoles([]);
        // We navigate here as a fallback/redundancy, but the explicit call below is better
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, clinic_id")
      .eq("user_id", userId);

    if (error) {
      logger.error("Error fetching user roles", error, { userId });
      return;
    }

    setUserRoles(data || []);
  };

  // 🟢 CORRECTED SIGN OUT FUNCTION
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // 1. Manually trigger the state clear for immediate UI feedback (optional, but safer)
    setUser(null);
    setUserRoles([]);
    
    // 2. 🟢 CRITICAL FIX: Redirect the user immediately after sign out
    navigate('/auth/login', { replace: true });
    
    toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
    });
  };

  const hasRole = (role: string) => {
    return userRoles.some((r) => r.role === role);
  };

  const isClinicOwner = hasRole("clinic_owner");
  const isStaff = hasRole("staff");

  return {
    user,
    loading,
    userRoles,
    signOut,
    hasRole,
    isClinicOwner,
    isStaff,
    isPatient: hasRole("patient"),
  };
}
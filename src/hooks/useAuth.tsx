import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";

export interface UserRole {
  role: 'super_admin' | 'clinic_owner' | 'staff' | 'patient';
  clinic_id: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const { toast } = useToast();

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
        setUserRoles([]);
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
      console.error("Error fetching user roles:", error);
      return;
    }

    setUserRoles(data || []);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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

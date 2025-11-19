import { useEffect, useState, useRef } from "react";
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

// Module-level cache to prevent duplicate fetches across all hook instances
const rolesCache = new Map<string, { roles: UserRole[]; timestamp: number }>();
const activeFetches = new Map<string, Promise<UserRole[]>>(); // Track active fetch promises by userId
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// 🟢 NEW: Custom Hook is now a Function Component (Hook)
// Hooks that use hooks (like useNavigate) must be functions
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const { toast } = useToast();
  // 🟢 NEW: Initialize useNavigate
  const navigate = useNavigate();
  
  // Track which user's roles we've fetched to avoid duplicate fetches
  const fetchedUserIdRef = useRef<string | null>(null);
  const initialSessionFetchedRef = useRef(false);
  const hasRolesRef = useRef(false); // Track if we have roles loaded 

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        initialSessionFetchedRef.current = true;
        fetchUserRoles(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip INITIAL_SESSION event - getSession() already handles it
      // This prevents duplicate fetches on initial load
      if (event === 'INITIAL_SESSION' && initialSessionFetchedRef.current) {
        logger.debug("Skipping INITIAL_SESSION event - already handled by getSession", {});
        return;
      }
      
      const previousUserId = fetchedUserIdRef.current;
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Only fetch if it's a different user or we don't have roles yet
        if (session.user.id !== previousUserId || !hasRolesRef.current) {
          fetchUserRoles(session.user.id);
        } else {
          logger.debug("Skipping user roles fetch - already have roles for this user", { userId: session.user.id });
        }
      } else {
        // User signed out - clear everything
        setUserRoles([]);
        fetchedUserIdRef.current = null;
        initialSessionFetchedRef.current = false;
        hasRolesRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Only run once on mount

  const fetchUserRoles = async (userId: string) => {
    // Check module-level cache first (shared across all hook instances)
    const cached = rolesCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.debug("Using cached user roles", { userId, roleCount: cached.roles.length });
      setUserRoles(cached.roles);
      fetchedUserIdRef.current = userId;
      hasRolesRef.current = cached.roles.length > 0;
      return;
    }

    // Check if another hook instance is already fetching for this user
    // If so, wait for that promise instead of fetching again
    const existingFetch = activeFetches.get(userId);
    if (existingFetch) {
      logger.debug("User roles fetch already in progress by another instance, waiting for result", { userId });
      try {
        const roles = await existingFetch;
        setUserRoles(roles);
        fetchedUserIdRef.current = userId;
        hasRolesRef.current = roles.length > 0;
        return;
      } catch (error) {
        logger.error("Error waiting for user roles from another instance", error instanceof Error ? error : new Error(String(error)), { userId });
        // Fall through to fetch ourselves
      }
    }

    // Prevent duplicate concurrent calls within this instance
    if (rolesLoading) {
      logger.debug("User roles fetch already in progress in this instance, skipping", { userId });
      return;
    }

    // Don't refetch if we already have roles for this user in this instance
    if (fetchedUserIdRef.current === userId && hasRolesRef.current) {
      logger.debug("User roles already fetched for this user in this instance, skipping", { userId, roleCount: userRoles.length });
      return;
    }

    // Create a new fetch promise and store it (shared across all instances)
    setRolesLoading(true);
    fetchedUserIdRef.current = userId;
    
    const fetchPromise = (async () => {
      logger.debug("Fetching user roles", { userId });
      
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role, clinic_id")
          .eq("user_id", userId);

        if (error) {
          // Check if it's a 406 error (RLS blocking)
          const is406Error = error.code === 'PGRST116' || 
                            error.message?.includes('406') || 
                            error.message?.includes('Not Acceptable');
          
          if (is406Error) {
            logger.error("RLS policy blocking user_roles access", { userId, error: error.message, errorCode: error.code });
          } else {
            logger.error("Error fetching user roles", { userId, error: error.message, errorCode: error.code, fullError: error });
          }
          
          // Cache empty result to prevent repeated failed fetches
          const emptyRoles: UserRole[] = [];
          rolesCache.set(userId, {
            roles: emptyRoles,
            timestamp: Date.now()
          });
          return emptyRoles;
        }

        // Log the actual data returned
        const rolesArray = data || [];
        logger.debug("Fetched user roles", { 
          userId, 
          roleCount: rolesArray.length,
          roles: rolesArray.map(r => ({ role: r.role, clinic_id: r.clinic_id })),
          rawData: JSON.stringify(data)
        });
        
        if (rolesArray.length === 0) {
          logger.warn("No user roles found for user - this might indicate RLS blocking or missing data", { userId });
        }
        
        // Update module-level cache
        rolesCache.set(userId, {
          roles: rolesArray,
          timestamp: Date.now()
        });
        
        return rolesArray;
      } catch (error) {
        logger.error("Unexpected error in fetchUserRoles", error instanceof Error ? error : new Error(String(error)), { userId });
        const emptyRoles: UserRole[] = [];
        rolesCache.set(userId, {
          roles: emptyRoles,
          timestamp: Date.now()
        });
        return emptyRoles;
      } finally {
        activeFetches.delete(userId); // Remove from active fetches when done
      }
    })();
    
    // Store the promise so other instances can wait for it
    activeFetches.set(userId, fetchPromise);
    
    // Wait for the fetch and update state
    try {
      const rolesArray = await fetchPromise;
      setUserRoles(rolesArray);
      hasRolesRef.current = rolesArray.length > 0;
    } catch (error) {
      logger.error("Error in fetch promise", error instanceof Error ? error : new Error(String(error)), { userId });
      setUserRoles([]);
      hasRolesRef.current = false;
    } finally {
      setRolesLoading(false);
    }
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
    rolesLoading,
    signOut,
    hasRole,
    isClinicOwner,
    isStaff,
    isPatient: hasRole("patient"),
  };
}
import { Navigate, Outlet } from 'react-router-dom';
// 🟢 FIX: Changing absolute alias to relative path assuming:
// src/components/auth/ProtectedRoute.tsx is 
// two levels down from src/hooks/useAuth.
import { useAuth } from '../../hooks/useAuth'; 

// NOTE: Using a simple div instead of imported Skeleton for simplicity
// If you have a real Skeleton component, replace this.
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="p-4 text-gray-700 border border-gray-300 rounded-lg shadow-md animate-pulse">
      Checking authentication status...
    </div>
  </div>
);

/**
 * Auth Guard component to wrap protected routes.
 * Redirects unauthorized users to the login page.
 */
export const ProtectedRoute = () => {
  // We rely on the useAuth hook to determine user state and loading status.
  const { user, loading } = useAuth();
  
  // 1. Show a loading state while the authentication status is being checked (initial session check).
  if (loading) {
    return <LoadingFallback />;
  }

  // 2. If the user is NOT authenticated, redirect them to the login page.
  // The `replace` prop ensures the user cannot hit the back button to return here.
  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  // 3. If the user IS authenticated, render the nested component (the Layout and its children).
  return <Outlet />;
};

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';

/**
 * Hook to force light mode on public pages
 * Prevents dark mode from persisting on pages that don't support it
 */
export function useForceLightMode() {
  const { setTheme, theme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    // List of public routes that should always be light mode
    const publicRoutes = [
      '/',
      '/auth/login',
      '/auth/signup',
      '/auth/staff-signup',
      '/auth/onboarding',
      '/clinics',
      '/welcome',
      '/clinic/', // Public clinic browsing
      '/booking/', // Public booking flow
    ];

    // Check if current route is a public route
    const isPublicRoute = publicRoutes.some(route => 
      location.pathname === route || location.pathname.startsWith(route)
    );

    // Force light mode on public routes
    if (isPublicRoute && theme !== 'light') {
      setTheme('light');
    }
  }, [location.pathname, theme, setTheme]);
}


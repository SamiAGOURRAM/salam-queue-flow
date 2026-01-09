import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';

/**
 * Hook to force light mode on public pages
 * Prevents dark mode from persisting on pages that don't support it
 * 
 * Authenticated patient routes (/my-appointments, /patient/*) support dark mode
 */
export function useForceLightMode() {
  const { setTheme, theme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    // Routes that should ALWAYS be light mode (public/unauthenticated pages)
    const forceLightRoutes = [
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

    // Routes that SUPPORT dark mode (authenticated patient dashboard)
    const darkModeEnabledRoutes = [
      '/my-appointments',
      '/patient/',
    ];

    // Check if current route supports dark mode
    const supportsDarkMode = darkModeEnabledRoutes.some(route => 
      location.pathname === route || location.pathname.startsWith(route)
    );

    // If route supports dark mode, don't force anything
    if (supportsDarkMode) {
      return;
    }

    // Check if current route should be forced to light mode
    const shouldForceLight = forceLightRoutes.some(route => 
      location.pathname === route || location.pathname.startsWith(route)
    );

    // Force light mode on public routes
    if (shouldForceLight && theme !== 'light') {
      setTheme('light');
    }
  }, [location.pathname, theme, setTheme]);
}


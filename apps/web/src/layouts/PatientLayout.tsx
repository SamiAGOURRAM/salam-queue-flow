import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useForceLightMode } from "@/hooks/useForceLightMode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search,
  Calendar,
  User,
  LogOut,
  LogIn,
  Info
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

export default function PatientLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  
  // Force light mode on public pages
  useForceLightMode();

  // Base navigation items available to everyone
  const baseNavigationItems = [
    {
      name: t('nav.clinics'),
      path: "/clinics",
      icon: Search,
    },
    {
      name: t('nav.about'),
      path: "/welcome",
      icon: Info,
    },
  ];

  // Authenticated-only navigation items
  const authenticatedNavigationItems = [
    {
      name: t('nav.appointments'),
      path: "/my-appointments",
      icon: Calendar,
    },
    {
      name: t('nav.profile'),
      path: "/patient/profile",
      icon: User,
    },
  ];

  // Combine navigation items based on auth status
  const navigationItems = user
    ? [...baseNavigationItems, ...authenticatedNavigationItems]
    : baseNavigationItems;

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left Side: Logo + Language */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="w-7 h-7 rounded-md bg-obsidian flex items-center justify-center">
                  <span className="text-white text-sm font-bold">Q</span>
                </div>
                <span className="text-base font-semibold text-gray-900">QueueMed</span>
              </button>
              <div className="h-4 w-px bg-border" />
              <LanguageSwitcher />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                      active
                        ? "text-gray-900 bg-gray-100"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </button>
                );
              })}
            </nav>

            {/* Right Side: Auth */}
            <div className="flex items-center gap-2">
              {user ? (
                <Button
                  variant="ghost"
                  onClick={signOut}
                  className="h-9 px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                >
                  <LogOut className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t('nav.logout')}</span>
                </Button>
              ) : (
                <Button
                  onClick={() => navigate('/auth/login')}
                  className="h-9 px-4 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
                >
                  <LogIn className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t('nav.login')}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Mobile Navigation */}
          <nav className="md:hidden flex items-center gap-1 pb-3 overflow-x-auto">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                    active
                      ? "text-gray-900 bg-gray-100"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}

/**
 * SiteHeader — the single, shared, auth-aware top navigation used across the
 * public site (landing, welcome, clinics, doctors) and the patient area.
 *
 * Standardizes what used to be two divergent hand-rolled headers (the landing
 * page and PatientLayout). The clinic back-office uses its own sidebar layout
 * and intentionally does not use this header.
 */
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  Search,
  Stethoscope,
  Calendar,
  User,
  LogOut,
  LogIn,
  Info,
  Moon,
  Sun,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  const baseNavigationItems = [
    { name: t("nav.doctors", "Browse Doctors"), path: "/doctors", icon: Stethoscope },
    { name: t("nav.clinics"), path: "/clinics", icon: Search },
    { name: t("nav.about"), path: "/welcome", icon: Info },
  ];

  const authenticatedNavigationItems = [
    { name: t("nav.appointments"), path: "/my-appointments", icon: Calendar },
    { name: t("nav.profile"), path: "/patient/profile", icon: User },
  ];

  const navigationItems = user
    ? [...baseNavigationItems, ...authenticatedNavigationItems]
    : baseNavigationItems;

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + Language */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-7 h-7 rounded-md bg-foreground dark:bg-primary flex items-center justify-center">
                <span className="text-background dark:text-primary-foreground text-sm font-bold">Q</span>
              </div>
              <span className="text-base font-semibold text-foreground">QueueMed</span>
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
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </button>
              );
            })}
          </nav>

          {/* Right: Theme toggle + Auth */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/demo")}
              className="h-9 px-3 text-sm rounded-md border-border inline-flex"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">{t("nav.demo", "Live Demo")}</span>
            </Button>

            <button
              onClick={toggleTheme}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Toggle theme"
            >
              <Sun className="w-4 h-4 hidden dark:block" />
              <Moon className="w-4 h-4 dark:hidden" />
            </button>

            {user ? (
              <Button
                variant="ghost"
                onClick={signOut}
                className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">{t("nav.logout")}</span>
              </Button>
            ) : (
              <Button
                onClick={() => navigate("/auth/login")}
                className="h-9 px-4 bg-foreground hover:bg-foreground/90 dark:bg-primary dark:hover:bg-primary/90 text-background dark:text-primary-foreground text-sm font-medium rounded-md"
              >
                <LogIn className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">{t("nav.login")}</span>
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
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground",
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
  );
}

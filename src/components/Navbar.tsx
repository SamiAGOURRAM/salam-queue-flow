import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Calendar, Building2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, signOut, isClinicOwner, isStaff } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="text-white font-bold text-sm">Q</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold leading-none">QueueMed</span>
              <span className="text-xs text-muted-foreground">
                {isClinicOwner || isStaff ? "Clinic Portal" : "Patient Portal"}
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="font-medium">
              Browse Clinics
            </Button>
            {user && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/my-appointments")} className="gap-2 font-medium">
                <Calendar className="w-4 h-4" />
                My Appointments
              </Button>
            )}
            {(isClinicOwner || isStaff) && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/clinic/dashboard")} className="gap-2 font-medium">
                <Building2 className="w-4 h-4" />
                Clinic Dashboard
              </Button>
            )}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {!user && !isClinicOwner && !isStaff && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate("/auth/login")}
                className="gap-2"
              >
                <Building2 className="w-4 h-4" />
                For Clinics
              </Button>
            )}
            {user ? (
              <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth/login")}>
                  Sign In
                </Button>
                <Button size="sm" className="shadow-md" onClick={() => navigate("/auth/signup")}>
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 space-y-3 animate-in slide-in-from-top-5">
            <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/")}>
              Browse Clinics
            </Button>
            {user && (
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => navigate("/my-appointments")}>
                <Calendar className="w-4 h-4" />
                My Appointments
              </Button>
            )}
            {(isClinicOwner || isStaff) && (
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => navigate("/clinic/dashboard")}>
                <Building2 className="w-4 h-4" />
                Clinic Dashboard
              </Button>
            )}
            <div className="pt-4 space-y-2">
              {!user && !isClinicOwner && !isStaff && (
                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={() => navigate("/auth/login")}
                >
                  <Building2 className="w-4 h-4" />
                  For Clinics
                </Button>
              )}
              {user ? (
                <Button variant="outline" className="w-full gap-2" onClick={signOut}>
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="w-full" onClick={() => navigate("/auth/login")}>
                    Sign In
                  </Button>
                  <Button className="w-full" onClick={() => navigate("/auth/signup")}>
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

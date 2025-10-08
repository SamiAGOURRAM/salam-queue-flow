import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading, isPatient, isClinicOwner, isStaff } = useAuth();
  
  useEffect(() => {
    if (!loading && user) {
      // Redirect authenticated users to their dashboard
      if (isPatient) {
        navigate("/patient/dashboard");
      } else if (isClinicOwner || isStaff) {
        navigate("/clinic/dashboard");
      }
    }
  }, [user, loading, isPatient, isClinicOwner, isStaff, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
  return (
    <div className="min-h-screen">
      <Navbar onGetStarted={() => navigate("/auth/signup")} />
      <main>
        <Hero onGetStarted={() => navigate("/auth/signup")} />
        <Features />
        <HowItWorks />
        <CTA onGetStarted={() => navigate("/auth/signup")} />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

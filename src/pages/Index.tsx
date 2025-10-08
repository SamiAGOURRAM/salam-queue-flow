import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

const Index = () => {
  const navigate = useNavigate();
  
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

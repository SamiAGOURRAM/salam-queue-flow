import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import PatientOnboarding from "./pages/auth/onboarding/PatientOnboarding";
import ClinicOnboarding from "./pages/auth/onboarding/ClinicOnboarding";
import PatientDashboard from "./pages/patient/PatientDashboard";
import ClinicDashboard from "./pages/clinic/ClinicDashboard";
import ClinicQueue from "./pages/clinic/ClinicQueue";
import MyQueue from "./pages/patient/MyQueue";
import ClinicDetailView from "./components/booking/ClinicDetailView";
import BookingFlow from "./components/booking/BookingFlow";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/clinic/:clinicId" element={<ClinicDetailView />} />
          <Route path="/booking/:clinicId" element={<BookingFlow />} />
          <Route path="/my-appointments" element={<PatientDashboard />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="/auth/onboarding/patient" element={<PatientOnboarding />} />
          <Route path="/auth/onboarding/clinic" element={<ClinicOnboarding />} />
            <Route path="/patient/dashboard" element={<PatientDashboard />} />
            <Route path="/patient/queue/:appointmentId" element={<MyQueue />} />
            <Route path="/clinic/dashboard" element={<ClinicDashboard />} />
            <Route path="/clinic/queue" element={<ClinicQueue />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;

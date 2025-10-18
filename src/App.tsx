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
import ClinicCalendar from "./pages/clinic/ClinicCalendar";
import MyQueue from "./pages/patient/MyQueue";
import ClinicDetailView from "./components/booking/ClinicDetailView";
import BookingFlow from "./components/booking/BookingFlow";
import TeamManagement from "./pages/clinic/TeamManagement";
import ClinicSettings from "./pages/clinic/ClinicSettings";
import ClinicProfile from "./pages/clinic/ClinicProfile";
import AcceptInvitation from "./pages/AcceptInvitation";
import ClinicLayout from "./layouts/ClinicLayout";
import PatientLayout from "./layouts/PatientLayout";
import PatientProfile from "./pages/patient/PatientProfile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Auth routes - NO layout */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="/auth/onboarding/patient" element={<PatientOnboarding />} />
          <Route path="/auth/onboarding/clinic" element={<ClinicOnboarding />} />
          <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />

          {/* Patient routes - WITH PatientLayout */}
          <Route element={<PatientLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/my-appointments" element={<PatientDashboard />} />
            <Route path="/patient/profile" element={<PatientProfile />} />
            <Route path="/patient/queue/:appointmentId" element={<MyQueue />} />
            <Route path="/clinic/:clinicId" element={<ClinicDetailView />} />
            <Route path="/booking/:clinicId" element={<BookingFlow />} />
          </Route>
          
          {/* Clinic routes - WITH ClinicLayout */}
          <Route path="/clinic" element={<ClinicLayout />}>
            <Route path="dashboard" element={<ClinicDashboard />} />
            <Route path="queue" element={<ClinicQueue />} />
            <Route path="calendar" element={<ClinicCalendar />} />
            <Route path="team" element={<TeamManagement />} />
            <Route path="settings" element={<ClinicSettings />} />
            <Route path="profile" element={<ClinicProfile />} />
          </Route>

          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
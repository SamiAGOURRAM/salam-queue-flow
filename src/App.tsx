import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Standard Page Components
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Welcome from "./pages/Welcome.tsx";

// Auth Pages
import Login from "./pages/auth/Login.tsx";
import Signup from "./pages/auth/Signup.tsx";
import StaffSignup from "./pages/auth/StaffSignup.tsx";
import PatientOnboarding from "./pages/auth/onboarding/PatientOnboarding.tsx";
import ClinicOnboarding from "./pages/auth/onboarding/ClinicOnboarding.tsx";
import AcceptInvitation from "./pages/AcceptInvitation.tsx";

// Patient Pages
import PatientDashboard from "./pages/patient/PatientDashboard.tsx";
import MyQueue from "./pages/patient/MyQueue.tsx";
import PatientProfile from "./pages/patient/PatientProfile.tsx";

// Clinic Pages
import ClinicDashboard from "./pages/clinic/ClinicDashboard.tsx";
import ClinicQueue from "./pages/clinic/ClinicQueue.tsx";
import ClinicCalendar from "./pages/clinic/ClinicCalendar.tsx";
import TeamManagement from "./pages/clinic/TeamManagement.tsx";
import ClinicSettings from "./pages/clinic/ClinicSettings.tsx";
import ClinicProfile from "./pages/clinic/ClinicProfile.tsx";

// Shared Components/Flows
import ClinicDetailView from "./components/booking/ClinicDetailView.tsx";
import BookingFlow from "./components/booking/BookingFlow.tsx";

// Layouts
import ClinicLayout from "./layouts/ClinicLayout.tsx";
import PatientLayout from "./layouts/PatientLayout.tsx";

// Protected Route Component
import { ProtectedRoute } from "./components/auth/ProtectedRoute.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* ======================================================= */}
          {/* Public Routes (Auth, Onboarding, Invitations) */}
          {/* ======================================================= */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="/auth/staff-signup" element={<StaffSignup />} />
          <Route path="/auth/onboarding/patient" element={<PatientOnboarding />} />
          <Route path="/auth/onboarding/clinic" element={<ClinicOnboarding />} />
          <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />

          {/* ======================================================= */}
          {/* PUBLIC Patient Routes with PatientLayout */}
          {/* ======================================================= */}
          <Route path="/" element={<PatientLayout />}>
            {/* Browse Clinics - Default landing page */}
            <Route index element={<Index />} />

            {/* About/Welcome page - Accessible via nav button */}
            <Route path="welcome" element={<Welcome />} />

            {/* Public clinic browsing */}
            <Route path="clinic/:clinicId" element={<ClinicDetailView />} />
            <Route path="booking/:clinicId" element={<BookingFlow />} />

            {/* PROTECTED Patient Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="my-appointments" element={<PatientDashboard />} />
              <Route path="patient/profile" element={<PatientProfile />} />
              <Route path="patient/queue/:appointmentId" element={<MyQueue />} />
            </Route>
          </Route>

          {/* ======================================================= */}
          {/* PROTECTED Clinic Routes */}
          {/* ======================================================= */}
          <Route element={<ProtectedRoute />}>
            <Route path="/clinic" element={<ClinicLayout />}>
              <Route path="dashboard" element={<ClinicDashboard />} />
              <Route path="queue" element={<ClinicQueue />} />
              <Route path="calendar" element={<ClinicCalendar />} />
              <Route path="team" element={<TeamManagement />} />
              <Route path="settings" element={<ClinicSettings />} />
              <Route path="profile" element={<ClinicProfile />} />
            </Route>
          </Route>

          {/* ======================================================= */}
          {/* Catch-all route */}
          {/* ======================================================= */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
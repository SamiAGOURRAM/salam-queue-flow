import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";

// Standard Page Components
import Index from "./pages/Index.tsx";
import DemoLauncher from "./pages/DemoLauncher.tsx";
import NotFound from "./pages/NotFound.tsx";
import Welcome from "./pages/Welcome.tsx";
import Clinics from "./pages/Clinics.tsx";
import Doctors from "./pages/Doctors.tsx";

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
import PublicQueueStatus from "./pages/public/PublicQueueStatus.tsx";

// Clinic Pages
import ClinicDashboard from "./pages/clinic/ClinicDashboard.tsx";
import ClinicQueue from "./pages/clinic/ClinicQueue.tsx";
import ClinicCalendar from "./pages/clinic/ClinicCalendar.tsx";
import ClinicAppointmentDetails from "./pages/clinic/ClinicAppointmentDetails.tsx";
import TeamManagement from "./pages/clinic/TeamManagement.tsx";
import ClinicSettings from "./pages/clinic/ClinicSettings.tsx";
import ClinicProfile from "./pages/clinic/ClinicProfile.tsx";
import ClinicTemplates from "./pages/clinic/ClinicTemplates.tsx";
import ClinicMedications from "./pages/clinic/ClinicMedications.tsx";
import ClinicAnalytics from "./pages/clinic/ClinicAnalytics.tsx";
import SuperAdminConsole from "./pages/admin/SuperAdminConsole.tsx";
import MedicalSharingE2EHarness from "./pages/e2e/MedicalSharingE2EHarness.tsx";
import PatientMedicalSharingE2EHarness from "./pages/e2e/PatientMedicalSharingE2EHarness.tsx";
import ConsultationE2EHarness from "./pages/e2e/ConsultationE2EHarness.tsx";
import TemplatesE2EHarness from "./pages/e2e/TemplatesE2EHarness.tsx";
import MedicationCatalogE2EHarness from "./pages/e2e/MedicationCatalogE2EHarness.tsx";

// Shared Components/Flows
import ClinicDetailView from "./components/booking/ClinicDetailView.tsx";
import BookingFlow from "./components/booking/BookingFlow.tsx";

// Layouts
import ClinicLayout from "./layouts/ClinicLayout.tsx";
import PatientLayout from "./layouts/PatientLayout.tsx";

// Protected Route Component
import { ProtectedRoute } from "./components/auth/ProtectedRoute.tsx";
import { ClinicPermissionRoute } from "./components/auth/ClinicPermissionRoute.tsx";
import { SuperAdminRoute } from "./components/auth/SuperAdminRoute.tsx";

// Chat Widget
import { MorphChat } from "./components/chat/MorphChat.tsx";
import { DemoModeBadge } from "./components/DemoModeBadge.tsx";

const queryClient = new QueryClient();
const enableE2ERoutes = import.meta.env.DEV || import.meta.env.MODE === "test";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
        <Routes>
          {/* ======================================================= */}
          {/* Premium Landing Page - Full width, edge-to-edge */}
          {/* ======================================================= */}
          <Route path="/" element={<Index />} />
          <Route path="/demo" element={<DemoLauncher />} />

          {/* ======================================================= */}
          {/* Public Routes (Auth, Onboarding, Invitations) */}
          {/* ======================================================= */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="/auth/staff-signup" element={<StaffSignup />} />
          <Route path="/auth/onboarding/patient" element={<PatientOnboarding />} />
          <Route path="/auth/onboarding/clinic" element={<ClinicOnboarding />} />
          <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />

          {enableE2ERoutes && <Route path="/e2e/medical-sharing" element={<MedicalSharingE2EHarness />} />}
          {enableE2ERoutes && <Route path="/e2e/patient-medical-sharing" element={<PatientMedicalSharingE2EHarness />} />}
          {enableE2ERoutes && <Route path="/e2e/consultation" element={<ConsultationE2EHarness />} />}
          {enableE2ERoutes && <Route path="/e2e/templates" element={<TemplatesE2EHarness />} />}
          {enableE2ERoutes && <Route path="/e2e/medications" element={<MedicationCatalogE2EHarness />} />}

          {/* ======================================================= */}
          {/* PUBLIC Patient Routes with PatientLayout */}
          {/* ======================================================= */}
          <Route element={<PatientLayout />}>

            {/* About/Welcome page - Accessible via nav button */}
            <Route path="welcome" element={<Welcome />} />

            {/* Clinic Directory - Search and Browse */}
            <Route path="doctors" element={<Doctors />} />
            <Route path="clinics" element={<Clinics />} />

            {/* Public clinic browsing */}
            <Route path="clinic/:clinicId" element={<ClinicDetailView />} />
            <Route path="booking/:clinicId" element={<BookingFlow />} />
            <Route path="queue-status/:token" element={<PublicQueueStatus />} />

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
            <Route
              path="/super-admin"
              element={
                <SuperAdminRoute>
                  <SuperAdminConsole />
                </SuperAdminRoute>
              }
            />
            <Route path="/clinic" element={<ClinicLayout />}>
              <Route
                path="dashboard"
                element={
                  <ClinicPermissionRoute requiredAnyPermissions={["view_dashboard", "manage_dashboard"]}>
                    <ClinicDashboard />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="analytics"
                element={
                  <ClinicPermissionRoute requiredPermissions={["view_analytics"]}>
                    <ClinicAnalytics />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="queue"
                element={
                  <ClinicPermissionRoute requiredPermissions={["manage_queue"]}>
                    <ClinicQueue />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="calendar"
                element={
                  <ClinicPermissionRoute requiredAnyPermissions={["view_calendar", "manage_calendar"]}>
                    <ClinicCalendar />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="appointments/:appointmentId"
                element={
                  <ClinicPermissionRoute
                    requiredAnyPermissions={[
                      "manage_queue",
                      "view_calendar",
                      "manage_calendar",
                      "manage_appointments",
                    ]}
                  >
                    <ClinicAppointmentDetails />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="templates"
                element={
                  <ClinicPermissionRoute requiredPermissions={["manage_appointments"]}>
                    <ClinicTemplates />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="medications"
                element={
                  <ClinicPermissionRoute requiredPermissions={["manage_appointments"]}>
                    <ClinicMedications />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="team"
                element={
                  <ClinicPermissionRoute requiredAnyPermissions={["view_team", "manage_team"]}>
                    <TeamManagement />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ClinicPermissionRoute requiredAnyPermissions={["view_clinic_settings", "manage_clinic_settings"]}>
                    <ClinicSettings />
                  </ClinicPermissionRoute>
                }
              />
              <Route
                path="profile"
                element={
                  <ClinicPermissionRoute>
                    <ClinicProfile />
                  </ClinicPermissionRoute>
                }
              />
            </Route>
          </Route>

          {/* ======================================================= */}
          {/* Catch-all route */}
          {/* ======================================================= */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        {/* Global AI chat dock + demo persona switcher */}
        <MorphChat />
        <DemoModeBadge />
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
import { Outlet } from "react-router-dom";
import { useForceLightMode } from "@/hooks/useForceLightMode";
import { SiteHeader } from "@/components/SiteHeader";

export default function PatientLayout() {
  // Force light mode on public pages (patient dashboard routes opt back into dark mode).
  useForceLightMode();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Outlet />
      </main>
    </div>
  );
}

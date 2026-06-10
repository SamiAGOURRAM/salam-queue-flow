/**
 * DemoModeBadge — floating control shown only when signed in as a demo persona.
 * Gives an intuitive way to switch persona or exit demo mode (which is
 * otherwise a dead-end once you pick a role).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Repeat, LogOut, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const DEMO_LABELS: Record<string, string> = {
  "demo.owner@queuemed.test": "Clinic Owner",
  "demo.doctor@queuemed.test": "Doctor",
  "demo.reception@queuemed.test": "Receptionist",
  "demo.patient@queuemed.test": "Patient",
};

function isDemoEmail(email?: string | null): boolean {
  return !!email && email in DEMO_LABELS;
}

export function DemoModeBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!isDemoEmail(user?.email)) return null;
  const label = DEMO_LABELS[user!.email as string];

  const switchPersona = () => navigate("/demo");
  const exitDemo = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-2">
      {open && (
        <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={switchPersona}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Repeat className="h-4 w-4" /> Switch persona
          </button>
          <button
            onClick={exitDemo}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Exit demo
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg",
          "hover:bg-slate-800 transition-colors",
        )}
      >
        <Sparkles className="h-4 w-4 text-amber-300" />
        <span>Demo · {label}</span>
        <ChevronUp className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

/**
 * /demo — one-click persona launcher for recruiters / reviewers.
 *
 * Each card signs in (via Supabase) as a pre-seeded demo account and routes to
 * the relevant area. Backed by `pnpm --filter @queuemed/web run seed:demo`.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stethoscope, ClipboardList, UserRound, Building2, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Persona {
  key: string;
  title: string;
  blurb: string;
  email: string;
  redirect: string;
  icon: typeof Stethoscope;
  accent: string;
}

const PASSWORD = "demo1234";

const personas: Persona[] = [
  {
    key: "owner",
    title: "Clinic Owner",
    blurb: "Dashboard, analytics, team & settings across the clinic.",
    email: "demo.owner@queuemed.test",
    redirect: "/clinic/dashboard",
    icon: Building2,
    accent: "from-violet-500 to-indigo-600",
  },
  {
    key: "doctor",
    title: "Doctor",
    blurb: "Live patient queue, call next, consultations & records.",
    email: "demo.doctor@queuemed.test",
    redirect: "/clinic/queue",
    icon: Stethoscope,
    accent: "from-sky-500 to-cyan-600",
  },
  {
    key: "reception",
    title: "Receptionist",
    blurb: "Manage today's queue, walk-ins and check-ins.",
    email: "demo.reception@queuemed.test",
    redirect: "/clinic/queue",
    icon: ClipboardList,
    accent: "from-emerald-500 to-teal-600",
  },
  {
    key: "patient",
    title: "Patient",
    blurb: "Book appointments, track your queue position live.",
    email: "demo.patient@queuemed.test",
    redirect: "/my-appointments",
    icon: UserRound,
    accent: "from-amber-500 to-orange-600",
  },
];

export default function DemoLauncher() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const enter = async (p: Persona) => {
    if (pending) return;
    setPending(p.key);
    try {
      // Make sure today's demo queue exists (date-relative, idempotent), so the
      // clinic is always populated regardless of when the demo is opened.
      // (Not in generated types — cast; best-effort.)
      try {
        await (supabase.rpc as unknown as (fn: string) => Promise<unknown>)("refresh_demo_queue");
      } catch {
        /* best effort */
      }
      // Ensure a clean session, then sign in as the persona.
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({ email: p.email, password: PASSWORD });
      if (error) throw error;
      navigate(p.redirect);
    } catch (err) {
      toast({
        title: "Demo login failed",
        description:
          err instanceof Error ? err.message : "Make sure the demo data is seeded (pnpm seed:demo).",
        variant: "destructive",
      });
      setPending(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to site
        </button>

        <div className="text-center mb-10">
          <span className="inline-block px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-medium tracking-wide mb-4">
            DEMO MODE
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Explore QueueMed as…</h1>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">
            Pick a role to jump straight into a pre-populated clinic — a live queue with patients,
            appointments and data already set up. No signup required.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {personas.map((p) => {
            const Icon = p.icon;
            const isLoading = pending === p.key;
            return (
              <button
                key={p.key}
                onClick={() => enter(p)}
                disabled={!!pending}
                className="group text-left rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-lg hover:border-slate-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${p.accent} flex items-center justify-center text-white`}>
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Icon className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{p.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{p.blurb}</p>
                    <span className="inline-block mt-3 text-sm font-medium text-slate-900 group-hover:underline">
                      {isLoading ? "Signing in…" : "Enter →"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400 mt-10">
          Demo accounts use shared sample data. Anything you change can be reset by re-seeding.
        </p>
      </div>
    </div>
  );
}

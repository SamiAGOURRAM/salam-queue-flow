/**
 * QueueMed DEMO seed.
 *
 * Creates 4 one-click demo personas (working logins via the GoTrue admin API)
 * and a populated clinic for them: today's live queue with patients in various
 * states, so every screen has content for recruiters to explore.
 *
 * Idempotent: safe to re-run (users upserted, demo appointments/patients reset).
 *
 * Env:
 *   SEED_SUPABASE_URL          (default http://127.0.0.1:54321)
 *   SEED_SUPABASE_SERVICE_KEY  (or SUPABASE_SERVICE_KEY) — required
 *
 * Run:  pnpm --filter @queuemed/web run seed:demo
 */
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SEED_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SEED_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error("Missing SEED_SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_KEY). Get it from `supabase status`.");
  process.exit(1);
}

const PASSWORD = "demo1234";
const CLINIC_ID = "00000000-0000-0000-0000-00000000c201"; // Casa Family Care (from seed:local:clinics)
const DOCTOR_STAFF_ID = "00000000-0000-0000-0000-0000000d5001";
const RECEPTION_STAFF_ID = "00000000-0000-0000-0000-0000000d5002";

const personas = [
  { key: "owner", email: "demo.owner@queuemed.test", fullName: "Dr. Sofia El Amrani", role: "clinic_owner", phone: "+212600000001" },
  { key: "doctor", email: "demo.doctor@queuemed.test", fullName: "Dr. Karim Benjelloun", role: "staff", phone: "+212600000002" },
  { key: "reception", email: "demo.reception@queuemed.test", fullName: "Nadia Mansouri", role: "staff", phone: "+212600000003" },
  { key: "patient", email: "demo.patient@queuemed.test", fullName: "Mehdi Cherkaoui", role: "patient", phone: "+212600000004" },
];

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(email) {
  // listUsers is paginated; scan a few pages.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureUser(p) {
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: p.fullName, phone_number: p.phone },
  });
  if (!error && data?.user) return data.user.id;

  // Likely already exists — find it and reset the password so login is deterministic.
  const existing = await findUserByEmail(p.email);
  if (!existing) throw error || new Error(`Could not create or find user ${p.email}`);
  await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
  return existing.id;
}

function runSql(sql) {
  const ps = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
  const container = (ps.stdout || "").split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith("supabase_db_"));
  if (!container) throw new Error("No running Supabase DB container found (supabase_db_*). Is `supabase start` running?");

  const res = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: "pipe" },
  );
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) throw new Error(`psql failed with exit code ${res.status}`);
}

function buildSql(ids) {
  const owner = ids.owner;
  const doctor = ids.doctor;
  const reception = ids.reception;
  const patient = ids.patient;

  return `
BEGIN;

-- Profiles
INSERT INTO public.profiles (id, full_name, email, phone_number, city, preferred_language)
VALUES
  ('${owner}', 'Dr. Sofia El Amrani', 'demo.owner@queuemed.test', '+212600000001', 'Casablanca', 'fr'),
  ('${doctor}', 'Dr. Karim Benjelloun', 'demo.doctor@queuemed.test', '+212600000002', 'Casablanca', 'fr'),
  ('${reception}', 'Nadia Mansouri', 'demo.reception@queuemed.test', '+212600000003', 'Casablanca', 'fr'),
  ('${patient}', 'Mehdi Cherkaoui', 'demo.patient@queuemed.test', '+212600000004', 'Casablanca', 'fr')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number, city = EXCLUDED.city;

-- Roles (reset then set)
DELETE FROM public.user_roles WHERE user_id IN ('${owner}','${doctor}','${reception}','${patient}');
INSERT INTO public.user_roles (user_id, role, clinic_id) VALUES
  ('${owner}', 'clinic_owner', '${CLINIC_ID}'),
  ('${doctor}', 'staff', '${CLINIC_ID}'),
  ('${reception}', 'staff', '${CLINIC_ID}'),
  ('${patient}', 'patient', NULL);

-- Make the demo owner own the demo clinic
UPDATE public.clinics SET owner_id = '${owner}' WHERE id = '${CLINIC_ID}';

-- Clinic staff (doctor + receptionist) with fixed ids
DELETE FROM public.clinic_staff WHERE clinic_id = '${CLINIC_ID}' AND user_id IN ('${owner}','${doctor}','${reception}');
INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, specialization, is_active, average_consultation_duration) VALUES
  ('${DOCTOR_STAFF_ID}', '${CLINIC_ID}', '${doctor}', 'doctor', 'Médecine générale', true, 15),
  ('${RECEPTION_STAFF_ID}', '${CLINIC_ID}', '${reception}', 'receptionist', NULL, true, 15);

-- Today's queue (idempotent + date-relative). Single source of truth lives in
-- the refresh_demo_queue() DB function so the /demo launcher can refresh it too.
SELECT public.refresh_demo_queue();

COMMIT;
`;
}

async function main() {
  console.log(`Seeding demo personas against ${URL} ...`);
  const ids = {};
  for (const p of personas) {
    ids[p.key] = await ensureUser(p);
    console.log(`  ✓ ${p.key.padEnd(10)} ${p.email}  (${ids[p.key]})`);
  }
  console.log("Seeding relational data + today's queue ...");
  runSql(buildSql(ids));
  console.log("\n✅ Demo seeded. Logins (password: demo1234):");
  for (const p of personas) console.log(`   ${p.role.padEnd(12)} ${p.email}`);
}

main().catch((err) => {
  console.error("Demo seed failed:", err?.message || err);
  process.exit(1);
});

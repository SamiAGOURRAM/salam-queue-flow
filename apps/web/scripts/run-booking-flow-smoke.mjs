import { spawnSync } from 'node:child_process';

const smokeConfig = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
  supabasePublishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  clinicId: process.env.VITE_SMOKE_CLINIC_ID || '00000000-0000-0000-0000-00000000f101',
  ownerEmail: process.env.VITE_SMOKE_OWNER_EMAIL || 'smoke.owner.webflow+local@queuemed.test',
  ownerPassword: process.env.VITE_SMOKE_OWNER_PASSWORD || 'SmokeOwner#123',
  ownerPhone: process.env.VITE_SMOKE_OWNER_PHONE || '+212600009101',
  patientEmail: process.env.VITE_SMOKE_PATIENT_EMAIL || 'smoke.patient.webflow+local@queuemed.test',
  patientPassword: process.env.VITE_SMOKE_PATIENT_PASSWORD || 'SmokePatient#123',
  patientPhone: process.env.VITE_SMOKE_PATIENT_PHONE || '+212600009201',
  staffEmail: process.env.VITE_SMOKE_STAFF_EMAIL || 'smoke.staff.webflow+local@queuemed.test',
  staffPassword: process.env.VITE_SMOKE_STAFF_PASSWORD || 'SmokeStaff#123',
  staffPhone: process.env.VITE_SMOKE_STAFF_PHONE || '+212600009301',
};

function assertLocalSupabaseUrl(url) {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?/i.test(url);
  if (!isLocal) {
    throw new Error(
      `Local smoke test must target local Supabase. Received VITE_SUPABASE_URL=${url}`
    );
  }
}

const pnpmBinary = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result;
}

function detectSupabaseDbContainer() {
  const ps = runOrThrow('docker', ['ps', '--format', '{{.Names}}']);
  const container = ps.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('supabase_db_'));

  if (!container) {
    throw new Error('No running Supabase DB container found (expected name starting with supabase_db_)');
  }

  return container;
}

function buildCleanupSql() {
  return `
DO $$
DECLARE
  v_owner_id UUID;
  v_patient_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT id INTO v_owner_id FROM auth.users WHERE email = '${smokeConfig.ownerEmail}';
  SELECT id INTO v_patient_id FROM auth.users WHERE email = '${smokeConfig.patientEmail}';
  SELECT id INTO v_staff_id FROM auth.users WHERE email = '${smokeConfig.staffEmail}';

  DELETE FROM public.appointments WHERE clinic_id = '${smokeConfig.clinicId}';
  DELETE FROM public.staff_invitations WHERE clinic_id = '${smokeConfig.clinicId}';
  DELETE FROM public.clinic_staff WHERE clinic_id = '${smokeConfig.clinicId}';
  DELETE FROM public.user_roles WHERE clinic_id = '${smokeConfig.clinicId}';
  DELETE FROM public.clinics WHERE id = '${smokeConfig.clinicId}';

  IF v_owner_id IS NOT NULL THEN
    DELETE FROM public.patient_clinic_history WHERE patient_id = v_owner_id;
    DELETE FROM public.notifications WHERE patient_id = v_owner_id;
    DELETE FROM public.absent_patients WHERE patient_id = v_owner_id;
    DELETE FROM public.patients WHERE user_id = v_owner_id;
    DELETE FROM public.profiles WHERE id = v_owner_id;
  END IF;

  IF v_patient_id IS NOT NULL THEN
    DELETE FROM public.patient_clinic_history WHERE patient_id = v_patient_id;
    DELETE FROM public.notifications WHERE patient_id = v_patient_id;
    DELETE FROM public.absent_patients WHERE patient_id = v_patient_id;
    DELETE FROM public.patients WHERE user_id = v_patient_id;
    DELETE FROM public.profiles WHERE id = v_patient_id;
  END IF;

  IF v_staff_id IS NOT NULL THEN
    DELETE FROM public.patient_clinic_history WHERE patient_id = v_staff_id;
    DELETE FROM public.notifications WHERE patient_id = v_staff_id;
    DELETE FROM public.absent_patients WHERE patient_id = v_staff_id;
    DELETE FROM public.patients WHERE user_id = v_staff_id;
    DELETE FROM public.profiles WHERE id = v_staff_id;
  END IF;

  DELETE FROM public.patients
  WHERE phone_number_hash IN (
    public.hash_phone_number('${smokeConfig.ownerPhone}'),
    public.hash_phone_number('${smokeConfig.patientPhone}'),
    public.hash_phone_number('${smokeConfig.staffPhone}')
  );

  DELETE FROM auth.users WHERE email IN ('${smokeConfig.ownerEmail}', '${smokeConfig.patientEmail}', '${smokeConfig.staffEmail}');
END $$;
`;
}

function runCleanup(containerName) {
  const cleanupSql = buildCleanupSql();

  runOrThrow(
    'docker',
    ['exec', '-i', containerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: cleanupSql }
  );
}

function runIntegrationTest() {
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: smokeConfig.supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: smokeConfig.supabasePublishableKey,
    VITE_SMOKE_CLINIC_ID: smokeConfig.clinicId,
    VITE_SMOKE_OWNER_EMAIL: smokeConfig.ownerEmail,
    VITE_SMOKE_OWNER_PASSWORD: smokeConfig.ownerPassword,
    VITE_SMOKE_OWNER_PHONE: smokeConfig.ownerPhone,
    VITE_SMOKE_PATIENT_EMAIL: smokeConfig.patientEmail,
    VITE_SMOKE_PATIENT_PASSWORD: smokeConfig.patientPassword,
    VITE_SMOKE_PATIENT_PHONE: smokeConfig.patientPhone,
    VITE_SMOKE_STAFF_EMAIL: smokeConfig.staffEmail,
    VITE_SMOKE_STAFF_PASSWORD: smokeConfig.staffPassword,
    VITE_SMOKE_STAFF_PHONE: smokeConfig.staffPhone,
  };

  if (process.platform === 'win32') {
    runOrThrow(
      'cmd',
      ['/c', 'pnpm exec vitest run src/integration/booking-flow.integration.test.ts --config vitest.integration.config.ts'],
      { env }
    );
    return;
  }

  runOrThrow(
    pnpmBinary,
    [
      'exec',
      'vitest',
      'run',
      'src/integration/booking-flow.integration.test.ts',
      '--config',
      'vitest.integration.config.ts',
    ],
    { env }
  );
}

let containerName = '';

try {
  assertLocalSupabaseUrl(smokeConfig.supabaseUrl);

  containerName = detectSupabaseDbContainer();
  console.log(`Using Supabase DB container: ${containerName}`);

  console.log('Running pre-test cleanup...');
  runCleanup(containerName);

  console.log('Running web-layer workflow smoke tests...');
  runIntegrationTest();

  console.log('Web-layer workflow smoke tests passed.');
} finally {
  if (containerName) {
    console.log('Running post-test cleanup...');
    runCleanup(containerName);
  }
}

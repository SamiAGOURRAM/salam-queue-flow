import { spawnSync } from 'node:child_process';

const smokeConfig = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
  supabasePublishableKey:
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  clinicId: process.env.VITE_SMOKE_TEMPLATES_CLINIC_ID || '00000000-0000-0000-0000-00000000f201',
  ownerEmail:
    process.env.VITE_SMOKE_TEMPLATES_OWNER_EMAIL || 'smoke.owner.templates+local@queuemed.test',
  ownerPassword: process.env.VITE_SMOKE_TEMPLATES_OWNER_PASSWORD || 'SmokeTemplatesOwner#123',
  ownerPhone: process.env.VITE_SMOKE_TEMPLATES_OWNER_PHONE || '+212600009401',
};

function assertLocalSupabaseUrl(url) {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?/i.test(url);
  if (!isLocal) {
    throw new Error(`Local smoke test must target local Supabase. Received VITE_SUPABASE_URL=${url}`);
  }
}

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
BEGIN
  SELECT id INTO v_owner_id FROM auth.users WHERE email = '${smokeConfig.ownerEmail}';

  DELETE FROM public.medical_templates
  WHERE clinic_id = '${smokeConfig.clinicId}'
     OR created_by = v_owner_id;

  DELETE FROM public.clinic_staff WHERE clinic_id = '${smokeConfig.clinicId}';
  DELETE FROM public.user_roles WHERE clinic_id = '${smokeConfig.clinicId}';
  DELETE FROM public.clinics WHERE id = '${smokeConfig.clinicId}';

  IF v_owner_id IS NOT NULL THEN
    DELETE FROM public.profiles WHERE id = v_owner_id;
  END IF;

  DELETE FROM auth.users WHERE email = '${smokeConfig.ownerEmail}';
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
    VITE_SMOKE_TEMPLATES_CLINIC_ID: smokeConfig.clinicId,
    VITE_SMOKE_TEMPLATES_OWNER_EMAIL: smokeConfig.ownerEmail,
    VITE_SMOKE_TEMPLATES_OWNER_PASSWORD: smokeConfig.ownerPassword,
    VITE_SMOKE_TEMPLATES_OWNER_PHONE: smokeConfig.ownerPhone,
  };

  if (process.platform === 'win32') {
    runOrThrow(
      'cmd',
      [
        '/c',
        'pnpm exec vitest run src/integration/templates-flow.integration.test.ts --config vitest.integration.config.ts',
      ],
      { env }
    );
    return;
  }

  runOrThrow(
    'pnpm',
    ['exec', 'vitest', 'run', 'src/integration/templates-flow.integration.test.ts', '--config', 'vitest.integration.config.ts'],
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

  console.log('Running templates backend smoke test...');
  runIntegrationTest();

  console.log('Templates backend smoke test passed.');
} finally {
  if (containerName) {
    console.log('Running post-test cleanup...');
    runCleanup(containerName);
  }
}

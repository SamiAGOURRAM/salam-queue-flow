import { spawnSync } from 'node:child_process';

const clinicSeedConfig = {
  ownerId: '00000000-0000-0000-0000-00000000d101',
  ownerEmail: 'seed.owner.local@queuemed.test',
  ownerPhone: '+212600001101',
};

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
}

function detectSupabaseDbContainer() {
  const ps = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (ps.error || ps.status !== 0) {
    throw new Error('Unable to list Docker containers. Is Docker running?');
  }

  const container = (ps.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('supabase_db_'));

  if (!container) {
    throw new Error('No running Supabase DB container found (expected name starting with supabase_db_)');
  }

  return container;
}

function buildSeedSql() {
  return `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '${clinicSeedConfig.ownerId}') THEN
    INSERT INTO auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '${clinicSeedConfig.ownerId}',
      'authenticated',
      'authenticated',
      '${clinicSeedConfig.ownerEmail}',
      crypt('SeedOwner#123', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Seed Owner","phone_number":"${clinicSeedConfig.ownerPhone}"}'::jsonb,
      NOW(),
      NOW()
    );
  END IF;

  INSERT INTO public.clinics (
    id, owner_id, name, specialty, address, city, phone, queue_mode, settings, is_active
  ) VALUES
    (
      '00000000-0000-0000-0000-00000000c201',
      '${clinicSeedConfig.ownerId}',
      'Casa Family Care',
      'general_medicine',
      '15 Boulevard Zerktouni',
      'Casablanca',
      '+212522000201',
      'slotted',
      '{"working_hours":{"monday":{"open":"09:00","close":"18:00"},"tuesday":{"open":"09:00","close":"18:00"},"wednesday":{"open":"09:00","close":"18:00"},"thursday":{"open":"09:00","close":"18:00"},"friday":{"open":"09:00","close":"18:00"},"saturday":{"open":"09:00","close":"13:00"},"sunday":{"closed":true}},"slot_capacity":1}'::jsonb,
      true
    ),
    (
      '00000000-0000-0000-0000-00000000c202',
      '${clinicSeedConfig.ownerId}',
      'Rabat Heart Center',
      'cardiology',
      '22 Avenue Mohammed V',
      'Rabat',
      '+212537000202',
      'fluid',
      '{"working_hours":{"monday":{"open":"08:30","close":"17:30"},"tuesday":{"open":"08:30","close":"17:30"},"wednesday":{"open":"08:30","close":"17:30"},"thursday":{"open":"08:30","close":"17:30"},"friday":{"open":"08:30","close":"16:30"},"saturday":{"closed":true},"sunday":{"closed":true}},"allow_walk_ins":true}'::jsonb,
      true
    ),
    (
      '00000000-0000-0000-0000-00000000c203',
      '${clinicSeedConfig.ownerId}',
      'Marrakech Kids Clinic',
      'pediatrics',
      '7 Rue Ibn Sina',
      'Marrakech',
      '+212524000203',
      'slotted',
      '{"working_hours":{"monday":{"open":"09:00","close":"17:00"},"tuesday":{"open":"09:00","close":"17:00"},"wednesday":{"open":"09:00","close":"17:00"},"thursday":{"open":"09:00","close":"17:00"},"friday":{"open":"09:00","close":"16:00"},"saturday":{"open":"09:00","close":"12:00"},"sunday":{"closed":true}},"slot_capacity":2}'::jsonb,
      true
    )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    specialty = EXCLUDED.specialty,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    phone = EXCLUDED.phone,
    queue_mode = EXCLUDED.queue_mode,
    settings = EXCLUDED.settings,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
END $$;
`;
}

const container = detectSupabaseDbContainer();
const sql = buildSeedSql();

runOrThrow(
  'docker',
  ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
  { input: sql }
);

console.log('Local clinics seeded successfully.');

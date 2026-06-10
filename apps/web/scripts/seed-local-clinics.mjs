import { spawnSync } from 'node:child_process';

const clinicSeedConfig = {
  ownerId: '00000000-0000-0000-0000-00000000d101',
  ownerEmail: 'seed.owner.local@queuemed.test',
  ownerPhone: '+212600001101',
};

const DOCTOR_IDS = {
  casa: '00000000-0000-0000-0000-0000000d5001',
  rabat: '00000000-0000-0000-0000-0000000d5003',
  marrakech: '00000000-0000-0000-0000-0000000d5004',
};
const RECEPTION_IDS = {
  casa: '00000000-0000-0000-0000-0000000d5002',
  rabat: '00000000-0000-0000-0000-0000000d5005',
  marrakech: '00000000-0000-0000-0000-0000000d5006',
};

// Staff auth users (used as user_id in clinic_staff). These are distinct from
// the demo-persona users created by seed-demo.mjs for Casa Family Care.
const STAFF_USERS = {
  rabatDoctor:    '00000000-0000-0000-0000-00000000e201',
  rabatReception: '00000000-0000-0000-0000-00000000e202',
  marrakechDoctor:    '00000000-0000-0000-0000-00000000e203',
  marrakechReception: '00000000-0000-0000-0000-00000000e204',
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
DECLARE
  _uid uuid;
BEGIN
  -- Ensure auth users exist for all staff members (user_id is NOT NULL on clinic_staff)
  FOR _uid IN SELECT unnest(ARRAY[
    '${clinicSeedConfig.ownerId}'::uuid,
    '${STAFF_USERS.rabatDoctor}'::uuid,
    '${STAFF_USERS.rabatReception}'::uuid,
    '${STAFF_USERS.marrakechDoctor}'::uuid,
    '${STAFF_USERS.marrakechReception}'::uuid
  ]) LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _uid) THEN
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES (
        _uid,
        'authenticated',
        'authenticated',
        'seed.staff.' || _uid::text || '@queuemed.test',
        crypt('SeedStaff#123', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Seed Staff"}'::jsonb,
        NOW(),
        NOW()
      );
    END IF;
  END LOOP;

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
      '{"working_hours":{"monday":{"open":"09:00","close":"18:00"},"tuesday":{"open":"09:00","close":"18:00"},"wednesday":{"open":"09:00","close":"18:00"},"thursday":{"open":"09:00","close":"18:00"},"friday":{"open":"09:00","close":"18:00"},"saturday":{"open":"09:00","close":"13:00"},"sunday":{"closed":true}},"appointment_types":[{"name":"consultation","label":"General Consultation","duration":30,"price":200},{"name":"follow_up","label":"Follow-up","duration":15,"price":150},{"name":"urgent","label":"Urgent Visit","duration":20,"price":300}],"slot_capacity_per_staff":1}'::jsonb,
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
      '{"working_hours":{"monday":{"open":"08:30","close":"17:30"},"tuesday":{"open":"08:30","close":"17:30"},"wednesday":{"open":"08:30","close":"17:30"},"thursday":{"open":"08:30","close":"17:30"},"friday":{"open":"08:30","close":"16:30"},"saturday":{"closed":true},"sunday":{"closed":true}},"appointment_types":[{"name":"consultation","label":"Cardiology Consultation","duration":45,"price":350},{"name":"follow_up","label":"Follow-up","duration":20,"price":200},{"name":"urgent","label":"Urgent Visit","duration":30,"price":500}],"allow_walk_ins":true}'::jsonb,
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
      '{"working_hours":{"monday":{"open":"09:00","close":"17:00"},"tuesday":{"open":"09:00","close":"17:00"},"wednesday":{"open":"09:00","close":"17:00"},"thursday":{"open":"09:00","close":"17:00"},"friday":{"open":"09:00","close":"16:00"},"saturday":{"open":"09:00","close":"12:00"},"sunday":{"closed":true}},"appointment_types":[{"name":"consultation","label":"Pediatric Consultation","duration":20,"price":250},{"name":"follow_up","label":"Follow-up","duration":15,"price":150},{"name":"vaccination","label":"Vaccination","duration":10,"price":100}],"slot_capacity_per_staff":2}'::jsonb,
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

  -- Profile names for staff users (visible in patient booking flow).
  -- phone_number has no default so must be provided.
  INSERT INTO public.profiles (id, full_name, phone_number) VALUES
    ('${STAFF_USERS.rabatDoctor}', 'Dr. Youssef El Fassi', '+212600000501'),
    ('${STAFF_USERS.rabatReception}', 'Samira Benali', '+212600000502'),
    ('${STAFF_USERS.marrakechDoctor}', 'Dr. Aïcha El Mansouri', '+212600000503'),
    ('${STAFF_USERS.marrakechReception}', 'Hicham Ouazzani', '+212600000504')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Clinic staff: doctor + receptionist per clinic (idempotent).
  -- Casa Family Care doctor/receptionist are managed by seed-demo.mjs, so
  -- we ON CONFLICT skip those rows (the demo seed overwrites them with real
  -- auth user links).
  INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, specialization, is_active, average_consultation_duration)
  VALUES
    ('${DOCTOR_IDS.casa}',   '00000000-0000-0000-0000-00000000c201', '${clinicSeedConfig.ownerId}', 'doctor', 'Médecine générale', true, 30),
    ('${RECEPTION_IDS.casa}','00000000-0000-0000-0000-00000000c201', '${clinicSeedConfig.ownerId}', 'receptionist', NULL, true, NULL),
    ('${DOCTOR_IDS.rabat}',  '00000000-0000-0000-0000-00000000c202', '${STAFF_USERS.rabatDoctor}', 'doctor', 'Cardiologie', true, 45),
    ('${RECEPTION_IDS.rabat}','00000000-0000-0000-0000-00000000c202', '${STAFF_USERS.rabatReception}', 'receptionist', NULL, true, NULL),
    ('${DOCTOR_IDS.marrakech}','00000000-0000-0000-0000-00000000c203', '${STAFF_USERS.marrakechDoctor}', 'doctor', 'Pédiatrie', true, 20),
    ('${RECEPTION_IDS.marrakech}','00000000-0000-0000-0000-00000000c203', '${STAFF_USERS.marrakechReception}', 'receptionist', NULL, true, NULL)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    specialization = EXCLUDED.specialization,
    is_active = EXCLUDED.is_active,
    average_consultation_duration = EXCLUDED.average_consultation_duration;
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

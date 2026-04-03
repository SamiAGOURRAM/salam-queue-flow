-- Canonicalize clinic settings schema and backfill missing detail fields.
-- Target contract uses snake_case keys inside clinics.settings JSONB.

UPDATE public.clinics c
SET settings = jsonb_strip_nulls(
  (
    COALESCE(c.settings, '{}'::jsonb)
    - 'workingHours'
    - 'allowWalkIns'
    - 'averageAppointmentDuration'
    - 'bufferTime'
    - 'maxQueueSize'
    - 'paymentMethods'
    - 'appointmentTypes'
    - 'requiresAppointment'
  )
  || jsonb_build_object(
    'working_hours', COALESCE(
      c.settings->'working_hours',
      c.settings->'workingHours',
      '{
        "monday": {"open": "09:00", "close": "18:00", "closed": false},
        "tuesday": {"open": "09:00", "close": "18:00", "closed": false},
        "wednesday": {"open": "09:00", "close": "18:00", "closed": false},
        "thursday": {"open": "09:00", "close": "18:00", "closed": false},
        "friday": {"open": "09:00", "close": "18:00", "closed": false},
        "saturday": {"open": "09:00", "close": "13:00", "closed": false},
        "sunday": {"closed": true}
      }'::jsonb
    ),
    'allow_walk_ins', COALESCE(c.settings->'allow_walk_ins', c.settings->'allowWalkIns', to_jsonb(true)),
    'average_appointment_duration', COALESCE(
      c.settings->'average_appointment_duration',
      c.settings->'averageAppointmentDuration',
      to_jsonb(15)
    ),
    'buffer_time', COALESCE(c.settings->'buffer_time', c.settings->'bufferTime', to_jsonb(5)),
    'max_queue_size', COALESCE(c.settings->'max_queue_size', c.settings->'maxQueueSize', to_jsonb(50)),
    'payment_methods', COALESCE(
      c.settings->'payment_methods',
      c.settings->'paymentMethods',
      '{"cash": true, "card": false, "insurance": false, "online": false}'::jsonb
    ),
    'appointment_types', COALESCE(
      c.settings->'appointment_types',
      c.settings->'appointmentTypes',
      '[
        {"name": "consultation", "label": "Consultation", "duration": 15},
        {"name": "follow_up", "label": "Follow-up", "duration": 10},
        {"name": "procedure", "label": "Procedure", "duration": 30},
        {"name": "emergency", "label": "Emergency", "duration": 20}
      ]'::jsonb
    ),
    'requires_appointment', COALESCE(
      c.settings->'requires_appointment',
      c.settings->'requiresAppointment',
      to_jsonb(false)
    )
  )
);

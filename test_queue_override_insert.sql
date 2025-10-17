-- Test if the simplified policy works for INSERT

BEGIN;

-- Set authenticated user context
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claim.sub = '6b35a6de-e5de-4f6c-b544-76318b46aae8';

-- Try to INSERT into queue_overrides (simulating what the app does)
INSERT INTO queue_overrides (
    clinic_id,
    appointment_id,
    action_type,
    performed_by,
    reason,
    previous_position,
    new_position
)
VALUES (
    '33b67ced-ffd3-4a78-9180-d264fd089a7b',
    '669cbf83-0581-4174-9154-a4a5c2a70df6',
    'call_next',
    '6b35a6de-e5de-4f6c-b544-76318b46aae8',
    'Test call next patient',
    1,
    null
)
RETURNING *;

ROLLBACK;

-- Reset
RESET role;

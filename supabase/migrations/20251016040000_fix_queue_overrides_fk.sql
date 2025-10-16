-- Fix queue_overrides foreign key to profiles
-- Add FK constraint from performed_by to profiles(id)

-- First, ensure all performed_by values exist in profiles
-- (They should since profiles.id references auth.users(id))

-- Add foreign key constraint to profiles
ALTER TABLE queue_overrides
ADD CONSTRAINT queue_overrides_performed_by_fkey 
FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Queue overrides FK to profiles added successfully';
END $$;

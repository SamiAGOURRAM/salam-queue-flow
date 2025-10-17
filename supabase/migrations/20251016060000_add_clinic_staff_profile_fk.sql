-- Add foreign key from clinic_staff.user_id to profiles.id
-- This allows Supabase to understand the relationship for JOINs

-- Add foreign key constraint
ALTER TABLE clinic_staff
ADD CONSTRAINT clinic_staff_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Clinic staff FK to profiles added successfully';
END $$;

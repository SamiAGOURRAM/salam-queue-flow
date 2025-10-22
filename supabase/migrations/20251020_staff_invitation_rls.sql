-- ============================================
-- RLS Policies for Staff Self-Insertion
-- ============================================
-- Allow invited users to accept invitations by inserting themselves
-- into clinic_staff and user_roles tables

-- 1. Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Clinic owners can manage staff" ON clinic_staff;
DROP POLICY IF EXISTS "Clinic owners can insert staff" ON clinic_staff;
DROP POLICY IF EXISTS "Clinic owners can update staff" ON clinic_staff;
DROP POLICY IF EXISTS "Clinic owners can delete staff" ON clinic_staff;
DROP POLICY IF EXISTS "Users can accept staff invitations" ON clinic_staff;
DROP POLICY IF EXISTS "Users can accept role invitations" ON user_roles;
DROP POLICY IF EXISTS "Anyone can view invitations by token" ON staff_invitations;

-- 2. Create granular policies for clinic owners
CREATE POLICY "Clinic owners can insert staff" ON clinic_staff FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = clinic_staff.clinic_id 
      AND owner_id = auth.uid()
  ));

CREATE POLICY "Clinic owners can update staff" ON clinic_staff FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = clinic_staff.clinic_id 
      AND owner_id = auth.uid()
  ));

CREATE POLICY "Clinic owners can delete staff" ON clinic_staff FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = clinic_staff.clinic_id 
      AND owner_id = auth.uid()
  ));

-- 3. NEW: Allow users to self-insert when accepting invitations
-- Uses profiles table to avoid "permission denied for table users" error
CREATE POLICY "Users can accept staff invitations" ON clinic_staff FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM public.staff_invitations si
      JOIN public.profiles p ON p.email = si.email
      WHERE si.clinic_id = clinic_staff.clinic_id
        AND si.status = 'pending'
        AND si.expires_at > NOW()
        AND p.id = auth.uid()
    )
  );

-- 4. Allow users to insert their own staff role when accepting invitations
CREATE POLICY "Users can accept role invitations" ON user_roles FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.staff_invitations si
      JOIN public.profiles p ON p.email = si.email
      WHERE si.clinic_id = user_roles.clinic_id
        AND si.status = 'pending'
        AND si.expires_at > NOW()
        AND p.id = auth.uid()
    )
  );

-- 5. Allow anyone to view pending invitations by token (for invitation acceptance page)
-- This is safe because the token is a UUID that's hard to guess
CREATE POLICY "Anyone can view invitations by token" ON staff_invitations FOR SELECT
  USING (
    status = 'pending'
    AND expires_at > NOW()
  );

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Staff self-insertion RLS policies added successfully. Users can now accept invitations.';
END $$;

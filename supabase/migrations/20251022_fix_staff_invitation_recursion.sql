-- ============================================
-- Fix Infinite Recursion in Staff Invitation Policies
-- ============================================
-- The previous policy caused infinite recursion because it referenced
-- clinic_staff.clinic_id within a policy ON clinic_staff.
-- This migration simplifies the policy to avoid the recursion.

-- 1. Drop the problematic policy
DROP POLICY IF EXISTS "Users can accept staff invitations" ON clinic_staff;

-- 2. Create a policy that avoids recursion by NOT referencing clinic_staff columns
-- Instead, we create a security definer function that can be called in the policy
CREATE OR REPLACE FUNCTION public.can_user_accept_invitation(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.staff_invitations si
    JOIN public.profiles p ON p.email = si.email
    WHERE p.id = p_user_id
      AND si.clinic_id = p_clinic_id
      AND si.status = 'pending'
      AND si.expires_at > NOW()
  );
END;
$$;

-- 3. Now create the policy using the function (no recursion!)
CREATE POLICY "Users can accept staff invitations" ON clinic_staff FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND can_user_accept_invitation(auth.uid(), clinic_id)
  );

-- 4. Create similar function for user_roles
-- Note: role column is of type app_role (enum), so we accept TEXT and cast it
CREATE OR REPLACE FUNCTION public.can_user_accept_role(
  p_user_id UUID,
  p_clinic_id UUID,
  p_role app_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_role = 'staff'::app_role AND EXISTS (
    SELECT 1 
    FROM public.staff_invitations si
    JOIN public.profiles p ON p.email = si.email
    WHERE p.id = p_user_id
      AND si.clinic_id = p_clinic_id
      AND si.status = 'pending'
      AND si.expires_at > NOW()
  );
END;
$$;

-- 5. Drop and recreate user_roles policy
DROP POLICY IF EXISTS "Users can accept role invitations" ON user_roles;

CREATE POLICY "Users can accept role invitations" ON user_roles FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND can_user_accept_role(auth.uid(), clinic_id, role)
  );

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Fixed infinite recursion in staff invitation policies. Users can now accept invitations without recursion errors.';
END $$;

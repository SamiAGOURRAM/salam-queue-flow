-- Create staff invitations table
CREATE TABLE public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'receptionist',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invitation_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

-- Clinic owners can view their clinic's invitations
CREATE POLICY "Clinic owners can view invitations"
ON public.staff_invitations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clinics
    WHERE clinics.id = staff_invitations.clinic_id
    AND clinics.owner_id = auth.uid()
  )
);

-- Clinic owners can create invitations
CREATE POLICY "Clinic owners can create invitations"
ON public.staff_invitations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinics
    WHERE clinics.id = staff_invitations.clinic_id
    AND clinics.owner_id = auth.uid()
  )
);

-- Clinic owners can update their invitations
CREATE POLICY "Clinic owners can update invitations"
ON public.staff_invitations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.clinics
    WHERE clinics.id = staff_invitations.clinic_id
    AND clinics.owner_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_staff_invitations_updated_at
BEFORE UPDATE ON public.staff_invitations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
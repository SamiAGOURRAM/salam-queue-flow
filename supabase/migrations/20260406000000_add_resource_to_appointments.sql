-- P2: Attach optional clinic resources to appointments.
-- A resource assignment is represented directly on the appointment row.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES public.clinic_resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_resource_id
  ON public.appointments (resource_id)
  WHERE resource_id IS NOT NULL;

-- Hot-path index for occupancy checks used by queue call-next assignment.
CREATE INDEX IF NOT EXISTS idx_appointments_occupied_resources
  ON public.appointments (clinic_id, appointment_date, resource_id)
  WHERE status = 'in_progress' AND resource_id IS NOT NULL;

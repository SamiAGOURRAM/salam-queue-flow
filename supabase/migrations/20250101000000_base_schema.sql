-- Migration: Base Schema
-- Description: Creates all foundational tables, enums, and functions
-- This reconstructs the base schema that was originally created in the hosted Supabase dashboard

-- =====================================================
-- 1. CREATE CUSTOM ENUMS
-- =====================================================

CREATE TYPE public.app_role AS ENUM ('super_admin', 'clinic_owner', 'staff', 'patient');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled');
CREATE TYPE public.appointment_type AS ENUM ('consultation', 'follow_up', 'emergency', 'procedure', 'vaccination', 'screening');
CREATE TYPE public.notification_channel AS ENUM ('sms', 'whatsapp', 'email', 'push');
CREATE TYPE public.notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed');
CREATE TYPE public.notification_type AS ENUM ('appointment_confirmed', 'position_update', 'almost_your_turn', 'your_turn', 'appointment_delayed', 'appointment_cancelled');
CREATE TYPE public.practice_type AS ENUM ('solo_practice', 'group_clinic', 'hospital');
CREATE TYPE public.skip_reason_type AS ENUM ('patient_absent', 'patient_present', 'emergency_case', 'doctor_preference', 'late_arrival', 'technical_issue', 'other');

-- =====================================================
-- 2. CREATE PROFILES TABLE (extends auth.users)
-- =====================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT NOT NULL,
  city TEXT,
  preferred_language TEXT DEFAULT 'fr',
  notification_preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. CREATE CLINICS TABLE
-- =====================================================

CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  specialty TEXT NOT NULL,
  practice_type public.practice_type DEFAULT 'solo_practice',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  logo_url TEXT,
  settings JSONB,
  subscription_tier TEXT DEFAULT 'free',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. CREATE CLINIC_STAFF TABLE
-- =====================================================

CREATE TABLE public.clinic_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'doctor',
  specialization TEXT,
  license_number TEXT,
  working_hours JSONB,
  average_consultation_duration INT DEFAULT 15,
  patients_per_day_avg INT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, user_id)
);

-- =====================================================
-- 5. CREATE APPOINTMENTS TABLE
-- =====================================================

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.clinic_staff(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  scheduled_time TEXT,
  time_slot TEXT,
  appointment_type public.appointment_type NOT NULL DEFAULT 'consultation',
  status public.appointment_status DEFAULT 'scheduled',
  reason_for_visit TEXT,
  notes TEXT,
  queue_position INT,
  original_queue_position INT,
  predicted_wait_time INT,
  predicted_start_time TIMESTAMPTZ,
  prediction_confidence NUMERIC,
  last_prediction_update TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  actual_duration INT,
  is_walk_in BOOLEAN DEFAULT false,
  is_first_visit BOOLEAN,
  is_present BOOLEAN DEFAULT true,
  is_holiday BOOLEAN DEFAULT false,
  day_of_week INT,
  booking_method TEXT DEFAULT 'online',
  booked_by UUID,
  override_by UUID,
  skip_count INT DEFAULT 0,
  skip_reason public.skip_reason_type,
  late_by_minutes INT,
  marked_absent_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  notification_count INT DEFAULT 0,
  last_notification_sent_at TIMESTAMPTZ,
  estimated_duration INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. CREATE USER_ROLES TABLE (RBAC)
-- =====================================================

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_user_roles_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id)
);

-- =====================================================
-- 7. CREATE STAFF_INVITATIONS TABLE
-- =====================================================

CREATE TABLE public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  role TEXT DEFAULT 'doctor',
  invitation_token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. CREATE ABSENT_PATIENTS TABLE
-- =====================================================

CREATE TABLE public.absent_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  marked_absent_at TIMESTAMPTZ DEFAULT NOW(),
  grace_period_ends_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  new_position INT,
  notification_sent BOOLEAN DEFAULT false,
  auto_cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. CREATE QUEUE_OVERRIDES TABLE
-- =====================================================

CREATE TABLE public.queue_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  previous_position INT,
  new_position INT,
  reason TEXT,
  skipped_patient_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. CREATE QUEUE_SNAPSHOTS TABLE
-- =====================================================

CREATE TABLE public.queue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  snapshot_time TEXT NOT NULL,
  total_waiting INT,
  total_in_progress INT,
  total_completed_today INT,
  average_wait_time NUMERIC,
  longest_wait_time INT,
  active_staff_count INT,
  staff_utilization NUMERIC,
  current_delay_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. CREATE APPOINTMENT_METRICS TABLE
-- =====================================================

CREATE TABLE public.appointment_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  predicted_wait_time INT,
  actual_wait_time INT,
  prediction_error NUMERIC,
  absolute_error NUMERIC,
  confidence_score NUMERIC,
  model_version TEXT,
  features JSONB NOT NULL DEFAULT '{}',
  queue_position INT,
  queue_length INT,
  staff_count INT,
  average_service_time NUMERIC,
  current_delay_minutes INT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 12. CREATE NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  type public.notification_type NOT NULL,
  channel public.notification_channel NOT NULL,
  recipient TEXT NOT NULL,
  message_template TEXT NOT NULL,
  message_variables JSONB,
  rendered_message TEXT,
  status public.notification_status DEFAULT 'pending',
  priority INT DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  cost_estimate NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 13. CREATE NOTIFICATION_TEMPLATES TABLE
-- =====================================================

CREATE TABLE public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr',
  template_text TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 14. CREATE NOTIFICATION_ANALYTICS TABLE
-- =====================================================

CREATE TABLE public.notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  type public.notification_type NOT NULL,
  channel public.notification_channel NOT NULL,
  date DATE NOT NULL,
  was_delivered BOOLEAN NOT NULL DEFAULT false,
  delivery_time_seconds NUMERIC,
  cost_actual NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 15. CREATE CLINIC_NOTIFICATION_BUDGETS TABLE
-- =====================================================

CREATE TABLE public.clinic_notification_budgets (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  monthly_sms_limit INT DEFAULT 500,
  monthly_budget_amount NUMERIC DEFAULT 0,
  current_month_sms_count INT DEFAULT 0,
  current_month_spend NUMERIC DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  alert_threshold NUMERIC DEFAULT 0.8,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 16. CREATE PATIENT_CLINIC_HISTORY TABLE
-- =====================================================

CREATE TABLE public.patient_clinic_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  total_visits INT DEFAULT 0,
  completed_visits INT DEFAULT 0,
  no_show_count INT DEFAULT 0,
  cancellation_count INT DEFAULT 0,
  last_visit_date DATE,
  last_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  preferred_staff_id UUID REFERENCES public.clinic_staff(id) ON DELETE SET NULL,
  preferred_time_slot TEXT,
  preferred_day_of_week INT,
  average_actual_duration NUMERIC,
  punctuality_score NUMERIC DEFAULT 1.0,
  reliability_score NUMERIC DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, clinic_id)
);

-- =====================================================
-- 17. CREATE AUDIT_LOGS TABLE
-- =====================================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 18. CREATE INDEXES
-- =====================================================

CREATE INDEX idx_appointments_clinic_date ON public.appointments(clinic_id, appointment_date);
CREATE INDEX idx_appointments_patient_id ON public.appointments(patient_id, appointment_date DESC);
CREATE INDEX idx_appointments_staff_id ON public.appointments(staff_id, appointment_date DESC);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_clinics_owner_id ON public.clinics(owner_id);
CREATE INDEX idx_clinics_city ON public.clinics(city);
CREATE INDEX idx_clinic_staff_clinic_id ON public.clinic_staff(clinic_id);
CREATE INDEX idx_clinic_staff_user_id ON public.clinic_staff(user_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_clinic_id ON public.user_roles(clinic_id);
CREATE INDEX idx_absent_patients_clinic_id ON public.absent_patients(clinic_id);
CREATE INDEX idx_absent_patients_appointment_id ON public.absent_patients(appointment_id);
CREATE INDEX idx_queue_snapshots_clinic_date ON public.queue_snapshots(clinic_id, snapshot_date);
CREATE INDEX idx_notifications_patient_id ON public.notifications(patient_id);
CREATE INDEX idx_notifications_clinic_id ON public.notifications(clinic_id);
CREATE INDEX idx_audit_logs_clinic_id ON public.audit_logs(clinic_id);
CREATE INDEX idx_staff_invitations_clinic_id ON public.staff_invitations(clinic_id);
CREATE INDEX idx_staff_invitations_token ON public.staff_invitations(invitation_token);

-- =====================================================
-- 19. CREATE HELPER FUNCTIONS
-- =====================================================

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- has_clinic_role function
CREATE OR REPLACE FUNCTION public.has_clinic_role(_clinic_id UUID, _role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND clinic_id = _clinic_id
  );
END;
$$;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger: auto-create profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clinic_staff_updated_at BEFORE UPDATE ON public.clinic_staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 20. ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absent_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_notification_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinic_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 21. RLS POLICIES
-- =====================================================

-- PROFILES: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- CLINICS: public read, owners can modify
CREATE POLICY "Anyone can view active clinics" ON public.clinics FOR SELECT USING (is_active = true);
CREATE POLICY "Owners can insert clinics" ON public.clinics FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own clinics" ON public.clinics FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete own clinics" ON public.clinics FOR DELETE USING (auth.uid() = owner_id);

-- CLINIC_STAFF: clinic members can view, owners can manage
CREATE POLICY "Staff can view own clinic staff" ON public.clinic_staff FOR SELECT USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid())
  OR user_id = auth.uid()
);
CREATE POLICY "Clinic owners can manage staff" ON public.clinic_staff FOR INSERT WITH CHECK (
  clinic_id IN (SELECT id FROM public.clinics WHERE owner_id = auth.uid())
);
CREATE POLICY "Clinic owners can update staff" ON public.clinic_staff FOR UPDATE USING (
  clinic_id IN (SELECT id FROM public.clinics WHERE owner_id = auth.uid())
);
CREATE POLICY "Clinic owners can delete staff" ON public.clinic_staff FOR DELETE USING (
  clinic_id IN (SELECT id FROM public.clinics WHERE owner_id = auth.uid())
);

-- APPOINTMENTS: patients see own, staff see clinic's
CREATE POLICY "Patients can view own appointments" ON public.appointments FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "Staff can view clinic appointments" ON public.appointments FOR SELECT USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);
CREATE POLICY "Patients can create appointments" ON public.appointments FOR INSERT WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Staff can update clinic appointments" ON public.appointments FOR UPDATE USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);
CREATE POLICY "Patients can update own appointments" ON public.appointments FOR UPDATE USING (patient_id = auth.uid());

-- USER_ROLES: users see own roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role can manage roles" ON public.user_roles FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- STAFF_INVITATIONS: clinic owners can manage, anyone with token can view
CREATE POLICY "Clinic owners can manage invitations" ON public.staff_invitations FOR ALL USING (
  clinic_id IN (SELECT id FROM public.clinics WHERE owner_id = auth.uid())
);
CREATE POLICY "Anyone can view invitation by token" ON public.staff_invitations FOR SELECT USING (true);

-- NOTIFICATIONS: patients see own
CREATE POLICY "Patients can view own notifications" ON public.notifications FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "Staff can manage clinic notifications" ON public.notifications FOR ALL USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);

-- QUEUE_SNAPSHOTS: clinic staff can view/insert
CREATE POLICY "Staff can view clinic snapshots" ON public.queue_snapshots FOR SELECT USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);
CREATE POLICY "Staff can insert snapshots" ON public.queue_snapshots FOR INSERT WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);

-- APPOINTMENT_METRICS: clinic staff can view/insert
CREATE POLICY "Staff can view clinic metrics" ON public.appointment_metrics FOR SELECT USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);
CREATE POLICY "Staff can insert metrics" ON public.appointment_metrics FOR INSERT WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);

-- AUDIT_LOGS: clinic owners can view
CREATE POLICY "Clinic owners can view audit logs" ON public.audit_logs FOR SELECT USING (
  clinic_id IN (SELECT id FROM public.clinics WHERE owner_id = auth.uid())
);
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- PATIENT_CLINIC_HISTORY: patients see own, staff see clinic's
CREATE POLICY "Patients can view own history" ON public.patient_clinic_history FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "Staff can view clinic history" ON public.patient_clinic_history FOR SELECT USING (
  clinic_id IN (SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('clinic_owner', 'staff'))
);

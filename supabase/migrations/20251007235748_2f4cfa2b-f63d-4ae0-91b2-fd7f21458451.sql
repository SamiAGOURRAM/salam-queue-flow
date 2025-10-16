-- =============================================
-- QueueMed Database Schema
-- Production-ready, ML-optimized queue management
-- =============================================

-- 1. ENUMS & TYPES
-- =============================================

CREATE TYPE practice_type AS ENUM ('solo_practice', 'group_clinic', 'hospital');
CREATE TYPE app_role AS ENUM ('super_admin', 'clinic_owner', 'staff', 'patient');
CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'waiting', 'in_progress', 'completed', 
  'cancelled', 'no_show', 'rescheduled'
);
CREATE TYPE appointment_type AS ENUM (
  'consultation', 'follow_up', 'emergency', 
  'procedure', 'vaccination', 'screening'
);
CREATE TYPE notification_channel AS ENUM ('sms', 'whatsapp', 'email', 'push');
CREATE TYPE notification_type AS ENUM (
  'appointment_confirmed', 'position_update', 'almost_your_turn',
  'your_turn', 'appointment_delayed', 'appointment_cancelled'
);
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- 2. USER MANAGEMENT
-- =============================================

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  preferred_language TEXT DEFAULT 'ar',
  notification_preferences JSONB DEFAULT '{"sms": true, "whatsapp": false, "email": false, "push": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone_number, full_name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- User roles table
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  clinic_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role, clinic_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_clinic ON user_roles(clinic_id);

-- Security functions
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role) 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = _role
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION has_clinic_role(_user_id UUID, _clinic_id UUID, _role app_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
      AND clinic_id = _clinic_id
      AND role = _role
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- 3. CLINIC MANAGEMENT
-- =============================================

CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  practice_type practice_type NOT NULL DEFAULT 'solo_practice',
  specialty TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  logo_url TEXT,
  settings JSONB DEFAULT '{"working_hours": {"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "13:00"}, "sunday": {"closed": true}}, "average_appointment_duration": 15, "buffer_time": 5, "max_queue_size": 50, "requires_appointment": false, "allow_walk_ins": true}'::jsonb,
  subscription_tier TEXT DEFAULT 'free',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clinics_owner ON clinics(owner_id);
CREATE INDEX idx_clinics_city ON clinics(city);
CREATE INDEX idx_clinics_specialty ON clinics(specialty);

-- Clinic staff table
CREATE TABLE clinic_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  specialization TEXT,
  license_number TEXT,
  working_hours JSONB DEFAULT '{"monday": {"available": true, "slots": [{"start": "09:00", "end": "17:00"}]}, "tuesday": {"available": true, "slots": [{"start": "09:00", "end": "17:00"}]}, "wednesday": {"available": true, "slots": [{"start": "09:00", "end": "17:00"}]}, "thursday": {"available": true, "slots": [{"start": "09:00", "end": "17:00"}]}, "friday": {"available": true, "slots": [{"start": "09:00", "end": "17:00"}]}, "saturday": {"available": true, "slots": [{"start": "09:00", "end": "13:00"}]}, "sunday": {"available": false}}'::jsonb,
  average_consultation_duration INTEGER,
  patients_per_day_avg FLOAT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, user_id)
);

CREATE INDEX idx_clinic_staff_clinic_role ON clinic_staff(clinic_id, role);
CREATE INDEX idx_clinic_staff_user ON clinic_staff(user_id);

-- Add foreign key after clinic_staff is created
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_clinic 
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;

-- 4. APPOINTMENTS & QUEUE
-- =============================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES clinic_staff(id) NOT NULL,
  booked_by UUID REFERENCES auth.users(id),
  booking_method TEXT DEFAULT 'patient_app',
  appointment_date DATE NOT NULL,
  scheduled_time TIME,
  is_walk_in BOOLEAN DEFAULT false,
  queue_position INTEGER,
  checked_in_at TIMESTAMPTZ,
  appointment_type appointment_type NOT NULL,
  estimated_duration INTEGER DEFAULT 15,
  complexity_score INTEGER CHECK (complexity_score BETWEEN 1 AND 5),
  is_first_visit BOOLEAN DEFAULT false,
  requires_preparation BOOLEAN DEFAULT false,
  day_of_week INTEGER,
  is_holiday BOOLEAN DEFAULT false,
  time_slot TEXT,
  status appointment_status DEFAULT 'scheduled',
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  actual_duration INTEGER,
  predicted_wait_time INTEGER,
  predicted_start_time TIMESTAMPTZ,
  prediction_confidence FLOAT,
  last_prediction_update TIMESTAMPTZ,
  last_notification_sent_at TIMESTAMPTZ,
  notification_count INTEGER DEFAULT 0,
  patient_arrival_time TIMESTAMPTZ,
  late_by_minutes INTEGER,
  reason_for_visit TEXT,
  notes TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_clinic_date_status ON appointments(clinic_id, appointment_date, status);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_staff_date ON appointments(staff_id, appointment_date);
CREATE INDEX idx_appointments_queue_active ON appointments(clinic_id, appointment_date, queue_position) 
  WHERE status IN ('scheduled', 'waiting', 'in_progress');

-- Auto-calculate appointment features
CREATE OR REPLACE FUNCTION calculate_appointment_features() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.day_of_week := EXTRACT(ISODOW FROM NEW.appointment_date);
  
  IF NEW.scheduled_time IS NOT NULL THEN
    NEW.time_slot := CASE
      WHEN NEW.scheduled_time < '12:00'::TIME THEN 'morning'
      WHEN NEW.scheduled_time < '17:00'::TIME THEN 'afternoon'
      ELSE 'evening'
    END;
  END IF;
  
  IF NEW.checked_in_at IS NOT NULL AND (OLD IS NULL OR OLD.checked_in_at IS NULL) THEN
    IF NEW.scheduled_time IS NOT NULL THEN
      NEW.late_by_minutes := EXTRACT(EPOCH FROM (
        NEW.checked_in_at - (NEW.appointment_date + NEW.scheduled_time)
      ))::INTEGER / 60;
    END IF;
  END IF;
  
  IF NEW.status = 'completed' AND NEW.actual_start_time IS NOT NULL AND NEW.actual_end_time IS NOT NULL THEN
    NEW.actual_duration := EXTRACT(EPOCH FROM (NEW.actual_end_time - NEW.actual_start_time))::INTEGER / 60;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_appointment_features
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION calculate_appointment_features();

-- 5. ML TRAINING DATA
-- =============================================

CREATE TABLE appointment_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  features JSONB NOT NULL,
  predicted_wait_time INTEGER,
  actual_wait_time INTEGER,
  prediction_error INTEGER,
  absolute_error INTEGER,
  queue_length INTEGER,
  queue_position INTEGER,
  average_service_time INTEGER,
  current_delay_minutes INTEGER,
  staff_count INTEGER,
  model_version TEXT DEFAULT 'baseline_v1',
  confidence_score FLOAT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointment_metrics_clinic_date ON appointment_metrics(clinic_id, recorded_at);
CREATE INDEX idx_appointment_metrics_model ON appointment_metrics(model_version);

CREATE TABLE patient_clinic_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  total_visits INTEGER DEFAULT 0,
  completed_visits INTEGER DEFAULT 0,
  no_show_count INTEGER DEFAULT 0,
  cancellation_count INTEGER DEFAULT 0,
  average_actual_duration INTEGER,
  punctuality_score FLOAT,
  reliability_score FLOAT,
  preferred_time_slot TEXT,
  preferred_day_of_week INTEGER,
  preferred_staff_id UUID REFERENCES clinic_staff(id),
  last_visit_date DATE,
  last_appointment_id UUID REFERENCES appointments(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, clinic_id)
);

CREATE INDEX idx_patient_history_patient ON patient_clinic_history(patient_id);
CREATE INDEX idx_patient_history_clinic ON patient_clinic_history(clinic_id);

-- Update patient history on appointment changes
CREATE OR REPLACE FUNCTION update_patient_history() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.patient_clinic_history (patient_id, clinic_id, total_visits)
  VALUES (NEW.patient_id, NEW.clinic_id, 0)
  ON CONFLICT (patient_id, clinic_id) DO NOTHING;
  
  IF NEW.status IN ('completed', 'no_show', 'cancelled') AND 
     (OLD IS NULL OR OLD.status NOT IN ('completed', 'no_show', 'cancelled')) THEN
    
    UPDATE public.patient_clinic_history SET
      total_visits = total_visits + 1,
      completed_visits = CASE WHEN NEW.status = 'completed' THEN completed_visits + 1 ELSE completed_visits END,
      no_show_count = CASE WHEN NEW.status = 'no_show' THEN no_show_count + 1 ELSE no_show_count END,
      cancellation_count = CASE WHEN NEW.status = 'cancelled' THEN cancellation_count + 1 ELSE cancellation_count END,
      last_visit_date = NEW.appointment_date,
      last_appointment_id = NEW.id,
      updated_at = NOW()
    WHERE patient_id = NEW.patient_id AND clinic_id = NEW.clinic_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_appointment_status_change
  AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_patient_history();

-- 6. NOTIFICATIONS
-- =============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  channel notification_channel NOT NULL,
  type notification_type NOT NULL,
  status notification_status DEFAULT 'pending',
  message_template TEXT NOT NULL,
  message_variables JSONB,
  rendered_message TEXT,
  recipient TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  priority INTEGER DEFAULT 5,
  cost_estimate DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_status_scheduled ON notifications(status, scheduled_for);
CREATE INDEX idx_notifications_appointment ON notifications(appointment_id);
CREATE INDEX idx_notifications_patient_channel ON notifications(patient_id, channel);

CREATE TABLE notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  channel notification_channel NOT NULL,
  type notification_type NOT NULL,
  was_delivered BOOLEAN NOT NULL,
  delivery_time_seconds INTEGER,
  cost_actual DECIMAL(10,4),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_analytics_clinic_date ON notification_analytics(clinic_id, date, channel);

-- 7. SYSTEM TABLES
-- =============================================

CREATE TABLE queue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  snapshot_date DATE NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL,
  total_waiting INTEGER DEFAULT 0,
  total_in_progress INTEGER DEFAULT 0,
  total_completed_today INTEGER DEFAULT 0,
  average_wait_time INTEGER,
  longest_wait_time INTEGER,
  current_delay_minutes INTEGER,
  active_staff_count INTEGER,
  staff_utilization FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_snapshots_clinic_time ON queue_snapshots(clinic_id, snapshot_time DESC);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  clinic_id UUID REFERENCES clinics(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_clinic_date ON audit_logs(clinic_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

-- 8. UPDATED_AT TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinic_staff_updated_at BEFORE UPDATE ON clinic_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. ROW LEVEL SECURITY
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_clinic_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- User roles policies
CREATE POLICY "Users can view own roles" ON user_roles FOR SELECT USING (auth.uid() = user_id);

-- Clinics policies
CREATE POLICY "Anyone can view active clinics" ON clinics FOR SELECT USING (is_active = true);
CREATE POLICY "Owners can update own clinic" ON clinics FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Authenticated users can create clinics" ON clinics FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Clinic staff policies
CREATE POLICY "Staff can view own clinic staff" ON clinic_staff FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND clinic_id = clinic_staff.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

CREATE POLICY "Owners can manage clinic staff" ON clinic_staff FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = clinic_staff.clinic_id AND owner_id = auth.uid()
  ));

-- Appointments policies
CREATE POLICY "Patients can view own appointments" ON appointments FOR SELECT 
  USING (auth.uid() = patient_id);

CREATE POLICY "Staff can view clinic appointments" ON appointments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = appointments.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

CREATE POLICY "Patients can create own appointments" ON appointments FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Staff can create appointments" ON appointments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = appointments.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

CREATE POLICY "Staff can update clinic appointments" ON appointments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = appointments.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

-- Patient history policies
CREATE POLICY "Patients can view own history" ON patient_clinic_history FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Staff can view clinic patient history" ON patient_clinic_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = patient_clinic_history.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT
  USING (auth.uid() = patient_id);

-- Queue snapshots policies
CREATE POLICY "Anyone can view queue snapshots" ON queue_snapshots FOR SELECT USING (true);

-- Analytics/metrics accessible to clinic staff
CREATE POLICY "Staff can view clinic metrics" ON appointment_metrics FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = appointment_metrics.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

CREATE POLICY "Staff can view clinic analytics" ON notification_analytics FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = notification_analytics.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

-- Audit logs accessible to clinic owners
CREATE POLICY "Owners can view clinic audit logs" ON audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = audit_logs.clinic_id AND owner_id = auth.uid()
  ));
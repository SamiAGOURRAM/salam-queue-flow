-- =============================================
-- Queue Override System Migration
-- Adds flexible queue management with audit trail
-- =============================================

-- 1. Add new columns to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS original_queue_position INTEGER,
ADD COLUMN IF NOT EXISTS is_present BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS marked_absent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS skip_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES auth.users(id);

-- 2. Create skip_reason ENUM
DO $$ BEGIN
  CREATE TYPE skip_reason_type AS ENUM (
    'patient_absent',
    'patient_present',
    'emergency_case',
    'doctor_preference',
    'late_arrival',
    'technical_issue',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS skip_reason skip_reason_type;

-- 3. Create absent_patients table
CREATE TABLE IF NOT EXISTS absent_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  marked_absent_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  new_position INTEGER,
  notification_sent BOOLEAN DEFAULT false,
  grace_period_ends_at TIMESTAMPTZ,
  auto_cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_absent_patients_clinic ON absent_patients(clinic_id, marked_absent_at);
CREATE INDEX idx_absent_patients_appointment ON absent_patients(appointment_id);
CREATE INDEX idx_absent_patients_active ON absent_patients(clinic_id) 
  WHERE returned_at IS NULL AND auto_cancelled = false;

-- 4. Create queue_overrides audit table
CREATE TABLE IF NOT EXISTS queue_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  appointment_id UUID REFERENCES appointments(id) NOT NULL,
  skipped_patient_ids UUID[],
  action_type TEXT CHECK (action_type IN ('call_present', 'mark_absent', 'late_arrival', 'emergency', 'reorder')) NOT NULL,
  performed_by UUID REFERENCES auth.users(id) NOT NULL,
  reason TEXT,
  previous_position INTEGER,
  new_position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_overrides_clinic ON queue_overrides(clinic_id, created_at DESC);
CREATE INDEX idx_queue_overrides_appointment ON queue_overrides(appointment_id);
CREATE INDEX idx_queue_overrides_performed_by ON queue_overrides(performed_by);

-- 5. Create notification budget tracking
CREATE TABLE IF NOT EXISTS clinic_notification_budgets (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  monthly_sms_limit INTEGER DEFAULT 1000,
  current_month_sms_count INTEGER DEFAULT 0,
  monthly_budget_amount DECIMAL(10,2) DEFAULT 500.00,
  current_month_spend DECIMAL(10,2) DEFAULT 0.00,
  alert_threshold DECIMAL(3,2) DEFAULT 0.80,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create notification templates table
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ar', 'fr', 'en')),
  template_text TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, template_key, language)
);

CREATE INDEX idx_notification_templates_clinic ON notification_templates(clinic_id);
CREATE INDEX idx_notification_templates_key ON notification_templates(template_key, language);

-- 7. Insert default notification templates
INSERT INTO notification_templates (template_key, language, template_text, variables, is_custom) VALUES
  -- Absent notifications
  ('patient_marked_absent', 'ar', 'مرحباً {patient_name}، لقد فاتك دورك في {clinic_name}. يرجى التواصل مع الاستقبال عند وصولك.', '["patient_name", "clinic_name"]'::jsonb, false),
  ('patient_marked_absent', 'fr', 'Bonjour {patient_name}, vous avez manqué votre tour à {clinic_name}. Veuillez voir la réception à votre arrivée.', '["patient_name", "clinic_name"]'::jsonb, false),
  ('patient_marked_absent', 'en', 'Hi {patient_name}, you missed your turn at {clinic_name}. Please see reception upon arrival.', '["patient_name", "clinic_name"]'::jsonb, false),
  
  -- Reassurance for skipped patients
  ('still_next_reassurance', 'ar', 'مرحباً {patient_name}، تم استدعاء مريض حاضر. أنت ما زلت التالي في الدور {position}.', '["patient_name", "position"]'::jsonb, false),
  ('still_next_reassurance', 'fr', 'Bonjour {patient_name}, un patient présent a été pris. Vous êtes toujours le suivant (position {position}).', '["patient_name", "position"]'::jsonb, false),
  ('still_next_reassurance', 'en', 'Hi {patient_name}, a present patient was called. You are still next at position {position}.', '["patient_name", "position"]'::jsonb, false),
  
  -- Late arrival re-queued
  ('late_arrival_requeued', 'ar', 'تم تسجيل وصولك إلى {clinic_name}. موقعك الجديد في الطابور: {position}', '["clinic_name", "position"]'::jsonb, false),
  ('late_arrival_requeued', 'fr', 'Votre arrivée à {clinic_name} est enregistrée. Nouvelle position: {position}', '["clinic_name", "position"]'::jsonb, false),
  ('late_arrival_requeued', 'en', 'Your arrival at {clinic_name} is registered. New queue position: {position}', '["clinic_name", "position"]'::jsonb, false),
  
  -- Your turn
  ('your_turn', 'ar', 'حان دورك! يرجى التوجه إلى غرفة الاستشارة في {clinic_name}.', '["clinic_name"]'::jsonb, false),
  ('your_turn', 'fr', 'C''est votre tour! Veuillez vous rendre en salle de consultation à {clinic_name}.', '["clinic_name"]'::jsonb, false),
  ('your_turn', 'en', 'It''s your turn! Please proceed to the consultation room at {clinic_name}.', '["clinic_name"]'::jsonb, false),
  
  -- Position update
  ('position_update', 'ar', 'تحديث: أنت الآن رقم {position} في الطابور في {clinic_name}. الوقت المتوقع: {estimated_time}', '["position", "clinic_name", "estimated_time"]'::jsonb, false),
  ('position_update', 'fr', 'Mise à jour: Vous êtes maintenant n°{position} à {clinic_name}. Heure estimée: {estimated_time}', '["position", "clinic_name", "estimated_time"]'::jsonb, false),
  ('position_update', 'en', 'Update: You are now #{position} at {clinic_name}. Estimated time: {estimated_time}', '["position", "clinic_name", "estimated_time"]'::jsonb, false)
ON CONFLICT (clinic_id, template_key, language) DO NOTHING;

-- 8. Add grace period configuration to clinics settings
UPDATE clinics 
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{absent_grace_period_minutes}',
  '10'
) WHERE NOT settings ? 'absent_grace_period_minutes';

UPDATE clinics 
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{auto_cancel_after_grace_period}',
  'true'
) WHERE NOT settings ? 'auto_cancel_after_grace_period';

-- 9. Function to automatically update grace period end time
CREATE OR REPLACE FUNCTION set_absent_grace_period()
RETURNS TRIGGER AS $$
DECLARE
  grace_minutes INTEGER;
BEGIN
  -- Get grace period from clinic settings (default 10 minutes)
  SELECT COALESCE((settings->>'absent_grace_period_minutes')::INTEGER, 10)
  INTO grace_minutes
  FROM clinics
  WHERE id = NEW.clinic_id;
  
  NEW.grace_period_ends_at := NEW.marked_absent_at + (grace_minutes || ' minutes')::INTERVAL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_absent_grace_period_trigger
  BEFORE INSERT ON absent_patients
  FOR EACH ROW
  EXECUTE FUNCTION set_absent_grace_period();

-- 10. Function to reset monthly notification budget
CREATE OR REPLACE FUNCTION reset_monthly_notification_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_reset_date < CURRENT_DATE - INTERVAL '1 month' THEN
    NEW.current_month_sms_count := 0;
    NEW.current_month_spend := 0.00;
    NEW.last_reset_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reset_notification_budget_trigger
  BEFORE UPDATE ON clinic_notification_budgets
  FOR EACH ROW
  EXECUTE FUNCTION reset_monthly_notification_budget();

-- 11. Initialize notification budgets for existing clinics
INSERT INTO clinic_notification_budgets (clinic_id)
SELECT id FROM clinics
WHERE id NOT IN (SELECT clinic_id FROM clinic_notification_budgets)
ON CONFLICT (clinic_id) DO NOTHING;

-- 12. Update updated_at triggers
CREATE TRIGGER update_absent_patients_updated_at 
  BEFORE UPDATE ON absent_patients
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_budgets_updated_at 
  BEFORE UPDATE ON clinic_notification_budgets
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at 
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 13. Row Level Security Policies
ALTER TABLE absent_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_notification_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Staff can view their clinic's absent patients
CREATE POLICY "Staff can view clinic absent patients" ON absent_patients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = absent_patients.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

-- Staff can manage absent patients
CREATE POLICY "Staff can manage absent patients" ON absent_patients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = absent_patients.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

-- Staff can view queue overrides
CREATE POLICY "Staff can view queue overrides" ON queue_overrides FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND clinic_id = queue_overrides.clinic_id
      AND role IN ('clinic_owner', 'staff')
  ));

-- Owners can view notification budgets
CREATE POLICY "Owners can view notification budgets" ON clinic_notification_budgets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clinics
    WHERE id = clinic_notification_budgets.clinic_id 
      AND owner_id = auth.uid()
  ));

-- Owners can update notification budgets
CREATE POLICY "Owners can update notification budgets" ON clinic_notification_budgets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clinics
    WHERE id = clinic_notification_budgets.clinic_id 
      AND owner_id = auth.uid()
  ));

-- Staff can view templates
CREATE POLICY "Staff can view notification templates" ON notification_templates FOR SELECT
  USING (
    clinic_id IS NULL OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = notification_templates.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
  );

-- Owners can manage templates
CREATE POLICY "Owners can manage notification templates" ON notification_templates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM clinics
    WHERE id = notification_templates.clinic_id 
      AND owner_id = auth.uid()
  ));

-- 14. Add helpful comments
COMMENT ON TABLE absent_patients IS 'Tracks patients who were marked absent with grace period for late arrivals';
COMMENT ON TABLE queue_overrides IS 'Audit log for all queue position changes and overrides';
COMMENT ON TABLE clinic_notification_budgets IS 'Monthly SMS budget tracking and limits per clinic';
COMMENT ON TABLE notification_templates IS 'Customizable notification message templates with multilingual support';
COMMENT ON COLUMN absent_patients.grace_period_ends_at IS 'After this time, patient is auto-cancelled if auto_cancel is enabled';
COMMENT ON COLUMN appointments.skip_count IS 'Number of times this patient was skipped in favor of another';

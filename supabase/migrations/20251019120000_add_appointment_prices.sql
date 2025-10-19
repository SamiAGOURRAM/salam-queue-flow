-- Migration: Add price field to appointment types
-- Description: Enables clinics to set prices for different appointment types
-- Price is stored in MAD (Moroccan Dirham)

-- Update the comment on settings column to document the new price field
COMMENT ON COLUMN clinics.settings IS 
'JSONB containing clinic settings. Structure:
{
  "appointment_types": [
    {
      "name": "string",
      "duration_minutes": number,
      "color": "string (hex)",
      "price": number (optional, in MAD - Moroccan Dirham)
    }
  ],
  "business_hours": {...},
  "notification_preferences": {...}
}';

-- Optional: Update existing appointment types to include price field
-- This adds a 'price' field set to null for all existing appointment types
-- You can customize default prices here if needed
UPDATE clinics
SET settings = jsonb_set(
  settings,
  '{appointment_types}',
  (
    SELECT jsonb_agg(
      appointment_type || jsonb_build_object('price', null)
    )
    FROM jsonb_array_elements(settings->'appointment_types') AS appointment_type
    WHERE NOT (appointment_type ? 'price')
  ),
  true
)
WHERE settings->'appointment_types' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(settings->'appointment_types') AS appointment_type
    WHERE NOT (appointment_type ? 'price')
  );

-- Create an index on settings->appointment_types for faster queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_clinics_appointment_types ON clinics USING gin ((settings->'appointment_types'));
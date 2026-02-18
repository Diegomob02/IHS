-- Notification rules + email templates (Super Admin)

INSERT INTO public.app_settings (key, value)
VALUES (
  'notification_rules',
  '{
    "email": {
      "lead_evaluation_received": true,
      "lead_contact_received": true,
      "contractor_reviewing": true,
      "contractor_approved": true,
      "contractor_rejected": true
    },
    "n8n": {
      "lead_submitted": true,
      "contractor_status_changed": true
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES (
  'email_templates',
  '{}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

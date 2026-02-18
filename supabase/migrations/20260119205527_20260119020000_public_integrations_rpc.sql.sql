-- Public RPC for safe integration config (no secrets)

CREATE OR REPLACE FUNCTION public.get_public_integrations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'n8n',
    jsonb_build_object(
      'enabled',
      (status = 'enabled') AND COALESCE((config_json ->> 'syncEnabled')::boolean, FALSE),
      'webhookUrl',
      COALESCE(config_json ->> 'webhookUrl', '')
    )
  )
  INTO result
  FROM public.integration_configs
  WHERE type = 'n8n'
  LIMIT 1;

  RETURN COALESCE(result, jsonb_build_object('n8n', jsonb_build_object('enabled', false, 'webhookUrl', '')));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_integrations() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_integrations() TO authenticated;

;

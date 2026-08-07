-- Configurable outbound payloads for CRM lead-created webhooks.
--
-- Delivery lives on public.leads so every insertion path is covered: CRM UI,
-- imports, inbound integrations, GPT Maker and service-role jobs. pg_net queues
-- HTTP requests after the transaction commits, so lead creation is not blocked
-- by a slow or unavailable destination such as n8n.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS payload_template jsonb NOT NULL DEFAULT
    '{
      "event": "{{event}}",
      "created_at": "{{created_at}}",
      "lead": {
        "id": "{{lead.id}}",
        "name": "{{lead.name}}",
        "email": "{{lead.email}}",
        "phone": "{{lead.phone}}",
        "source": "{{lead.source}}",
        "tags": "{{lead.tags}}",
        "custom_fields": "{{lead.custom_fields}}"
      }
    }'::jsonb;

COMMENT ON COLUMN public.webhook_configs.payload_template IS
  'Outbound JSON body. Exact {{path}} placeholders preserve JSON types; placeholders inside longer strings are rendered as text.';

-- Recursively render placeholders in objects, arrays and strings.
-- Context paths use dot notation, for example {{lead.name}} or
-- {{lead.custom_fields.product}}.
CREATE OR REPLACE FUNCTION public.render_webhook_payload(
  p_template jsonb,
  p_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_type text;
  v_text text;
  v_path text;
  v_value jsonb;
  v_result jsonb;
  v_match record;
BEGIN
  IF p_template IS NULL THEN
    RETURN NULL;
  END IF;

  v_type := jsonb_typeof(p_template);

  IF v_type = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(entry.key, public.render_webhook_payload(entry.value, p_context)),
      '{}'::jsonb
    )
    INTO v_result
    FROM jsonb_each(p_template) AS entry;
    RETURN v_result;
  END IF;

  IF v_type = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(public.render_webhook_payload(item.value, p_context) ORDER BY item.ordinality),
      '[]'::jsonb
    )
    INTO v_result
    FROM jsonb_array_elements(p_template) WITH ORDINALITY AS item(value, ordinality);
    RETURN v_result;
  END IF;

  IF v_type <> 'string' THEN
    RETURN p_template;
  END IF;

  v_text := p_template #>> '{}';

  -- When the entire JSON string is one placeholder, return the native JSON
  -- value (array, object, number, boolean or null) instead of stringifying it.
  IF v_text ~ '^\{\{\s*[A-Za-z0-9_.]+\s*\}\}$' THEN
    v_path := regexp_replace(v_text, '^\{\{\s*|\s*\}\}$', '', 'g');
    v_value := p_context #> string_to_array(v_path, '.');
    RETURN COALESCE(v_value, 'null'::jsonb);
  END IF;

  -- Placeholders embedded in a longer string are converted to text.
  FOR v_match IN
    SELECT captures[1] AS token, captures[2] AS path
    FROM regexp_matches(
      v_text,
      '(\{\{\s*([A-Za-z0-9_.]+)\s*\}\})',
      'g'
    ) AS matched(captures)
  LOOP
    v_value := p_context #> string_to_array(v_match.path, '.');
    v_text := replace(
      v_text,
      v_match.token,
      CASE
        WHEN v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN ''
        WHEN jsonb_typeof(v_value) = 'string' THEN v_value #>> '{}'
        ELSE v_value::text
      END
    );
  END LOOP;

  RETURN to_jsonb(v_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_lead_created_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
  webhook record;
  context jsonb;
  payload jsonb;
  request_id bigint;
BEGIN
  context := jsonb_build_object(
    'event', 'lead_created',
    'created_at', COALESCE(NEW.created_at, now()),
    'lead', to_jsonb(NEW)
  );

  FOR webhook IN
    SELECT id, equipe_id, url, headers, payload_template
    FROM public.webhook_configs
    WHERE equipe_id = NEW.equipe_id
      AND trigger_event = 'lead_created'
      AND active = true
      AND inbound_function IS NULL
      AND NULLIF(btrim(url), '') IS NOT NULL
  LOOP
    payload := public.render_webhook_payload(webhook.payload_template, context);

    BEGIN
      SELECT net.http_post(
        url := webhook.url,
        headers := jsonb_build_object('Content-Type', 'application/json')
          || COALESCE(webhook.headers, '{}'::jsonb),
        body := payload,
        timeout_milliseconds := 10000
      )
      INTO request_id;

      INSERT INTO public.webhook_logs (
        equipe_id,
        webhook_config_id,
        direction,
        event_type,
        payload,
        response_body
      ) VALUES (
        NEW.equipe_id,
        webhook.id,
        'outbound',
        'lead_created',
        payload,
        'Queued by pg_net (request ' || request_id || ')'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Webhook failures must never roll back CRM lead creation.
      INSERT INTO public.webhook_logs (
        equipe_id,
        webhook_config_id,
        direction,
        event_type,
        payload,
        error_message
      ) VALUES (
        NEW.equipe_id,
        webhook.id,
        'outbound',
        'lead_created',
        payload,
        SQLERRM
      );
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_lead_created_webhooks ON public.leads;

CREATE TRIGGER dispatch_lead_created_webhooks
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_lead_created_webhooks();

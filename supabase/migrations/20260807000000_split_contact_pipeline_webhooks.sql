-- Split CRM webhook semantics:
--   contact_created = a new row in Base de Contatos (public.leads)
--   lead_created    = a contact added to a pipeline (public.opportunities)
-- Also persist pg_net request IDs and reconcile their real HTTP responses.

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS request_id bigint;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_request_id
  ON public.webhook_logs (request_id)
  WHERE request_id IS NOT NULL;

COMMENT ON COLUMN public.webhook_logs.request_id IS
  'pg_net request ID used to reconcile the asynchronous destination response';

-- Preserve request IDs created by the previous migration while pg_net's
-- response retention window still contains them.
UPDATE public.webhook_logs
SET request_id = substring(response_body FROM 'request ([0-9]+)')::bigint
WHERE request_id IS NULL
  AND response_body ~ '^Queued by pg_net \(request [0-9]+\)$';

CREATE OR REPLACE FUNCTION public.enqueue_crm_webhooks(
  p_equipe_id uuid,
  p_event text,
  p_context jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
  webhook record;
  payload jsonb;
  queued_request_id bigint;
BEGIN
  FOR webhook IN
    SELECT id, url, headers, payload_template
    FROM public.webhook_configs
    WHERE equipe_id = p_equipe_id
      AND trigger_event = p_event
      AND active = true
      AND inbound_function IS NULL
      AND NULLIF(btrim(url), '') IS NOT NULL
  LOOP
    payload := public.render_webhook_payload(webhook.payload_template, p_context);

    BEGIN
      SELECT net.http_post(
        url := webhook.url,
        headers := jsonb_build_object('Content-Type', 'application/json')
          || COALESCE(webhook.headers, '{}'::jsonb),
        body := payload,
        timeout_milliseconds := 10000
      )
      INTO queued_request_id;

      INSERT INTO public.webhook_logs (
        equipe_id,
        webhook_config_id,
        direction,
        event_type,
        payload,
        request_id,
        response_body
      ) VALUES (
        p_equipe_id,
        webhook.id,
        'outbound',
        p_event,
        payload,
        queued_request_id,
        'Queued by pg_net (request ' || queued_request_id || ')'
      );
    EXCEPTION WHEN OTHERS THEN
      -- External delivery must never roll back contact or opportunity creation.
      INSERT INTO public.webhook_logs (
        equipe_id,
        webhook_config_id,
        direction,
        event_type,
        payload,
        error_message
      ) VALUES (
        p_equipe_id,
        webhook.id,
        'outbound',
        p_event,
        payload,
        SQLERRM
      );
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_contact_created_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_crm_webhooks(
    NEW.equipe_id,
    'contact_created',
    jsonb_build_object(
      'event', 'contact_created',
      'created_at', COALESCE(NEW.created_at, now()),
      'lead', to_jsonb(NEW),
      'opportunity', NULL,
      'pipeline', NULL,
      'stage', NULL
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_pipeline_lead_created_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
  lead_payload jsonb;
  pipeline_payload jsonb;
  stage_payload jsonb;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT to_jsonb(lead_row)
  INTO lead_payload
  FROM public.leads AS lead_row
  WHERE lead_row.id = NEW.lead_id;

  SELECT to_jsonb(pipeline_row)
  INTO pipeline_payload
  FROM public.pipelines AS pipeline_row
  WHERE pipeline_row.id = NEW.pipeline_id;

  SELECT to_jsonb(stage_row)
  INTO stage_payload
  FROM public.pipeline_stages_v2 AS stage_row
  WHERE stage_row.id = NEW.stage_id;

  PERFORM public.enqueue_crm_webhooks(
    NEW.equipe_id,
    'lead_created',
    jsonb_build_object(
      'event', 'lead_created',
      'created_at', COALESCE(NEW.created_at, now()),
      'lead', lead_payload,
      'opportunity', to_jsonb(NEW),
      'pipeline', pipeline_payload,
      'stage', stage_payload
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_lead_created_webhooks ON public.leads;
DROP FUNCTION IF EXISTS public.dispatch_lead_created_webhooks();

DROP TRIGGER IF EXISTS dispatch_contact_created_webhooks ON public.leads;
CREATE TRIGGER dispatch_contact_created_webhooks
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_contact_created_webhooks();

DROP TRIGGER IF EXISTS dispatch_pipeline_lead_created_webhooks ON public.opportunities;
CREATE TRIGGER dispatch_pipeline_lead_created_webhooks
  AFTER INSERT ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_pipeline_lead_created_webhooks();

-- Reconcile queued logs with pg_net's asynchronous response table. This is
-- called by the webhook log screen and intentionally does not add triggers to
-- net._http_response (pg_net warns against triggers on its internal tables).
CREATE OR REPLACE FUNCTION public.refresh_webhook_delivery_logs(p_equipe_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles
       WHERE id = auth.uid()
         AND equipe_id = p_equipe_id
     ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.webhook_logs AS log
  SET response_status = response.status_code,
      response_body = COALESCE(response.content, log.response_body),
      error_message = CASE
        WHEN response.timed_out THEN 'Destination request timed out'
        WHEN response.error_msg IS NOT NULL THEN response.error_msg
        ELSE NULL
      END
  FROM net._http_response AS response
  WHERE log.equipe_id = p_equipe_id
    AND log.request_id = response.id
    AND log.response_status IS NULL
    AND log.error_message IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_webhook_delivery_logs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_webhook_delivery_logs(uuid) TO authenticated, service_role;

-- Immediately improve any still-retained queued history from the first
-- deployment, without waiting for the UI to call the reconciliation RPC.
UPDATE public.webhook_logs AS log
SET response_status = response.status_code,
    response_body = COALESCE(response.content, log.response_body),
    error_message = CASE
      WHEN response.timed_out THEN 'Destination request timed out'
      WHEN response.error_msg IS NOT NULL THEN response.error_msg
      ELSE NULL
    END
FROM net._http_response AS response
WHERE log.request_id = response.id
  AND log.response_status IS NULL
  AND log.error_message IS NULL;

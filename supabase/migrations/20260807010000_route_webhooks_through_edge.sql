-- pg_net cannot complete the TLS handshake with some n8n hosts even though
-- Supabase Edge Functions can reach them. Queue a short internal call to an
-- Edge Function and let that function perform the external delivery.

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS dispatch_token uuid;

COMMENT ON COLUMN public.webhook_logs.dispatch_token IS
  'One-time capability used by the internal Edge Function dispatcher; cleared when claimed';

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
  delivery_log_id uuid;
  delivery_token uuid;
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
    delivery_log_id := NULL;
    delivery_token := gen_random_uuid();

    BEGIN
      INSERT INTO public.webhook_logs (
        equipe_id,
        webhook_config_id,
        direction,
        event_type,
        payload,
        dispatch_token,
        response_body
      ) VALUES (
        p_equipe_id,
        webhook.id,
        'outbound',
        p_event,
        payload,
        delivery_token,
        'Waiting for Edge Function dispatcher'
      )
      RETURNING id INTO delivery_log_id;

      SELECT net.http_post(
        url := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/deliver-crm-webhook',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVneHpzaXZ6cWxxYWRvcXBnZmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2ODkyODgsImV4cCI6MjA4MjI2NTI4OH0.jk2IsDYwUnIl5ejwWWmhe0KOdWjbc7sZH6Ni_T_8QZQ',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVneHpzaXZ6cWxxYWRvcXBnZmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2ODkyODgsImV4cCI6MjA4MjI2NTI4OH0.jk2IsDYwUnIl5ejwWWmhe0KOdWjbc7sZH6Ni_T_8QZQ'
        ),
        body := jsonb_build_object(
          'operation', 'deliver_outbound',
          'log_id', delivery_log_id,
          'dispatch_token', delivery_token
        ),
        timeout_milliseconds := 35000
      )
      INTO queued_request_id;

      UPDATE public.webhook_logs
      SET request_id = queued_request_id,
          response_body = 'Queued for Edge Function delivery (request ' || queued_request_id || ')'
      WHERE id = delivery_log_id;
    EXCEPTION WHEN OTHERS THEN
      IF delivery_log_id IS NOT NULL THEN
        UPDATE public.webhook_logs
        SET dispatch_token = NULL,
            error_message = SQLERRM
        WHERE id = delivery_log_id;
      ELSE
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
      END IF;
    END;
  END LOOP;
END;
$$;

-- Reconcile direct pg_net failures that completed after the last UI refresh,
-- including the n8n TLS timeout that motivated this dispatcher.
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

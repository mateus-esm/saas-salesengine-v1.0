


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'user',
    'admin',
    'owner',
    'super_admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_negative_stages"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  equipe_record RECORD;
  max_position INTEGER;
BEGIN
  FOR equipe_record IN SELECT id FROM public.equipes LOOP
    -- Get max position for this team
    SELECT COALESCE(MAX(position), 0) INTO max_position
    FROM public.pipeline_stages
    WHERE equipe_id = equipe_record.id;
    
    -- Desqualificado
    INSERT INTO public.pipeline_stages (equipe_id, name, color, position, category, is_default)
    SELECT equipe_record.id, 'Desqualificado', '#dc2626', max_position + 1, 'disqualified', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = equipe_record.id AND name = 'Desqualificado'
    );
    
    -- Perdido
    INSERT INTO public.pipeline_stages (equipe_id, name, color, position, category, is_default)
    SELECT equipe_record.id, 'Perdido', '#991b1b', max_position + 2, 'lost', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = equipe_record.id AND name = 'Perdido'
    );
    
    -- Reciclo
    INSERT INTO public.pipeline_stages (equipe_id, name, color, position, category, is_default)
    SELECT equipe_record.id, 'Reciclo', '#f97316', max_position + 3, 'recycled', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = equipe_record.id AND name = 'Reciclo'
    );
    
    -- Update existing "Fechado" stage to category 'won'
    UPDATE public.pipeline_stages 
    SET category = 'won'
    WHERE equipe_id = equipe_record.id AND name = 'Fechado';
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."ensure_negative_stages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_kpis"("p_equipe_id" "uuid", "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSON;
  v_total_leads INTEGER;
  v_won_leads INTEGER;
  v_closing_rate NUMERIC;
  v_avg_ticket NUMERIC;
  v_avg_sla_days NUMERIC;
  v_total_touchpoints INTEGER;
  v_avg_touchpoints_per_lead NUMERIC;
  v_closing_rate_post_meeting NUMERIC;
  v_total_meetings INTEGER;
  v_won_after_meeting INTEGER;
BEGIN
  -- Get total leads in period
  SELECT COUNT(*) INTO v_total_leads
  FROM leads
  WHERE equipe_id = p_equipe_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  -- Get won leads (in stages with category = 'won')
  SELECT COUNT(*) INTO v_won_leads
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND ps.category = 'won'
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Calculate closing rate
  v_closing_rate := CASE 
    WHEN v_total_leads > 0 THEN ROUND((v_won_leads::NUMERIC / v_total_leads) * 100, 2)
    ELSE 0 
  END;

  -- Calculate average ticket (won deals only)
  SELECT COALESCE(AVG(l.opportunity_value), 0) INTO v_avg_ticket
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND ps.category = 'won'
    AND l.opportunity_value > 0
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Calculate average SLA (days from creation to resolution)
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) / 86400
  ), 0) INTO v_avg_sla_days
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND ps.category IN ('won', 'lost')
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Get total touchpoints
  SELECT COUNT(*) INTO v_total_touchpoints
  FROM touchpoints t
  JOIN leads l ON t.lead_id = l.id
  WHERE l.equipe_id = p_equipe_id
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date);

  -- Calculate average touchpoints per lead
  v_avg_touchpoints_per_lead := CASE 
    WHEN v_total_leads > 0 THEN ROUND(v_total_touchpoints::NUMERIC / v_total_leads, 2)
    ELSE 0 
  END;

  -- Meetings metrics
  SELECT COUNT(*) INTO v_total_meetings
  FROM leads
  WHERE equipe_id = p_equipe_id
    AND meeting_done = true
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  SELECT COUNT(*) INTO v_won_after_meeting
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND l.meeting_done = true
    AND ps.category = 'won'
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  v_closing_rate_post_meeting := CASE 
    WHEN v_total_meetings > 0 THEN ROUND((v_won_after_meeting::NUMERIC / v_total_meetings) * 100, 2)
    ELSE 0 
  END;

  -- Build result JSON
  result := json_build_object(
    'total_leads', v_total_leads,
    'won_leads', v_won_leads,
    'closing_rate', v_closing_rate,
    'closing_rate_post_meeting', v_closing_rate_post_meeting,
    'avg_ticket', ROUND(v_avg_ticket, 2),
    'avg_sla_days', ROUND(v_avg_sla_days, 1),
    'total_touchpoints', v_total_touchpoints,
    'avg_touchpoints_per_lead', v_avg_touchpoints_per_lead
  );

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_kpis"("p_equipe_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, email)
  VALUES (new.id, new.id, new.email);
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_unread_count"("row_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE public.leads
    SET unread_count = unread_count + 1
      WHERE id = row_id;
      $$;


ALTER FUNCTION "public"."increment_unread_count"("row_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stage_entered_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    NEW.stage_entered_at = now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_stage_entered_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."consumo_creditos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "creditos_utilizados" integer NOT NULL,
    "periodo" character varying(7) NOT NULL,
    "data_consumo" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consumo_creditos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "crm_link" "text" NOT NULL,
    "suporte_link" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gpt_maker_agent_id" character varying(255),
    "jestor_api_token" character varying(500),
    "workspace_id" character varying,
    "plano_id" integer,
    "limite_creditos" integer DEFAULT 1000,
    "home_explanation" "text" DEFAULT 'O AdvAI é o seu assistente jurídico inteligente, desenvolvido pela Solo Ventures para automatizar e otimizar processos jurídicos. Utilize o chat para interagir com o agente e aproveite todas as funcionalidades do portal.'::"text",
    "creditos_avulsos" integer DEFAULT 0 NOT NULL,
    "asaas_customer_id" character varying,
    "asaas_subscription_id" character varying,
    "subscription_status" character varying,
    "niche" "text",
    "webhook_secret" "text" DEFAULT ("gen_random_uuid"())::"text"
);


ALTER TABLE "public"."equipes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."equipes"."asaas_customer_id" IS 'ID do cliente no gateway Asaas';



COMMENT ON COLUMN "public"."equipes"."asaas_subscription_id" IS 'ID da assinatura ativa no Asaas';



COMMENT ON COLUMN "public"."equipes"."subscription_status" IS 'Status da assinatura: ACTIVE, INACTIVE, OVERDUE, etc';



CREATE TABLE IF NOT EXISTS "public"."kpis_dashboard" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "leads_atendidos" integer DEFAULT 0,
    "reunioes_agendadas" integer DEFAULT 0,
    "negocios_fechados" integer DEFAULT 0,
    "valor_total_negocios" numeric(10,2) DEFAULT 0,
    "periodo" character varying(7) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kpis_dashboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "tipo" "text" NOT NULL,
    "descricao" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "stage_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "opportunity_value" numeric(12,2) DEFAULT 0,
    "meeting_scheduled" boolean DEFAULT false,
    "meeting_done" boolean DEFAULT false,
    "no_show" boolean DEFAULT false,
    "next_contact" "date",
    "observations" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "origem" "text" DEFAULT 'manual'::"text",
    "atendido_por_agente" boolean DEFAULT false,
    "interaction_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responsible_id" "uuid",
    "meeting_date" timestamp with time zone,
    "meeting_notes" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "gpt_maker_chat_id" "text",
    "unread_count" integer DEFAULT 0,
    "lead_type" "text" DEFAULT 'lead'::"text",
    "assigned_to" "uuid",
    "stage_entered_at" timestamp with time zone DEFAULT "now"(),
    "creation_source" "text" DEFAULT 'manual'::"text",
    CONSTRAINT "leads_creation_source_check" CHECK (("creation_source" = ANY (ARRAY['manual'::"text", 'ai_agent'::"text", 'webhook'::"text", 'import'::"text"]))),
    CONSTRAINT "leads_lead_type_check" CHECK (("lead_type" = ANY (ARRAY['lead'::"text", 'contact'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "sender_type" "text" NOT NULL,
    "sender_id" "uuid",
    "content" "text",
    "media_url" "text",
    "media_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "external_id" "text",
    "gpt_message_id" "text",
    CONSTRAINT "messages_media_type_check" CHECK (("media_type" = ANY (ARRAY['audio'::"text", 'image'::"text", 'video'::"text", 'document'::"text", 'text'::"text"]))),
    CONSTRAINT "messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['customer'::"text", 'agent'::"text", 'member'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'active'::"text",
    CONSTRAINT "pipeline_stages_category_check" CHECK (("category" = ANY (ARRAY['active'::"text", 'won'::"text", 'lost'::"text", 'disqualified'::"text", 'recycled'::"text"])))
);


ALTER TABLE "public"."pipeline_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planos" (
    "id" integer NOT NULL,
    "nome" character varying NOT NULL,
    "preco_mensal" numeric(10,2) NOT NULL,
    "limite_creditos" integer NOT NULL,
    "limite_usuarios" integer,
    "funcionalidades" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."planos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "nome_completo" "text",
    "equipe_id" "uuid",
    "chat_link_base" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telefone" "text",
    "cpf" "text",
    "cargo" "text" DEFAULT 'member'::"text",
    "role" "text" DEFAULT 'user'::"text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text", 'owner'::"text", 'super_admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_automations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "executed" boolean DEFAULT false,
    "executed_at" timestamp with time zone,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scheduled_automations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'overdue'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."touchpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "touchpoint_type" "text" DEFAULT 'note'::"text",
    "contact_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "touchpoints_type_check" CHECK (("touchpoint_type" = ANY (ARRAY['call'::"text", 'email'::"text", 'meeting'::"text", 'note'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."touchpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "trigger_event" "text" NOT NULL,
    "active" boolean DEFAULT true,
    "headers" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "webhook_config_id" "uuid",
    "direction" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_status" integer,
    "response_body" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_logs_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."webhook_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."consumo_creditos"
    ADD CONSTRAINT "consumo_creditos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipes"
    ADD CONSTRAINT "equipes_asaas_customer_id_key" UNIQUE ("asaas_customer_id");



ALTER TABLE ONLY "public"."equipes"
    ADD CONSTRAINT "equipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpis_dashboard"
    ADD CONSTRAINT "kpis_dashboard_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planos"
    ADD CONSTRAINT "planos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."scheduled_automations"
    ADD CONSTRAINT "scheduled_automations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "unique_gpt_message_id" UNIQUE ("gpt_message_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."webhook_configs"
    ADD CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_consumo_creditos_equipe_periodo" ON "public"."consumo_creditos" USING "btree" ("equipe_id", "periodo");



CREATE INDEX "idx_equipes_asaas_customer_id" ON "public"."equipes" USING "btree" ("asaas_customer_id");



CREATE UNIQUE INDEX "idx_kpis_dashboard_equipe_periodo" ON "public"."kpis_dashboard" USING "btree" ("equipe_id", "periodo");



CREATE INDEX "idx_lead_activities_lead_id" ON "public"."lead_activities" USING "btree" ("lead_id");



CREATE INDEX "idx_leads_assigned_to" ON "public"."leads" USING "btree" ("assigned_to");



CREATE INDEX "idx_leads_creation_source" ON "public"."leads" USING "btree" ("creation_source");



CREATE INDEX "idx_leads_equipe_id" ON "public"."leads" USING "btree" ("equipe_id");



CREATE INDEX "idx_leads_gpt_maker_chat_id" ON "public"."leads" USING "btree" ("gpt_maker_chat_id");



CREATE INDEX "idx_leads_last_message" ON "public"."leads" USING "btree" ("last_message_at" DESC);



CREATE INDEX "idx_leads_lead_type" ON "public"."leads" USING "btree" ("lead_type");



CREATE INDEX "idx_leads_meeting_date" ON "public"."leads" USING "btree" ("meeting_date");



CREATE INDEX "idx_leads_responsible" ON "public"."leads" USING "btree" ("responsible_id");



CREATE INDEX "idx_leads_stage_entered_at" ON "public"."leads" USING "btree" ("stage_entered_at");



CREATE INDEX "idx_leads_stage_id" ON "public"."leads" USING "btree" ("stage_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_lead_id" ON "public"."messages" USING "btree" ("lead_id");



CREATE INDEX "idx_pipeline_stages_category" ON "public"."pipeline_stages" USING "btree" ("category");



CREATE INDEX "idx_pipeline_stages_equipe_id" ON "public"."pipeline_stages" USING "btree" ("equipe_id");



CREATE INDEX "idx_profiles_equipe_id" ON "public"."profiles" USING "btree" ("equipe_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_scheduled_automations_scheduled_for" ON "public"."scheduled_automations" USING "btree" ("scheduled_for") WHERE ("executed" = false);



CREATE INDEX "idx_tasks_lead_id" ON "public"."tasks" USING "btree" ("lead_id");



CREATE INDEX "idx_touchpoints_contact_date" ON "public"."touchpoints" USING "btree" ("contact_date" DESC);



CREATE INDEX "idx_touchpoints_created_at" ON "public"."touchpoints" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_touchpoints_lead_id" ON "public"."touchpoints" USING "btree" ("lead_id");



CREATE INDEX "idx_webhook_logs_created_at" ON "public"."webhook_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_webhook_logs_direction" ON "public"."webhook_logs" USING "btree" ("direction");



CREATE INDEX "idx_webhook_logs_equipe_id" ON "public"."webhook_logs" USING "btree" ("equipe_id");



CREATE OR REPLACE TRIGGER "update_equipes_updated_at" BEFORE UPDATE ON "public"."equipes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kpis_dashboard_updated_at" BEFORE UPDATE ON "public"."kpis_dashboard" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lead_stage_entered_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_stage_entered_at"();



CREATE OR REPLACE TRIGGER "update_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_planos_updated_at" BEFORE UPDATE ON "public"."planos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."consumo_creditos"
    ADD CONSTRAINT "consumo_creditos_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id");



ALTER TABLE ONLY "public"."equipes"
    ADD CONSTRAINT "fk_equipes_plano" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id");



ALTER TABLE ONLY "public"."kpis_dashboard"
    ADD CONSTRAINT "kpis_dashboard_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id");



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_automations"
    ADD CONSTRAINT "scheduled_automations_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_automations"
    ADD CONSTRAINT "scheduled_automations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_configs"
    ADD CONSTRAINT "webhook_configs_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_webhook_config_id_fkey" FOREIGN KEY ("webhook_config_id") REFERENCES "public"."webhook_configs"("id") ON DELETE SET NULL;



CREATE POLICY "Acesso Chat Equipe" ON "public"."messages" USING (("lead_id" IN ( SELECT "leads"."id"
   FROM "public"."leads"
  WHERE ("leads"."equipe_id" IN ( SELECT "profiles"."equipe_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Acesso Tasks Equipe" ON "public"."tasks" USING (("lead_id" IN ( SELECT "leads"."id"
   FROM "public"."leads"
  WHERE ("leads"."equipe_id" IN ( SELECT "profiles"."equipe_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Super admin can manage roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admin can read all equipes" ON "public"."equipes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))) OR ("id" IN ( SELECT "profiles"."equipe_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "Super admin can update all equipes" ON "public"."equipes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Super admin can update all profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admin can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Team members can manage webhooks" ON "public"."webhook_configs" USING (("equipe_id" IN ( SELECT "profiles"."equipe_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Todos podem ver planos" ON "public"."planos" FOR SELECT USING (true);



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their team automations" ON "public"."scheduled_automations" USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can manage their team lead activities" ON "public"."lead_activities" USING (("lead_id" IN ( SELECT "l"."id"
   FROM "public"."leads" "l"
  WHERE ("l"."equipe_id" IN ( SELECT "p"."equipe_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage their team leads" ON "public"."leads" USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can manage their team stages" ON "public"."pipeline_stages" USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can manage their team touchpoints" ON "public"."touchpoints" USING (("lead_id" IN ( SELECT "leads"."id"
   FROM "public"."leads"
  WHERE ("leads"."equipe_id" IN ( SELECT "profiles"."equipe_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own team" ON "public"."equipes" FOR SELECT USING (("id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their team automations" ON "public"."scheduled_automations" FOR SELECT USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their team lead activities" ON "public"."lead_activities" FOR SELECT USING (("lead_id" IN ( SELECT "l"."id"
   FROM "public"."leads" "l"
  WHERE ("l"."equipe_id" IN ( SELECT "p"."equipe_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their team leads" ON "public"."leads" FOR SELECT USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their team stages" ON "public"."pipeline_stages" FOR SELECT USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their team touchpoints" ON "public"."touchpoints" FOR SELECT USING (("lead_id" IN ( SELECT "leads"."id"
   FROM "public"."leads"
  WHERE ("leads"."equipe_id" IN ( SELECT "profiles"."equipe_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their team webhook logs" ON "public"."webhook_logs" FOR SELECT USING (("equipe_id" IN ( SELECT "p"."equipe_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários podem ver sua própria equipe" ON "public"."equipes" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "profiles"."equipe_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."consumo_creditos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kpis_dashboard" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_automations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."touchpoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_view_team_credits" ON "public"."consumo_creditos" FOR SELECT USING (("equipe_id" IN ( SELECT "profiles"."equipe_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "users_view_team_kpis" ON "public"."kpis_dashboard" FOR SELECT USING (("equipe_id" IN ( SELECT "profiles"."equipe_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."webhook_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_logs" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."leads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."touchpoints";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."webhook_logs";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."ensure_negative_stages"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_negative_stages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_negative_stages"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_equipe_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_equipe_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_equipe_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_unread_count"("row_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_unread_count"("row_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_unread_count"("row_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stage_entered_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_stage_entered_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stage_entered_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."consumo_creditos" TO "anon";
GRANT ALL ON TABLE "public"."consumo_creditos" TO "authenticated";
GRANT ALL ON TABLE "public"."consumo_creditos" TO "service_role";



GRANT ALL ON TABLE "public"."equipes" TO "anon";
GRANT ALL ON TABLE "public"."equipes" TO "authenticated";
GRANT ALL ON TABLE "public"."equipes" TO "service_role";



GRANT ALL ON TABLE "public"."kpis_dashboard" TO "anon";
GRANT ALL ON TABLE "public"."kpis_dashboard" TO "authenticated";
GRANT ALL ON TABLE "public"."kpis_dashboard" TO "service_role";



GRANT ALL ON TABLE "public"."lead_activities" TO "anon";
GRANT ALL ON TABLE "public"."lead_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_activities" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "service_role";



GRANT ALL ON TABLE "public"."planos" TO "anon";
GRANT ALL ON TABLE "public"."planos" TO "authenticated";
GRANT ALL ON TABLE "public"."planos" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_automations" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_automations" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_automations" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."touchpoints" TO "anon";
GRANT ALL ON TABLE "public"."touchpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."touchpoints" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_configs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_configs" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_logs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































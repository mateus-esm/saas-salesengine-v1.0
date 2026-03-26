drop policy "Super admin can manage all profiles" on "public"."profiles";

alter table "public"."leads" add column "unread_count" integer default 0;

alter table "public"."messages" add column "gpt_message_id" text;

CREATE UNIQUE INDEX unique_gpt_message_id ON public.messages USING btree (gpt_message_id);

alter table "public"."messages" add constraint "unique_gpt_message_id" UNIQUE using index "unique_gpt_message_id";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.increment_unread_count(row_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  UPDATE public.leads
    SET unread_count = unread_count + 1
      WHERE id = row_id;
      $function$
;

CREATE OR REPLACE FUNCTION public.handle_lead_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    first_stage_id UUID;
BEGIN
    -- CENÁRIO A: Virou CONTACT, SPAM ou ARCHIVED
    -- Ação: Remove do Pipeline (stage_id = null)
    IF NEW.lead_type IN ('contact', 'spam', 'archived') THEN
        NEW.stage_id := NULL;
    END IF;

    -- CENÁRIO B: É um LEAD e está sem fase
    -- Ação: Joga para a primeira fase da MESMA EQUIPE
    IF NEW.lead_type = 'lead' AND NEW.stage_id IS NULL THEN
        SELECT id INTO first_stage_id 
        FROM public.pipeline_stages 
        WHERE equipe_id = NEW.equipe_id
        ORDER BY position ASC 
        LIMIT 1;
        
        NEW.stage_id := first_stage_id;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$function$
;


  create policy "Admin View Decisions"
  on "public"."ai_decisions"
  as permissive
  for select
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = 'super_admin'::text))));



  create policy "Service Role Insert"
  on "public"."ai_decisions"
  as permissive
  for insert
  to public
with check (true);


CREATE TRIGGER trigger_lead_lifecycle BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.handle_lead_lifecycle();

drop trigger if exists "objects_delete_delete_prefix" on "storage"."objects";

drop trigger if exists "objects_insert_create_prefix" on "storage"."objects";

drop trigger if exists "objects_update_create_prefix" on "storage"."objects";

drop trigger if exists "prefixes_create_hierarchy" on "storage"."prefixes";

drop trigger if exists "prefixes_delete_hierarchy" on "storage"."prefixes";

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();



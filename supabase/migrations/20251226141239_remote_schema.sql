drop extension if exists "pg_net";

alter table "public"."profiles" alter column "chat_link_base" drop not null;

alter table "public"."profiles" alter column "equipe_id" drop not null;

alter table "public"."profiles" alter column "nome_completo" drop not null;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, user_id, email)
  VALUES (
    new.id,   -- ID do Perfil (Igual ao do Auth)
    new.id,   -- User ID (Obrigatório segundo seu schema)
    new.email -- Email
  );
  
  RETURN new;
END;
$function$
;



-- Insert super_admin role for the user
INSERT INTO public.user_roles (user_id, role)
VALUES ('0cfff9f9-8a3b-47de-981c-8587311e798c', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;
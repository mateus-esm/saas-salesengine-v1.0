-- Sprint 7.2 T4 — bucket for Knowledge Base document uploads.
-- The provider fetches documentUrl server-side, so objects must be publicly
-- readable. Writes are restricted to members of the owning equipe, and the
-- path is namespaced {equipe_id}/... so tenant isolation is path-enforced.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('agent-training-docs', 'agent-training-docs', true, 20971520)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS agent_training_docs_read ON storage.objects;
CREATE POLICY agent_training_docs_read ON storage.objects
  FOR SELECT USING (bucket_id = 'agent-training-docs');

DROP POLICY IF EXISTS agent_training_docs_write ON storage.objects;
CREATE POLICY agent_training_docs_write ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'agent-training-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT equipe_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_training_docs_delete ON storage.objects;
CREATE POLICY agent_training_docs_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'agent-training-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT equipe_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

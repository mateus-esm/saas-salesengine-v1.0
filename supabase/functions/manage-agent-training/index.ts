import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GPT_MAKER_BASE = 'https://api.gptmaker.ai/v2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error('Unauthorized');

    const { data: profile } = await supabase
      .from('profiles')
      .select('equipe_id')
      .eq('user_id', user.id)
      .single();
    if (!profile?.equipe_id) throw new Error('Profile not found');

    const { data: equipe } = await supabase
      .from('equipes')
      .select('gpt_maker_agent_id')
      .eq('id', profile.equipe_id)
      .single();
    if (!equipe?.gpt_maker_agent_id) throw new Error('GPT Maker Agent ID not configured');

    const gptToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!gptToken) throw new Error('GPT Maker token not configured');

    // IDs colados no Admin podem carregar whitespace/newline — sanitizar sempre
    const agentId = equipe.gpt_maker_agent_id.trim();
    const gptHeaders = {
      'Authorization': `Bearer ${gptToken}`,
      'Content-Type': 'application/json',
    };

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';

    // LIST trainings
    // T0 §7: the provider's list endpoint silently defaults to TEXT only when
    // `type` is omitted — a DOCUMENT/WEBSITE/VIDEO training exists but is
    // invisible in an unfiltered list. Always pass `type`; to show everything,
    // query each type and merge.
    if (req.method === 'GET' || action === 'list') {
      const page = url.searchParams.get('page') || '1';
      const filter = url.searchParams.get('filter') || '';
      const type = url.searchParams.get('type'); // 'TEXT'|'WEBSITE'|'VIDEO'|'DOCUMENT' — optional

      const typesToFetch = type ? [type] : ['TEXT', 'WEBSITE', 'VIDEO', 'DOCUMENT'];
      const listResults = await Promise.all(typesToFetch.map(async (t) => {
        const apiUrl = `${GPT_MAKER_BASE}/agent/${agentId}/trainings?page=${page}&type=${t}${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`;
        const res = await fetch(apiUrl, { headers: gptHeaders });
        if (!res.ok) {
          const err = await res.text();
          console.error('GPT Maker list error:', err);
          throw new Error(`GPT Maker API error: ${res.status}`);
        }
        return await res.json();
      }));

      const data = {
        data: listResults.flatMap((r) => r.data || r || []),
        count: listResults.reduce((sum: number, r: any) => sum + (r.count || 0), 0),
      };

      // Sync to local cache (agent_trainings table)
      const trainings = data.data || data || [];
      if (Array.isArray(trainings) && trainings.length > 0) {
        const upsertRows = trainings.map((t: any) => ({
          equipe_id: profile.equipe_id,
          gpt_training_id: t.id || t._id,
          type: (t.type || 'TEXT').toUpperCase(),
          content: t.text || t.content || '',
          image: t.image || null,
          synced_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from('agent_trainings')
          .upsert(upsertRows, { onConflict: 'gpt_training_id', ignoreDuplicates: false });

        if (upsertError) {
          console.error('Cache sync error:', upsertError);
        } else {
          console.log(`Synced ${upsertRows.length} trainings to local cache`);
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UPLOAD-URL — return the namespaced path the client uploads to and the
    // public URL to hand the provider. Provider fetches documentUrl
    // server-side, so the object must be in the public bucket.
    if (action === 'upload-url') {
      const { fileName, mimeType } = await req.json();
      if (!fileName || !mimeType) throw new Error('fileName and mimeType are required');

      const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
      const objectPath = `${profile.equipe_id}/${crypto.randomUUID()}.${ext}`;
      const publicUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/agent-training-docs/${objectPath}`;

      return new Response(JSON.stringify({ uploadPath: objectPath, publicUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST actions (create, update, delete)
    const body = await req.json();

    // CREATE training
    if (action === 'create') {
      // Build the upstream body by type — do NOT force everything to TEXT.
      // DOCUMENT/WEBSITE/VIDEO have their own required fields (T0 §5, §7).
      let trainingBody: Record<string, unknown>;
      switch (body.type) {
        case 'DOCUMENT':
          trainingBody = {
            type: 'DOCUMENT',
            documentUrl: body.documentUrl,
            documentName: body.documentName,
            documentMimetype: body.documentMimetype,
          };
          break;
        case 'WEBSITE':
          trainingBody = { type: 'WEBSITE', website: body.website };
          break;
        case 'VIDEO':
          trainingBody = { type: 'VIDEO', video: body.video };
          break;
        default:
          trainingBody = { type: 'TEXT', text: body.text };
      }

      const res = await fetch(`${GPT_MAKER_BASE}/agent/${agentId}/trainings`, {
        method: 'POST',
        headers: gptHeaders,
        body: JSON.stringify(trainingBody),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker create error:', err);
        throw new Error(`Failed to create training: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UPDATE training
    if (action === 'update') {
      if (!body.trainingId) throw new Error('trainingId required');

      const res = await fetch(`${GPT_MAKER_BASE}/training/${body.trainingId}`, {
        method: 'PUT',
        headers: gptHeaders,
        body: JSON.stringify({
          type: body.type,
          text: body.text,
          image: body.image || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker update error:', err);
        throw new Error(`Failed to update training: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE training
    if (action === 'delete') {
      if (!body.trainingId) throw new Error('trainingId required');

      const res = await fetch(`${GPT_MAKER_BASE}/training/${body.trainingId}`, {
        method: 'DELETE',
        headers: gptHeaders,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker delete error:', err);
        throw new Error(`Failed to delete training: ${res.status}`);
      }

      // Remove from local cache
      await supabase
        .from('agent_trainings')
        .delete()
        .eq('gpt_training_id', body.trainingId);

      // If the client passes the training's documentUrl (it has it from the
      // list it rendered) and it points at our bucket, remove the Storage
      // object too so the bucket doesn't grow without bound. The cache table
      // has no document_url column, so we can't reconstruct it server-side.
      const documentUrl = body.documentUrl;
      const marker = `/agent-training-docs/`;
      const markerIndex = typeof documentUrl === 'string' ? documentUrl.indexOf(marker) : -1;
      if (markerIndex !== -1) {
        const objectPath = documentUrl.slice(markerIndex + marker.length);
        const { error: storageError } = await supabase
          .storage
          .from('agent-training-docs')
          .remove([objectPath]);
        if (storageError) {
          console.error('Storage object remove error:', storageError);
        } else {
          console.log(`Removed storage object: ${objectPath}`);
        }
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    const soloPrice = Number(Deno.env.get('SOLO_INSTANCE_MONTHLY_PRICE') || 100);

    // --- Auth: determine if service-role or user JWT ---
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const isServiceRole = authHeader.includes(supabaseServiceRoleKey);

    let authedEquipeId: string | null = null;

    if (!isServiceRole) {
      // User JWT path
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: authHeader },
        },
      });

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        throw new Error('Unauthorized');
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('equipe_id')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Profile not found');
      }

      authedEquipeId = profile.equipe_id;
    }

    // --- Parse body ---
    const { equipe_id } = await req.json();
    if (!equipe_id) {
      throw new Error('equipe_id is required');
    }

    // --- Auth check ---
    if (!isServiceRole && authedEquipeId !== equipe_id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: you can only reconcile your own team' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    // --- Build DB client ---
    const dbClient = createClient(
      supabaseUrl,
      isServiceRole ? supabaseServiceRoleKey : supabaseAnonKey,
      isServiceRole ? {} : { global: { headers: { Authorization: authHeader } } }
    );

    // --- 1. Load equipes row ---
    const { data: equipe, error: equipeError } = await dbClient
      .from('equipes')
      .select('asaas_subscription_id, plano_id')
      .eq('id', equipe_id)
      .single();

    if (equipeError || !equipe) {
      throw new Error('Team not found');
    }

    if (!equipe.asaas_subscription_id) {
      return new Response(
        JSON.stringify({ skipped: 'no_subscription' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // --- 2. Load planos row ---
    const { data: plano, error: planoError } = await dbClient
      .from('planos')
      .select('preco_mensal')
      .eq('id', equipe.plano_id)
      .single();

    if (planoError || !plano) {
      throw new Error('Plan not found');
    }

    // --- 3. Count active solo instances ---
    const { count, error: countError } = await dbClient
      .from('wpp_instances')
      .select('*', { count: 'exact', head: true })
      .eq('equipe_id', equipe_id)
      .eq('billing_active', true);

    if (countError) {
      throw new Error('Failed to count instances');
    }

    const instanceCount = count ?? 0;

    // --- 4. Calculate expected value ---
    const basePrice = Number(plano.preco_mensal);
    const expected = basePrice + instanceCount * soloPrice;

    // --- 5. Fetch current subscription from Asaas ---
    const subscriptionId = equipe.asaas_subscription_id;

    const getResponse = await fetch(
      `${ASAAS_API_URL}/subscriptions/${subscriptionId}`,
      {
        headers: { 'access_token': asaasApiKey },
      }
    );

    if (!getResponse.ok) {
      const errorData = await getResponse.text();
      console.error(`[InstanceBilling] Error fetching subscription ${subscriptionId}:`, errorData);
      throw new Error(`Failed to fetch subscription: ${errorData}`);
    }

    const subscriptionData = await getResponse.json();
    const currentValue = Number(subscriptionData.value);

    // --- 6. Reconcile if different ---
    if (currentValue !== expected) {
      console.log(
        `[InstanceBilling] equipe=${equipe_id} instances=${instanceCount} value ${currentValue}->${expected}`
      );

      const putResponse = await fetch(
        `${ASAAS_API_URL}/subscriptions/${subscriptionId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey,
          },
          body: JSON.stringify({
            value: expected,
            updatePendingPayments: false,
          }),
        }
      );

      if (!putResponse.ok) {
        const errorData = await putResponse.text();
        console.error(`[InstanceBilling] Error updating subscription ${subscriptionId}:`, errorData);
        throw new Error(`Failed to update subscription: ${errorData}`);
      }

      return new Response(
        JSON.stringify({
          reconciled: true,
          subscription_id: subscriptionId,
          previous_value: currentValue,
          new_value: expected,
          solo_instances: instanceCount,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // --- No change needed ---
    return new Response(
      JSON.stringify({
        reconciled: true,
        no_change: true,
        subscription_id: subscriptionId,
        previous_value: currentValue,
        new_value: expected,
        solo_instances: instanceCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[InstanceBilling] Fatal Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

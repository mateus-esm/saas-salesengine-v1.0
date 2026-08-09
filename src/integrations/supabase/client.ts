// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    `Configuração ausente: ${!supabaseUrl ? 'VITE_SUPABASE_URL' : ''}${!supabaseUrl && !supabaseKey ? ' e ' : ''}${!supabaseKey ? 'VITE_SUPABASE_ANON_KEY' : ''}. ` +
    `Defina as variáveis de ambiente no build (Netlify → Site settings → Environment variables).`
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
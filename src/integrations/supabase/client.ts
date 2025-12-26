// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

// O "Airbag": Se não encontrar as variáveis, usa uma string vazia para não quebrar o build
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";

// Log de segurança para você saber onde está rodando (abra o console F12)
if (supabaseUrl === "https://placeholder-url.supabase.co") {
  console.warn("⚠️ ALERTA: Chaves do Supabase não encontradas. O App vai abrir, mas não vai carregar dados.");
} else {
  console.log("✅ Supabase conectado em:", supabaseUrl);
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
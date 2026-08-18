import { createClient } from "@supabase/supabase-js";

// Estas dos claves se configuran como variables de entorno en Netlify
// (Site configuration → Environment variables), no se escriben acá directo.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

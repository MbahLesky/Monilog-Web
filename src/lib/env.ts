const rawEnv = import.meta.env;

export const env = {
  supabase: {
    url: rawEnv.VITE_SUPABASE_URL?.trim() ?? "",
    anonKey: rawEnv.VITE_SUPABASE_ANON_KEY?.trim() ?? ""
  },
  googleClientId: rawEnv.VITE_GOOGLE_CLIENT_ID?.trim() ?? "",
  appEnv: rawEnv.VITE_APP_ENV?.trim() ?? "development",
  enablePwa: rawEnv.VITE_ENABLE_PWA !== "false"
};

export const isSupabaseConfigured =
  env.supabase.url.length > 0 && env.supabase.anonKey.length > 0;

const rawEnv = import.meta.env;

const VERIFIED_SUPABASE_URL = "https://hvtoqnhfqwftbwqxgcbd.supabase.co";
const VERIFIED_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2dG9xbmhmcXdmdGJ3cXhnY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MDU5ODMsImV4cCI6MjA5OTM4MTk4M30.g9jpch5YmAMM_VuqEgWRqXHIsuQF0oe2hAWZQATZi9Q";
const VERIFIED_GOOGLE_CLIENT_ID =
  "719974512803-3td26n369dd67ueurmub54plggakm24r.apps.googleusercontent.com";

const DECOMMISSIONED_SUPABASE_REFS = ["tzdmojpwlycvklrbilyo", "your-project-ref"];
const DECOMMISSIONED_GOOGLE_CLIENTS = [
  "719974512803-ma49ncdnkq0m201udlu71bj9l563eb7g",
  "719974512803-mkb8bcncen03gojmha8dfqfa3bn6r3ag"
];

function resolveSupabaseConfig() {
  const candidateUrl = rawEnv.VITE_SUPABASE_URL?.trim() ?? "";
  const candidateKey = rawEnv.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  const isStaleOrEmpty =
    !candidateUrl ||
    !candidateKey ||
    DECOMMISSIONED_SUPABASE_REFS.some((ref) => candidateUrl.includes(ref));

  if (isStaleOrEmpty) {
    return {
      url: VERIFIED_SUPABASE_URL,
      anonKey: VERIFIED_SUPABASE_ANON_KEY
    };
  }

  return {
    url: candidateUrl,
    anonKey: candidateKey
  };
}

function resolveGoogleClientId() {
  const candidate = rawEnv.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
  if (
    !candidate ||
    DECOMMISSIONED_GOOGLE_CLIENTS.some((deadId) => candidate.includes(deadId))
  ) {
    return VERIFIED_GOOGLE_CLIENT_ID;
  }
  return candidate;
}

export const env = {
  supabase: resolveSupabaseConfig(),
  googleClientId: resolveGoogleClientId(),
  appEnv: rawEnv.VITE_APP_ENV?.trim() ?? "development",
  enablePwa: rawEnv.VITE_ENABLE_PWA !== "false"
};

export const isSupabaseConfigured =
  env.supabase.url.length > 0 && env.supabase.anonKey.length > 0;

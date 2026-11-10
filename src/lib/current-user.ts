import { supabase } from "@/lib/supabase-client";
import { useAuthStore } from "@/store/auth-store";

export async function getCurrentUserId(overrideId?: string | null): Promise<string | null> {
  if (overrideId) return overrideId;

  const storeUserId = useAuthStore.getState().user?.id;
  if (storeUserId) return storeUserId;

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

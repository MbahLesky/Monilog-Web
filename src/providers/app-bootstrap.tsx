import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";
import { initializeAnalytics } from "@/services/telemetry-service";
import { supabaseAuthService } from "@/services/supabase-auth-service";
import { isSupabaseConfigured } from "@/lib/env";
import { useLanguageSync } from "@/hooks/use-language-sync";

export function AppBootstrap() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const hydrateFromUser = useAuthStore((state) => state.hydrateFromUser);
  const userId = useAuthStore((state) => state.user?.id);
  const runNow = useSyncStore((state) => state.runNow);
  const refreshSync = useSyncStore((state) => state.refresh);
  const initRealtime = useSyncStore((state) => state.initRealtime);

  useLanguageSync();

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    const cleanup = initRealtime(userId);
    return cleanup;
  }, [initRealtime, userId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Started up front so a GA4 session exists before the first tracked event.
  useEffect(() => {
    void initializeAnalytics();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const unsubscribe = supabaseAuthService.onAuthStateChange((user) => {
      void hydrateFromUser(user);
    });

    return () => unsubscribe();
  }, [hydrateFromUser]);

  useEffect(() => {
    function handleConnectivityChange() {
      if (userId && navigator.onLine) {
        void runNow(userId);
        return;
      }

      void refreshSync();
    }

    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);

    return () => {
      window.removeEventListener("online", handleConnectivityChange);
      window.removeEventListener("offline", handleConnectivityChange);
    };
  }, [refreshSync, runNow, userId]);

  return null;
}

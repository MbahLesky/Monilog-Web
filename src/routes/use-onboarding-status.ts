import { useLiveQuery } from "@/lib/live-query";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { useAuthStore } from "@/store/auth-store";

export function useOnboardingStatus() {
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const profile = useAuthStore((state) => state.profile);
  const status = useAuthStore((state) => state.status);

  // If user has an existing completed profile in Supabase or local settings, onboarding is complete
  const isProfileComplete = Boolean(profile?.onboardingCompleted);
  const isSettingsComplete = Boolean(settings?.onboardingComplete);

  const complete = isProfileComplete || isSettingsComplete;
  const loading = status === "checking" || (settings === undefined && !complete);

  return {
    loading,
    complete
  };
}

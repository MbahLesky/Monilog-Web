import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { create } from "zustand";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { isSupabaseConfigured } from "@/lib/env";
import { identifyUser, trackEvent } from "@/services/telemetry-service";
import { supabaseAuthService } from "@/services/supabase-auth-service";
import { useSyncStore } from "@/store/sync-store";
import { notifyDatabaseChange } from "@/lib/live-query";
import type { Profile } from "@/types";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { syncRepository } from "@/db/repositories/sync-repository";
import { workspaceRepository } from "@/db/repositories/workspace-repository";
import { nowIso } from "@/utils/date-utils";

type AuthStatus = "checking" | "signed_out" | "signed_in";

let hydratingUserId: string | null = null;

interface AuthState {
  status: AuthStatus;
  isGuest: boolean;
  authAvailable: boolean;
  user: User | null;
  profile: Profile | null;
  error: string | null;
  notice: string | null;
  bootstrap: () => Promise<void>;
  hydrateFromUser: (user: User | null, options?: { isNewRegistration?: boolean }) => Promise<void>;
  continueAsGuest: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<void>;
  signInWithPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleCredential: (idToken: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (updates: Partial<Profile>) => Promise<void>;
  clearMessages: () => void;
}

function profileFromUser(user: User): Profile {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    user.email?.split("@")[0] ||
    user.phone ||
    "";
  const avatarUrl =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

  return {
    id: user.id,
    name,
    email: user.email ?? null,
    phoneNumber: user.phone ?? null,
    avatarUrl,
    onboardingCompleted: true,
    createdAt: user.created_at || nowIso(),
    updatedAt: nowIso()
  };
}

function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(
    profile &&
      ((profile.name && profile.name.trim().length > 0) ||
        (profile.phoneNumber && profile.phoneNumber.trim().length > 0) ||
        (profile.email && profile.email.trim().length > 0))
  );
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "checking",
  isGuest: false,
  authAvailable: isSupabaseConfigured,
  user: null,
  profile: null,
  error: null,
  notice: null,

  continueAsGuest: () => {
    set({
      status: "signed_out",
      isGuest: true,
      error: null,
      notice: null
    });
  },

  bootstrap: async () => {
    // Initial session is restored and managed by supabase.auth.onAuthStateChange
    if (isSupabaseConfigured) {
      const hasOAuthCallback =
        typeof window !== "undefined" &&
        (window.location.hash.includes("access_token=") ||
          window.location.search.includes("code="));

      const user = await supabaseAuthService.getCurrentUser();
      if (user) {
        await get().hydrateFromUser(user);
      } else if (!hasOAuthCallback) {
        set({ status: "signed_out" });
      }
    } else {
      set({ status: "signed_out" });
    }
  },

  hydrateFromUser: async (user, options) => {
    if (!user) {
      hydratingUserId = null;
      set((state) => ({
        status: "signed_out",
        isGuest: state.isGuest,
        user: null,
        profile: null
      }));
      return;
    }

    if (hydratingUserId === user.id || (get().status === "signed_in" && get().user?.id === user.id)) {
      return;
    }

    hydratingUserId = user.id;
    identifyUser(user.id);

    try {
      const existingSettings = await settingsRepository.getSettings();
      if (existingSettings.userId !== user.id) {
        await syncRepository.clearAll();
      }
      await workspaceRepository.releaseStaleOwnership(user.id);
      await useSyncStore.getState().runNow(user.id);
      if (!options?.isNewRegistration) {
        const currentSettings = await settingsRepository.getSettings();
        if (!currentSettings.onboardingComplete) {
          await settingsRepository.setOnboardingComplete(true);
        }
      }
    } catch {
      if (!options?.isNewRegistration) {
        try {
          await settingsRepository.setOnboardingComplete(true);
        } catch {
          // Ignore if DB unavailable
        }
      }
    } finally {
      hydratingUserId = null;
    }

    set({
      status: "signed_in",
      isGuest: false,
      user,
      profile: profileFromUser(user),
      error: null
    });
    notifyDatabaseChange();
  },

  signIn: async (email, password) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.signInStarted, { method: "email_password" });
    const user = await supabaseAuthService.signIn({ email, password });
    trackEvent(ANALYTICS_EVENTS.signInCompleted, { method: "email_password" });
    await get().hydrateFromUser(user);
  },

  signUp: async (fullName, email, password) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.signUpStarted, { method: "email_password" });
    const user = await supabaseAuthService.signUp({ fullName, email, password });

    toast.success("Account created", {
      description: `Welcome to Moniilog! A confirmation email has been sent if required.`
    });

    trackEvent(ANALYTICS_EVENTS.signUpCompleted, { method: "email_password" });
    await get().hydrateFromUser(user, { isNewRegistration: true });
  },

  signInWithPhoneOtp: async (phone: string) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.signInStarted, { method: "phone_otp" });
    await supabaseAuthService.signInWithPhoneOtp(phone);
    set({ notice: "6-digit verification code sent via SMS. Enter it below." });
  },

  verifyPhoneOtp: async (phone: string, token: string) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.signInCompleted, { method: "phone_otp" });
    const user = await supabaseAuthService.verifyPhoneOtp(phone, token);
    toast.success("Phone verified successfully!");
    await get().hydrateFromUser(user);
  },

  signInWithGoogle: async () => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.googleSignIn, { method: "oauth" });
    await supabaseAuthService.signInWithGoogle();
  },

  signInWithGoogleCredential: async (idToken: string) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.googleSignIn, { method: "one_tap" });
    const user = await supabaseAuthService.signInWithGoogleCredential(idToken);
    await get().hydrateFromUser(user);
  },

  resetPassword: async (email) => {
    set({ error: null, notice: null });
    await supabaseAuthService.sendPasswordReset(email);
    trackEvent(ANALYTICS_EVENTS.passwordResetRequested);
    set({ notice: "Password reset link sent. Check your inbox." });
  },

  signOut: async () => {
    if (isSupabaseConfigured) {
      await supabaseAuthService.signOut();
    }

    trackEvent(ANALYTICS_EVENTS.signOut);
    identifyUser(null);

    // Multi-tenant protection: Purge local database tables on sign-out
    await workspaceRepository.resetAppData();

    set({
      status: "signed_out",
      isGuest: false,
      user: null,
      profile: null,
      error: null,
      notice: null
    });
    notifyDatabaseChange();
  },

  saveProfile: async (updates) => {
    const currentUser = get().user;
    if (!currentUser) {
      throw new Error("You need an active session first.");
    }

    if (typeof updates.name === "string" && updates.name.trim()) {
      await supabaseAuthService.updateDisplayName(updates.name.trim());
    }

    set({
      profile: {
        ...profileFromUser(currentUser),
        ...get().profile,
        ...updates,
        updatedAt: nowIso()
      }
    });
  },

  clearMessages: () => set({ error: null, notice: null })
}));

export { isProfileComplete };

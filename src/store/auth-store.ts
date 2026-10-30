import type { User } from "firebase/auth";
import { toast } from "sonner";
import { create } from "zustand";
import { mapAuthError } from "@/features/auth/auth-errors";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { isFirebaseConfigured } from "@/lib/env";
import { identifyUser, trackEvent } from "@/services/firebase-analytics-service";
import { firebaseAuthService } from "@/services/firebase-auth-service";
import { useSyncStore } from "@/store/sync-store";
import type { Profile } from "@/types";
import { workspaceRepository } from "@/db/repositories/workspace-repository";
import { nowIso } from "@/utils/date-utils";

type AuthStatus = "checking" | "signed_out" | "signed_in";

interface AuthState {
  status: AuthStatus;
  authAvailable: boolean;
  user: User | null;
  profile: Profile | null;
  error: string | null;
  notice: string | null;
  bootstrap: () => Promise<void>;
  hydrateFromUser: (user: User | null) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleCredential: (idToken: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (updates: Partial<Profile>) => Promise<void>;
  clearMessages: () => void;
}

function profileFromUser(user: User): Profile {
  return {
    id: user.uid,
    name: user.displayName || "",
    email: user.email || "",
    phoneNumber: user.phoneNumber,
    avatarUrl: user.photoURL,
    updatedAt: nowIso()
  };
}

function isProfileComplete(profile: Profile | null) {
  return Boolean(profile && profile.name.trim().length > 0 && profile.email.trim().length > 0);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "checking",
  authAvailable: isFirebaseConfigured,
  user: null,
  profile: null,
  error: null,
  notice: null,

  bootstrap: async () => {
    // Initial auth state delivered via firebaseAuthService.onAuthStateChange
  },

  hydrateFromUser: async (user) => {
    if (!user) {
      set({
        status: "signed_out",
        user: null,
        profile: null
      });
      return;
    }

    identifyUser(user.uid);

    await workspaceRepository.releaseStaleOwnership(user.uid);
    await useSyncStore.getState().runNow(user.uid);
    await workspaceRepository.stampOwnership(user.uid);

    set({
      status: "signed_in",
      user,
      profile: profileFromUser(user),
      error: null
    });
  },

  signIn: async (email, password) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.signInStarted, { method: "email_password" });
    const user = await firebaseAuthService.signIn({ email, password });
    trackEvent(ANALYTICS_EVENTS.signInCompleted, { method: "email_password" });
    await get().hydrateFromUser(user);
  },

  signUp: async (fullName, email, password) => {
    set({ error: null, notice: null });
    trackEvent(ANALYTICS_EVENTS.signUpStarted, { method: "email_password" });
    const user = await firebaseAuthService.signUp({ fullName, email, password });

    const verificationSent = await firebaseAuthService.sendVerificationEmail();
    if (verificationSent) {
      toast.success("Account created", {
        description: `We sent a verification link to ${user.email ?? email}.`
      });
    }

    trackEvent(ANALYTICS_EVENTS.signUpCompleted, { method: "email_password" });
    await get().hydrateFromUser(user);
  },

  signInWithGoogle: async () => {
    set({ error: null, notice: null });
    const user = await firebaseAuthService.signInWithGoogle();
    trackEvent(ANALYTICS_EVENTS.googleSignIn, { method: "popup" });
    await get().hydrateFromUser(user);
  },

  signInWithGoogleCredential: async (idToken) => {
    set({ error: null, notice: null });
    try {
      const user = await firebaseAuthService.signInWithGoogleCredential(idToken);
      trackEvent(ANALYTICS_EVENTS.googleSignIn, { method: "one_tap" });
      await get().hydrateFromUser(user);
    } catch (error) {
      set({ error: mapAuthError(error) });
    }
  },

  resetPassword: async (email) => {
    set({ error: null, notice: null });
    await firebaseAuthService.sendPasswordReset(email);
    trackEvent(ANALYTICS_EVENTS.passwordResetRequested);
    set({ notice: "Password reset email sent. Check your inbox." });
  },

  signOut: async () => {
    if (isFirebaseConfigured) {
      await firebaseAuthService.signOut();
    }

    trackEvent(ANALYTICS_EVENTS.signOut);
    identifyUser(null);

    window.google?.accounts?.id?.disableAutoSelect();

    // Fix multi-user leakage: Purge local database tables on sign-out
    await workspaceRepository.resetAppData();

    set({
      status: "signed_out",
      user: null,
      profile: null,
      error: null,
      notice: null
    });
  },

  saveProfile: async (updates) => {
    const currentUser = get().user;
    if (!currentUser) {
      throw new Error("You need an active session first.");
    }

    if (typeof updates.name === "string" && updates.name.trim()) {
      await firebaseAuthService.updateDisplayName(updates.name.trim());
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

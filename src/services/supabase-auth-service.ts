import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-client";

export interface SignUpParams {
  fullName: string;
  email: string;
  password?: string;
}

export interface SignInParams {
  email: string;
  password?: string;
}

export interface AuthSessionCallback {
  (user: User | null, session: Session | null): void;
}

function assertSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}

export const supabaseAuthService = {
  async getCurrentUser(): Promise<User | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  },

  async signUp({ fullName, email, password }: SignUpParams): Promise<User> {
    const client = assertSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password: password ?? "",
      options: {
        data: {
          full_name: fullName,
          name: fullName
        }
      }
    });

    if (error || !data.user) {
      throw error ?? new Error("Sign up failed.");
    }

    return data.user;
  },

  async signIn({ email, password }: SignInParams): Promise<User> {
    const client = assertSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: password ?? ""
    });

    if (error || !data.user) {
      throw error ?? new Error("Sign in failed.");
    }

    return data.user;
  },

  async signInWithPhoneOtp(phone: string): Promise<void> {
    const client = assertSupabase();
    const { error } = await client.auth.signInWithOtp({
      phone: phone.trim()
    });

    if (error) {
      throw error;
    }
  },

  async verifyPhoneOtp(phone: string, token: string): Promise<User> {
    const client = assertSupabase();
    const { data, error } = await client.auth.verifyOtp({
      phone: phone.trim(),
      token: token.trim(),
      type: "sms"
    });

    if (error || !data.user) {
      throw error ?? new Error("OTP verification failed.");
    }

    return data.user;
  },

  async signInWithGoogle(): Promise<void> {
    const client = assertSupabase();
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });

    if (error) {
      throw error;
    }
  },

  async signInWithGoogleCredential(idToken: string): Promise<User> {
    const client = assertSupabase();
    const { data, error } = await client.auth.signInWithIdToken({
      provider: "google",
      token: idToken
    });

    if (error || !data.user) {
      throw error ?? new Error("Google credential sign-in failed.");
    }

    return data.user;
  },

  async sendPasswordReset(email: string): Promise<void> {
    const client = assertSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      throw error;
    }
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  async updateDisplayName(name: string): Promise<void> {
    const client = assertSupabase();
    const { data, error } = await client.auth.updateUser({
      data: { full_name: name, name }
    });

    if (error) throw error;

    if (data.user) {
      await client
        .from("profiles")
        .update({ display_name: name })
        .eq("id", data.user.id);
    }
  },

  onAuthStateChange(callback: AuthSessionCallback): () => void {
    if (!supabase) {
      callback(null, null);
      return () => {};
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        callback(session?.user ?? null, session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }
};

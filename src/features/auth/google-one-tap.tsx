import { useEffect, useRef } from "react";
import { env, isSupabaseConfigured } from "@/lib/env";
import { useAuthStore } from "@/store/auth-store";

const GSI_SRC = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<void> | null = null;

// Loads Google Identity Services once per page, reusing the in-flight promise so
// remounts (login <-> register) never inject a second script tag.
function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")));

    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

/**
 * Renders nothing; shows Google's One Tap prompt while the visitor is signed out.
 * Silently does nothing when VITE_GOOGLE_CLIENT_ID is unset, so local setups
 * without an OAuth client still get the rest of the auth screen.
 */
export function GoogleOneTap() {
  const status = useAuthStore((state) => state.status);
  const signInWithGoogleCredential = useAuthStore((state) => state.signInWithGoogleCredential);
  const initializedRef = useRef(false);

  useEffect(() => {
    const clientId = env.googleClientId;
    if (!clientId || !isSupabaseConfigured) {
      return;
    }

    if (status !== "signed_out") {
      // Signed in, or still restoring a session — never prompt over either.
      window.google?.accounts?.id?.cancel();
      return;
    }

    let cancelled = false;

    loadGsiScript()
      .then(() => {
        const googleId = window.google?.accounts?.id;
        if (cancelled || !googleId) {
          return;
        }

        if (!initializedRef.current) {
          googleId.initialize({
            client_id: clientId,
            auto_select: true,
            cancel_on_tap_outside: false,
            use_fedcm_for_prompt: true,
            context: "signin",
            callback: (response) => {
              void signInWithGoogleCredential(response.credential);
            }
          });
          initializedRef.current = true;
        }

        googleId.prompt();
      })
      .catch((error: unknown) => {
        // One Tap is an accelerator; the email/password and popup paths still
        // work, so a load failure is logged rather than shown to the user.
        console.error("Google One Tap unavailable:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [signInWithGoogleCredential, status]);

  return null;
}

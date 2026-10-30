import { useEffect, useState } from "react";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handlePrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  async function promptToInstall() {
    if (!deferredPrompt) {
      return null;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    trackEvent(ANALYTICS_EVENTS.installPromptResult, {
      outcome: choice.outcome,
      platform: choice.platform
    });
    setDeferredPrompt(null);
    return choice;
  }

  return {
    canInstall: Boolean(deferredPrompt),
    promptToInstall
  };
}


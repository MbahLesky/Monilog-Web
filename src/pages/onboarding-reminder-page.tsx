import { useLiveQuery } from "dexie-react-hooks";
import { BellRing, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { useReminderPermission } from "@/hooks/use-reminder-permission";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";
import { ROUTES } from "@/routes/route-constants";

export function OnboardingReminderPage() {
  const navigate = useNavigate();
  const preferences = useLiveQuery(() => settingsRepository.getNotificationPreferences(), []);
  const { permission, requestPermission } = useReminderPermission();

  async function finishOnboarding() {
    await settingsRepository.setOnboardingComplete(true);
    trackEvent(ANALYTICS_EVENTS.onboardingStepCompleted, { step: "reminder" });
    trackEvent(ANALYTICS_EVENTS.onboardingCompleted, {
      reminders_enabled: Boolean(preferences?.enabled)
    });
    toast.success("Setup complete.");
    navigate(ROUTES.dashboard);
  }

  async function handleContinue() {
    if (preferences?.enabled && permission === "default") {
      await requestPermission();
    }

    await finishOnboarding();
  }

  return (
    <div className="container py-10">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary">Onboarding</p>
          <h1 className="text-4xl font-bold">Stay on Track</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Reminder preferences are saved in your local workspace and cloud profile continuity, while actual delivery depends on browser support.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <CardContent className="grid gap-6 p-6">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-card p-4">
                <div className="space-y-1">
                  <p className="font-semibold">Daily reminder</p>
                  <p className="text-sm text-muted-foreground">
                    Keep a light daily nudge visible without turning the product into noise.
                  </p>
                </div>
                <Switch
                  checked={preferences?.enabled ?? false}
                  onCheckedChange={(enabled) =>
                    void settingsRepository.updateNotificationPreferences({
                      enabled
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold" htmlFor="reminderTime">
                  Reminder time
                </label>
                <Input
                  id="reminderTime"
                  type="time"
                  value={preferences?.reminderTime ?? "20:00"}
                  disabled={!preferences?.enabled}
                  onChange={(event) =>
                    void settingsRepository.updateNotificationPreferences({
                      reminderTime: event.target.value
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" onClick={finishOnboarding}>
                  Skip for now
                </Button>
                <Button type="button" onClick={handleContinue}>
                  Finish setup
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary text-primary-foreground">
            <CardContent className="grid gap-5 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12">
                <BellRing className="size-5" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold">Browser reminder guidance</h2>
                <p className="text-sm leading-6 text-primary-foreground/84">
                  Permission state: <span className="font-semibold">{permission}</span>. If background notifications are limited on your platform, Moniilog still keeps the preference and can fall back to in-app guidance later.
                </p>
              </div>
              <div className="rounded-xl bg-white/12 p-4 text-sm text-primary-foreground/88">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  Light mode stays the default product experience, but theme preferences remain available later in Settings.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

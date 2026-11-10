import { useLiveQuery } from "@/lib/live-query";
import { ArrowRight, DownloadCloud, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";
import { ROUTES } from "@/routes/route-constants";
import { trackEvent } from "@/services/telemetry-service";
import { settingsRepository } from "@/db/repositories/settings-repository";

export function OnboardingCurrencyPage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);

  async function chooseCurrency(currencyCode: string) {
    await settingsRepository.setCurrency(currencyCode);
  }

  function continueTo(path: string) {
    if (!settings?.currencyCode) {
      toast.error("Choose a currency before you continue.");
      return;
    }

    trackEvent(ANALYTICS_EVENTS.onboardingStepCompleted, {
      step: "currency",
      currency: settings.currencyCode
    });
    navigate(path);
  }

  return (
    <div className="container py-10">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary">Onboarding</p>
          <h1 className="text-4xl font-bold">Choose Your Currency</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Your selected currency will carry across balances, dashboard totals, transaction entry, analytics, and export views.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SUPPORTED_CURRENCIES.map((currency) => {
            const isSelected = settings?.currencyCode === currency.code;
            return (
              <button
                key={currency.code}
                type="button"
                onClick={() => void chooseCurrency(currency.code)}
                className={`rounded-xl border p-5 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-card"
                    : "border-border/70 bg-card hover:border-primary/30 hover:bg-primary/5"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
                  {currency.code}
                </p>
                <p className="mt-3 text-xl font-semibold">{currency.label}</p>
                <p className="mt-2 text-sm opacity-85">{currency.symbol}</p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-card/92">
            <CardContent className="grid gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Wallet className="size-5" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Start fresh</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Create your opening balances first, then finish reminders before you land in the dashboard.
                </p>
              </div>
              <Button onClick={() => void continueTo(ROUTES.onboardingBalances)}>
                Start fresh
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/92">
            <CardContent className="grid gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/12 text-secondary">
                <DownloadCloud className="size-5" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Import existing records</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Bring in your historical CSV first, preview the rows safely, then continue to opening balances.
                </p>
              </div>
              <Button variant="secondary" onClick={() => void continueTo(ROUTES.onboardingImport)}>
                Import existing records
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

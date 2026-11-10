import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useLiveQuery } from "@/lib/live-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { FieldShell } from "@/components/forms/field-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { ROUTES } from "@/routes/route-constants";
import { trackEvent } from "@/services/telemetry-service";
import { useAuthStore } from "@/store/auth-store";

interface BalanceFormValues {
  rows: Array<{
    id?: string;
    name: string;
    balance: string;
    isDefault: boolean;
  }>;
}

export function OnboardingBalancesPage() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []);
  const form = useForm<BalanceFormValues>({
    defaultValues: {
      rows: []
    }
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "rows"
  });

  useEffect(() => {
    if (!accounts) {
      return;
    }

    const mappedRows = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      balance: account.openingBalance.toString(),
      isDefault: account.isDefault
    }));

    mappedRows.push({
      id: "",
      name: "",
      balance: "0",
      isDefault: false
    });

    form.reset({ rows: mappedRows });
  }, [accounts, form]);

  async function handleContinue(values: BalanceFormValues) {
    const newRows = values.rows.filter((row) => !row.id && row.name.trim().length > 0);
    const invalidUnnamedRow = values.rows.find(
      (row) => !row.id && row.name.trim().length === 0 && Number(row.balance) !== 0
    );

    if (invalidUnnamedRow) {
      toast.error("Give each custom account a name before you save it.");
      return;
    }

    for (const row of newRows) {
      await accountsRepository.createAccount({
        name: row.name,
        type: "other",
        openingBalance: Number(row.balance || 0),
        userId
      });
    }

    const existingRows = values.rows.filter((row) => row.id);
    await accountsRepository.saveOpeningBalances(
      existingRows.map((row) => ({
        id: row.id!,
        balance: Number(row.balance || 0)
      }))
    );

    toast.success("Starting balances saved.");
    // Counts only — no balance figures leave the device.
    trackEvent(ANALYTICS_EVENTS.onboardingStepCompleted, {
      step: "balances",
      accounts_created: newRows.length,
      accounts_updated: existingRows.length
    });
    navigate(ROUTES.onboardingReminder);
  }

  return (
    <div className="container py-10">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary">Onboarding</p>
          <h1 className="text-4xl font-bold">Set Your Starting Balances</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Cash and Bank always stay visible. Add custom balance containers like MoMo, Wallet, or Savings if you use them.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-5 p-6">
            <form className="grid gap-5" onSubmit={form.handleSubmit(handleContinue)}>
              {fieldArray.fields.map((field, index) => (
                <div key={field.id} className="grid gap-4 rounded-xl border border-border/70 p-4 md:grid-cols-[1.4fr,1fr]">
                  <FieldShell
                    label={field.isDefault ? "Account" : index === fieldArray.fields.length - 1 ? "Custom account" : "Imported or custom account"}
                    htmlFor={`rows.${index}.name`}
                  >
                    <Input
                      id={`rows.${index}.name`}
                      placeholder={field.isDefault ? "" : "e.g. MoMo"}
                      disabled={field.isDefault}
                      {...form.register(`rows.${index}.name`)}
                    />
                  </FieldShell>
                  <FieldShell label="Opening balance" htmlFor={`rows.${index}.balance`}>
                    <Input
                      id={`rows.${index}.balance`}
                      type="number"
                      step="0.01"
                      {...form.register(`rows.${index}.balance`)}
                    />
                  </FieldShell>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  fieldArray.append({
                    id: "",
                    name: "",
                    balance: "0",
                    isDefault: false
                  })
                }
              >
                Add another custom account
              </Button>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => navigate(ROUTES.onboardingReminder)}>
                  Skip for now
                </Button>
                <Button type="submit" isLoading={form.formState.isSubmitting}>
                  Continue
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

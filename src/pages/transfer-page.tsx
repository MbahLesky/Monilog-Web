import { ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { TransferForm } from "@/features/transfers/transfer-form";
import { useAuthStore } from "@/store/auth-store";

export function TransferPage() {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return (
    <PageShell
      title="Transfer money"
      description="Move funds between your own accounts without classifying the movement as income or expense."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Transfer details</CardTitle>
            <CardDescription>
              Transfers move funds from one account to another. Fees reduce the source account and are counted separately from transfer amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransferForm userId={userId} />
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-foreground/16">
                <ArrowRightLeft className="size-4" />
              </div>
              <CardTitle className="text-primary-foreground">How transfers affect balances</CardTitle>
            </div>
            <CardDescription className="text-primary-foreground/84">
              Moniilog keeps transfers separate from income and expense records while preserving accurate balances.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-primary-foreground/88">
            <p>1. Source account decreases by amount plus fee.</p>
            <p>2. Destination account increases by amount.</p>
            <p>3. Transfer amount is excluded from income and expense totals.</p>
            <p>4. Transfer fees contribute to expense-side analytics impact.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

import { ArrowRightLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { TransactionForm } from "@/features/transactions/transaction-form";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";

export function AddTransactionPage() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return (
    <PageShell
      title="Add transaction"
      description="Capture income or expense records quickly with the same local-first path that powers dashboard totals and analytics."
      action={
        <Button variant="outline" onClick={() => navigate(ROUTES.transfer)}>
          <ArrowRightLeft className="size-4" />
          Transfer money instead
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Manual entry</CardTitle>
            <CardDescription>
              Amount, type, category, account, note, and date are validated before Moniilog saves locally.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransactionForm userId={userId} />
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="text-primary-foreground">How this save works</CardTitle>
            <CardDescription className="text-primary-foreground/84">
              The UI writes into IndexedDB first so transaction entry stays fast and available offline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-primary-foreground/88">
            <p>1. The form validates the amount, type, category, account, and date.</p>
            <p>2. The transaction is stored locally as the ledger source of truth.</p>
            <p>3. A sync outbox entry is queued for the authenticated browser session.</p>
            <p>4. The dashboard and analytics update from the stored local data right away.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

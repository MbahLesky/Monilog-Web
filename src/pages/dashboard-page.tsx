import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRightLeft,
  ArrowRight,
  ChartPie,
  CreditCard,
  Plus,
  ReceiptText,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/data-display/empty-state";
import { MetricCard } from "@/components/data-display/metric-card";
import { SyncBanner } from "@/components/data-display/sync-banner";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardRepository } from "@/db/repositories/dashboard-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";
import { formatCurrency } from "@/utils/formatting";

export function DashboardPage() {
  const navigate = useNavigate();
  const dashboard = useLiveQuery(() => dashboardRepository.getSnapshot(), []);
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const syncState = useSyncStatus();
  const isOnline = useNetworkStatus();
  const userId = useAuthStore((state) => state.user?.id);
  const selectedCurrencyCode = settings?.currencyCode ?? "XAF";

  const hasTransactions = (dashboard?.recentTransactions.length ?? 0) > 0;

  return (
    <PageShell
      title="Dashboard"
      description="See your current balance, quick totals, accounts, and the latest activity without waiting on a remote round trip."
      action={
        <Button onClick={() => navigate(ROUTES.addTransaction)}>
          <Plus className="size-4" />
          Add transaction
        </Button>
      }
    >
      <SyncBanner
        pending={syncState.pending}
        failed={syncState.failed}
        processing={syncState.processing}
        lastSyncedAt={syncState.lastSyncedAt}
        isOnline={isOnline}
        onRetry={userId ? () => void syncState.runNow(userId) : undefined}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Current balance"
          value={formatCurrency(dashboard?.currentBalance ?? 0, selectedCurrencyCode)}
          icon={CreditCard}
          trendLabel="Across all active accounts"
        />
        <MetricCard
          label="Total income"
          value={formatCurrency(dashboard?.totalIncome ?? 0, selectedCurrencyCode)}
          icon={TrendingUp}
          tone="secondary"
          trendLabel="Stored locally first"
        />
        <MetricCard
          label="Total expenses"
          value={formatCurrency(dashboard?.totalExpenses ?? 0, selectedCurrencyCode)}
          icon={TrendingDown}
          tone="accent"
          trendLabel="Expense ledger total"
        />
        <MetricCard
          label="Today's spending"
          value={formatCurrency(dashboard?.todaySpending ?? 0, selectedCurrencyCode)}
          icon={ReceiptText}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="justify-between" onClick={() => navigate(ROUTES.transfer)}>
              Transfer money
              <ArrowRightLeft className="size-4" />
            </Button>
            <Button variant="outline" className="justify-between" onClick={() => navigate(ROUTES.transactions)}>
              History
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" className="justify-between" onClick={() => navigate(ROUTES.analytics)}>
              Analytics
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" className="justify-between" onClick={() => navigate(ROUTES.importData)}>
              Import data
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" className="justify-between" onClick={() => navigate(ROUTES.exportData)}>
              Export data
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {dashboard?.accountSummaries.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded-xl border border-border/70 p-4">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{account.type.replace("_", " ")}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(account.currentBalance, selectedCurrencyCode)}</p>
                  <p className="text-xs text-muted-foreground">
                    Opening {formatCurrency(account.openingBalance, selectedCurrencyCode)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {hasTransactions ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent transactions</CardTitle>
            <Button variant="ghost" onClick={() => navigate(ROUTES.transactions)}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {dashboard?.recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{transaction.categoryName}</p>
                  <p className="text-sm text-muted-foreground">
                    {transaction.accountName} • {transaction.description || "No note"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${transaction.type === "income" ? "text-secondary" : "text-accent"}`}>
                    {transaction.type === "income" ? "+" : "-"}
                    {formatCurrency(transaction.amount, transaction.accountCurrencyCode)}
                  </p>
                  <p className="text-xs text-muted-foreground">{transaction.transactionDate.slice(0, 10)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={ChartPie}
          title="Your dashboard is ready for real data"
          description="Zero balances are shown correctly. Add your first income or expense to get started, or import a CSV to populate history."
          actionLabel="Add transaction"
          onAction={() => navigate(ROUTES.addTransaction)}
        />
      )}
    </PageShell>
  );
}

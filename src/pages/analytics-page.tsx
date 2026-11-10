import { useMemo, useState } from "react";
import { useLiveQuery } from "@/lib/live-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EmptyState } from "@/components/data-display/empty-state";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BudgetManager } from "@/components/budget/budget-manager";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { formatShortDate } from "@/utils/date-utils";
import { formatCurrency } from "@/utils/formatting";
import {
  BarChart3,
  Landmark,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Wallet
} from "lucide-react";
import { analyticsService } from "@/services/analytics-service";

const CHART_COLORS = ["#173B7A", "#0F8C83", "#E1644C", "#4B6FAF", "#57B9B1", "#F39A87"];

type RangePreset = "7d" | "30d" | "90d" | "180d" | "1y" | "all" | "custom";
type AnalyticsViewMode = "overview" | "categories" | "accounts" | "budgets";

export function AnalyticsPage() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("90d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("overview");

  const resolvedRange = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    if (rangePreset === "all") return { startDate: null, endDate: null };
    if (rangePreset === "custom") {
      return { startDate: customStart || null, endDate: customEnd || null };
    }
    const daysMap: Record<Exclude<RangePreset, "all" | "custom">, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "180d": 180,
      "1y": 365
    };
    const days = daysMap[rangePreset];
    const startIso = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return { startDate: startIso, endDate: todayIso };
  }, [rangePreset, customStart, customEnd]);

  const allTransactions = useLiveQuery(() => transactionsRepository.listWithRelations(), []);
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []);
  const analytics = useLiveQuery(
    () =>
      analyticsService.getSnapshots({
        startDate: resolvedRange.startDate,
        endDate: resolvedRange.endDate,
        accountId,
        typeFilter
      }),
    [resolvedRange.startDate, resolvedRange.endDate, accountId, typeFilter]
  );
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const selectedCurrencyCode = settings?.currencyCode ?? "XAF";

  const averageExpense = useMemo(() => {
    const expenses = (allTransactions ?? []).filter((transaction) => transaction.type === "expense");
    if (expenses.length === 0) {
      return 0;
    }

    return expenses.reduce((sum, transaction) => sum + transaction.amount, 0) / expenses.length;
  }, [allTransactions]);

  if ((allTransactions ?? []).length === 0) {
    return (
      <PageShell
        title="Analytics"
        description="Derived charts and breakdowns read from your stored local transactions, not from separate summary tables."
      >
        <EmptyState
          icon={LineChartIcon}
          title="Analytics will appear as soon as you have data"
          description="Add transactions or import a CSV first. Moniilog handles empty analytics safely and keeps the starter state useful."
        />
      </PageShell>
    );
  }

  const expenseCatTotal = (analytics?.categoryBreakdown ?? []).reduce(
    (sum, item) => sum + item.value,
    0
  );
  const incomeCatTotal = (analytics?.incomeCategoryBreakdown ?? []).reduce(
    (sum, item) => sum + item.value,
    0
  );

  return (
    <PageShell
      title="Analytics & Financial Insights"
      description="Filter by date range, account, or transaction type and switch between Overview, Category Breakdown, Account Activity, and Budgets."
    >
      {/* Filters Bar */}
      <Card>
        <CardContent className="grid gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "7d", label: "7D" },
                  { id: "30d", label: "30D" },
                  { id: "90d", label: "90D" },
                  { id: "180d", label: "180D" },
                  { id: "1y", label: "1Y" },
                  { id: "all", label: "All Time" },
                  { id: "custom", label: "Custom Range" }
                ] as Array<{ id: RangePreset; label: string }>
              ).map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={rangePreset === preset.id ? "primary" : "outline"}
                  onClick={() => setRangePreset(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44">
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {(accounts ?? []).map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-40">
                <Select
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter(v as "all" | "income" | "expense")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="expense">Expenses Only</SelectItem>
                    <SelectItem value="income">Income Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {rangePreset === "custom" ? (
            <div className="grid gap-3 pt-2 sm:grid-cols-2 md:max-w-md">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">From Date</label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">To Date</label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* View Mode Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={viewMode === "overview" ? "primary" : "outline"}
          onClick={() => setViewMode("overview")}
        >
          <BarChart3 className="size-4" />
          Overview & Trends
        </Button>
        <Button
          variant={viewMode === "categories" ? "primary" : "outline"}
          onClick={() => setViewMode("categories")}
        >
          <PieChartIcon className="size-4" />
          Categories (Expense & Income)
        </Button>
        <Button
          variant={viewMode === "accounts" ? "primary" : "outline"}
          onClick={() => setViewMode("accounts")}
        >
          <Landmark className="size-4" />
          Account Activity & Top Transactions
        </Button>
        <Button
          variant={viewMode === "budgets" ? "primary" : "outline"}
          onClick={() => setViewMode("budgets")}
        >
          <Wallet className="size-4" />
          Budgets
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total income</p>
            <p className="mt-2 text-2xl font-bold text-secondary">
              {formatCurrency(analytics?.totals.income ?? 0, selectedCurrencyCode)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Filtered period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total expenses</p>
            <p className="mt-2 text-2xl font-bold text-accent">
              {formatCurrency(analytics?.totals.expense ?? 0, selectedCurrencyCode)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Includes transfer fees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Net cashflow</p>
            <p className="mt-2 text-2xl font-bold text-primary">
              {formatCurrency(analytics?.totals.net ?? 0, selectedCurrencyCode)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Savings rate: {(analytics?.totals.savingsRate ?? 0).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Average expense</p>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(averageExpense, selectedCurrencyCode)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Transfers: {formatCurrency(analytics?.totals.transferVolume ?? 0, selectedCurrencyCode)}
            </p>
          </CardContent>
        </Card>
      </div>

      {viewMode === "overview" && (
        <>
          <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Income vs Expense Trend</CardTitle>
                <CardDescription>Area comparison across active months</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.monthlyTrend ?? []}>
                    <defs>
                      <linearGradient id="incomeFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#0F8C83" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#0F8C83" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="expenseFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#E1644C" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#E1644C" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value) => `${value}`} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value: number) => formatCurrency(value, selectedCurrencyCode)} />
                    <Area
                      type="monotone"
                      dataKey="income"
                      stroke="#0F8C83"
                      fill="url(#incomeFill)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="expense"
                      stroke="#E1644C"
                      fill="url(#expenseFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expense by Category</CardTitle>
                <CardDescription>Share of spending in selected period</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(analytics?.categoryBreakdown ?? []).slice(0, 6)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {(analytics?.categoryBreakdown ?? [])
                        .slice(0, 6)
                        .map((entry: { name: string; value: number }, index: number) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value, selectedCurrencyCode)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Net Cashflow (Income − Expense)</CardTitle>
              <CardDescription>Net surplus or deficit recorded each month</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.monthlyTrend ?? []}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: number) => formatCurrency(value, selectedCurrencyCode)} />
                  <Bar dataKey="net" fill="#173B7A" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {viewMode === "categories" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Expense Categories</CardTitle>
              <CardDescription>
                Ranked breakdown of expenses ({formatCurrency(expenseCatTotal, selectedCurrencyCode)} total)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {(analytics?.categoryBreakdown ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses in the selected filter range.</p>
              ) : (
                analytics?.categoryBreakdown.map((item, idx) => {
                  const pct = expenseCatTotal > 0 ? (item.value / expenseCatTotal) * 100 : 0;
                  const color = CHART_COLORS[idx % CHART_COLORS.length];
                  return (
                    <div key={item.name} className="grid gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">
                          {item.name}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({item.count} tx)
                          </span>
                        </span>
                        <span className="font-semibold">
                          {pct.toFixed(1)}% • {formatCurrency(item.value, selectedCurrencyCode)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Income Categories</CardTitle>
              <CardDescription>
                Ranked breakdown of income sources ({formatCurrency(incomeCatTotal, selectedCurrencyCode)} total)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {(analytics?.incomeCategoryBreakdown ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No income recorded in the selected filter range.</p>
              ) : (
                analytics?.incomeCategoryBreakdown.map((item, idx) => {
                  const pct = incomeCatTotal > 0 ? (item.value / incomeCatTotal) * 100 : 0;
                  const color = CHART_COLORS[(idx + 1) % CHART_COLORS.length];
                  return (
                    <div key={item.name} className="grid gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">
                          {item.name}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({item.count} tx)
                          </span>
                        </span>
                        <span className="font-semibold">
                          {pct.toFixed(1)}% • {formatCurrency(item.value, selectedCurrencyCode)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === "accounts" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account Cashflow Breakdown</CardTitle>
              <CardDescription>Income, expenses, transfers, and live balance per account</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(analytics?.accountBreakdown ?? []).map((acc) => (
                <div
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-4"
                >
                  <div>
                    <p className="font-semibold">{acc.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      In: {formatCurrency(acc.income, selectedCurrencyCode)} • Out:{" "}
                      {formatCurrency(acc.expense, selectedCurrencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Transfers In: {formatCurrency(acc.transferIn, selectedCurrencyCode)} • Out:{" "}
                      {formatCurrency(acc.transferOut, selectedCurrencyCode)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Current Balance</p>
                    <p className="text-base font-bold text-primary">
                      {formatCurrency(acc.balance, selectedCurrencyCode)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Transactions in Period</CardTitle>
              <CardDescription>Largest single transactions matching your filters</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(analytics?.topTransactions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching transactions in this period.</p>
              ) : (
                analytics?.topTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-xl border border-border/70 p-3.5"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="font-semibold truncate">
                        {tx.description || tx.categoryName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.categoryName} • {tx.accountName} • {formatShortDate(tx.transactionDate)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-bold ${
                        tx.type === "income" ? "text-secondary" : "text-accent"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "-"}
                      {formatCurrency(tx.amount, selectedCurrencyCode)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === "budgets" && (
        <div className="mt-2">
          <BudgetManager currencyCode={selectedCurrencyCode} />
        </div>
      )}
    </PageShell>
  );
}

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Area,
  AreaChart,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetManager } from "@/components/budget/budget-manager";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { formatCurrency } from "@/utils/formatting";
import { LineChart as LineChartIcon } from "lucide-react";
import { analyticsService } from "@/services/analytics-service";

const CHART_COLORS = ["#173B7A", "#0F8C83", "#E1644C", "#4B6FAF", "#57B9B1", "#F39A87"];

export function AnalyticsPage() {
  const transactions = useLiveQuery(() => transactionsRepository.listWithRelations(), []);
  const analytics = useLiveQuery(() => analyticsService.getSnapshots(), []);
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const selectedCurrencyCode = settings?.currencyCode ?? "USD";

  const averageExpense = useMemo(() => {
    const expenses = (transactions ?? []).filter((transaction) => transaction.type === "expense");
    if (expenses.length === 0) {
      return 0;
    }

    return expenses.reduce((sum, transaction) => sum + transaction.amount, 0) / expenses.length;
  }, [transactions]);

  if ((transactions ?? []).length === 0) {
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

  return (
    <PageShell
      title="Analytics"
      description="Review monthly trends and expense concentration from the same local transaction source that drives the dashboard."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total income</p>
            <p className="mt-2 text-3xl font-bold text-secondary">
              {formatCurrency(analytics?.totals.income ?? 0, selectedCurrencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total expenses</p>
            <p className="mt-2 text-3xl font-bold text-accent">
              {formatCurrency(analytics?.totals.expense ?? 0, selectedCurrencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Average expense</p>
            <p className="mt-2 text-3xl font-bold">{formatCurrency(averageExpense, selectedCurrencyCode)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Monthly trend</CardTitle>
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
                <Area type="monotone" dataKey="income" stroke="#0F8C83" fill="url(#incomeFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#E1644C" fill="url(#expenseFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense by category</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics?.categoryBreakdown ?? []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {(analytics?.categoryBreakdown ?? []).map((entry: { name: string; value: number }, index: number) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value, selectedCurrencyCode)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <BudgetManager currencyCode={selectedCurrencyCode} />
      </div>
    </PageShell>
  );
}

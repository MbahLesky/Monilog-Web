import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, CheckCircle2, Plus, Target, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { budgetsRepository } from "@/db/repositories/budgets-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { useAuthStore } from "@/store/auth-store";
import type { BudgetPeriod, Category } from "@/types";
import { formatCurrency } from "@/utils/formatting";

interface BudgetManagerProps {
  currencyCode: string;
}

export function BudgetManager({ currencyCode }: BudgetManagerProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const budgets = useLiveQuery(() => budgetsRepository.listActive(userId), [userId]) ?? [];
  const categories = useLiveQuery(() => categoriesRepository.listByType("expense"), []) ?? [];
  const transactions = useLiveQuery(() => transactionsRepository.listWithRelations(), []) ?? [];

  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progresses = budgetsRepository.calculateProgress(budgets, transactions);

  const categoryMap = new Map<string, string>(categories.map((c: Category) => [c.id, c.name]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!selectedCategory || isNaN(parsedAmount) || parsedAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await budgetsRepository.upsertBudget({
        categoryId: selectedCategory,
        amount: parsedAmount,
        period,
        userId: userId ?? null
      });
      setOpen(false);
      setSelectedCategory("");
      setAmount("");
      setPeriod("monthly");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await budgetsRepository.deleteBudget(id);
  };

  return (
    <Card className="border border-border/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Target className="size-5 text-primary" />
            Category Budgets
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Keep your spending under control with real-time target limits.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Plus className="size-3.5" />
              Set Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Set Category Budget</DialogTitle>
                <DialogDescription>
                  Define a maximum spending threshold for a category.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Expense Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory} required>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat: Category) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Budget Limit ({currencyCode})</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="any"
                    min="1"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="period">Period</Label>
                  <Select value={period} onValueChange={(v) => setPeriod(v as BudgetPeriod)}>
                    <SelectTrigger id="period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !selectedCategory || !amount}>
                  {isSubmitting ? "Saving..." : "Save Budget"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        {progresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-6 text-center">
            <Target className="size-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm font-medium text-foreground">No budgets set yet</p>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Add monthly spending limits for food, transport, or bills to get proactive warnings.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {progresses.map(({ budget, spent, remaining, percentage, isOverBudget }) => {
              const catName = categoryMap.get(budget.categoryId) ?? "Category";
              const isWarning = percentage >= 80 && !isOverBudget;

              return (
                <div
                  key={budget.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-semibold text-foreground">{String(catName)}</span>
                      <span className="ml-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {budget.period}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isOverBudget ? (
                        <Badge variant="accent" className="text-[10px] gap-1 px-1.5 py-0.5">
                          <AlertCircle className="size-3" /> Exceeded
                        </Badge>
                      ) : isWarning ? (
                        <Badge variant="default" className="text-[10px] gap-1 px-1.5 py-0.5">
                          {percentage}%
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px] gap-1 px-1.5 py-0.5">
                          <CheckCircle2 className="size-3 text-emerald-500" /> On Track
                        </Badge>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-60 hover:opacity-100 text-muted-foreground hover:text-accent"
                        onClick={() => handleDelete(budget.id)}
                        title="Delete Budget"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">
                        {formatCurrency(spent, currencyCode)}
                      </span>
                      <span className="text-muted-foreground">
                        of {formatCurrency(budget.amount, currencyCode)}
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isOverBudget
                            ? "bg-rose-500"
                            : isWarning
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{percentage}% used</span>
                      <span>
                        {isOverBudget
                          ? `${formatCurrency(spent - budget.amount, currencyCode)} over`
                          : `${formatCurrency(remaining, currencyCode)} left`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

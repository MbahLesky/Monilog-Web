import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { recurringRepository } from "@/db/repositories/recurring-repository";
import { useAuthStore } from "@/store/auth-store";
import type { RecurringFrequency, TransactionType } from "@/types";
import { formatCurrency } from "@/utils/formatting";

interface RecurringManagerProps {
  currencyCode: string;
}

export function RecurringManager({ currencyCode }: RecurringManagerProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const items = useLiveQuery(() => recurringRepository.listActive(userId), [userId]) ?? [];
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []) ?? [];
  const categories = useLiveQuery(() => categoriesRepository.listActive(), []) ?? [];

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [nextOccurrence, setNextOccurrence] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!description || isNaN(parsedAmount) || parsedAmount <= 0 || !accountId) return;

    setIsSubmitting(true);
    try {
      await recurringRepository.upsert({
        description,
        amount: parsedAmount,
        type,
        accountId,
        categoryId: categoryId || null,
        frequency,
        nextOccurrence: new Date(nextOccurrence).toISOString(),
        isActive: true,
        userId: userId ?? null
      });
      setOpen(false);
      setDescription("");
      setAmount("");
      setAccountId("");
      setCategoryId("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    await recurringRepository.toggleActive(id, active);
  };

  const handleDelete = async (id: string) => {
    await recurringRepository.delete(id);
  };

  return (
    <Card className="border border-border/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <RefreshCw className="size-5 text-primary" />
            Subscriptions & Recurring
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Track your recurring bills, subscriptions, and scheduled income.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Plus className="size-3.5" />
              Add Recurring
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Add Recurring Transaction</DialogTitle>
                <DialogDescription>
                  Keep an automated tab on regular expenses like rent, Netflix, or salary.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="desc">Description / Label</Label>
                  <Input
                    id="desc"
                    placeholder="e.g. Netflix, Rent, Internet"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rec-type">Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
                      <SelectTrigger id="rec-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rec-amount">Amount ({currencyCode})</Label>
                    <Input
                      id="rec-amount"
                      type="number"
                      step="any"
                      min="1"
                      placeholder="e.g. 15000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="account">Account</Label>
                    <Select value={accountId} onValueChange={setAccountId} required>
                      <SelectTrigger id="account">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category (optional)</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((c) => c.type === type)
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select
                      value={frequency}
                      onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                    >
                      <SelectTrigger id="frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nextDate">Next Date</Label>
                    <Input
                      id="nextDate"
                      type="date"
                      value={nextOccurrence}
                      onChange={(e) => setNextOccurrence(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !description || !amount || !accountId}
                >
                  {isSubmitting ? "Saving..." : "Save Recurring"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-6 text-center">
            <CalendarClock className="size-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm font-medium text-foreground">No recurring items yet</p>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Set up monthly subscriptions, gym dues, or salary to forecast regular cash flows.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((item) => {
              const formattedDate = new Date(item.nextOccurrence).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric"
              });

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-9 items-center justify-center rounded-lg ${
                        item.type === "income"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      <RefreshCw className="size-4" />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="capitalize">{item.frequency}</span>
                        <span>•</span>
                        <span>Next: {formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span
                        className={`text-sm font-semibold ${
                          item.type === "income" ? "text-emerald-600" : "text-foreground"
                        }`}
                      >
                        {item.type === "income" ? "+" : "-"}
                        {formatCurrency(item.amount, currencyCode)}
                      </span>
                    </div>

                    <Switch
                      checked={item.isActive}
                      onCheckedChange={(checked) => handleToggleActive(item.id, checked)}
                      aria-label="Toggle active"
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-60 hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
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


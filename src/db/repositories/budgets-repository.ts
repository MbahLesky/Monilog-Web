import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
import type { Budget, BudgetPeriod, TransactionRecord } from "@/types";
import { nowIso } from "@/utils/date-utils";

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
}

export const budgetsRepository = {
  async listActive(userIdOverride?: string): Promise<Budget[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("[budgetsRepository.listActive] Supabase error:", error);
      return [];
    }

    return (data ?? []).map((b) => ({
      id: b.id,
      userId: b.user_id,
      categoryId: b.category_id,
      amount: Number(b.amount_minor || 0) / 100,
      period: b.period as BudgetPeriod,
      createdAt: b.created_at || nowIso(),
      updatedAt: b.updated_at || nowIso(),
      deletedAt: null,
      remoteId: b.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
  },

  async get(id: string): Promise<Budget | undefined> {
    const list = await this.listActive();
    return list.find((b) => b.id === id);
  },

  async upsertBudget(input: {
    id?: string;
    categoryId: string;
    amount: number;
    period?: BudgetPeriod;
    userId?: string | null;
  }): Promise<Budget> {
    const userId = await getCurrentUserId(input.userId);
    if (!userId || !supabase) {
      throw new Error("Please sign in to configure a budget.");
    }

    const timestamp = nowIso();
    const period = input.period ?? "monthly";
    const budgetId = input.id ?? generateUuid();

    const { error } = await supabase.from("budgets").upsert({
      id: budgetId,
      user_id: userId,
      category_id: input.categoryId,
      amount_minor: Math.round(input.amount * 100),
      period,
      updated_at: timestamp
    });

    if (error) {
      console.error("[Direct DB] Failed to upsert budget:", error);
      throw error;
    }

    notifyDatabaseChange();

    return {
      id: budgetId,
      categoryId: input.categoryId,
      amount: input.amount,
      period,
      userId,
      remoteId: budgetId,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };
  },

  async deleteBudget(id: string): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      console.error("[Direct DB] Failed to delete budget:", error);
      throw error;
    }

    notifyDatabaseChange();
  },

  calculateProgress(budgets: Budget[], transactions: TransactionRecord[]): BudgetProgress[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return budgets.map((budget) => {
      const spent = transactions
        .filter((t) => {
          if (t.deletedAt || t.type !== "expense" || t.categoryId !== budget.categoryId) {
            return false;
          }
          const tDate = new Date(t.transactionDate);
          return tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
        })
        .reduce((sum, t) => sum + t.amount, 0);

      const remaining = Math.max(0, budget.amount - spent);
      const percentage = budget.amount > 0 ? Math.min(100, Math.round((spent / budget.amount) * 100)) : 0;
      const isOverBudget = spent > budget.amount;

      return {
        budget,
        spent,
        remaining,
        percentage,
        isOverBudget
      };
    });
  }
};

import { appDb } from "@/db/dexie";
import { supabase } from "@/lib/supabase-client";
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
  async listActive(userId?: string): Promise<Budget[]> {
    return appDb.budgets
      .filter((b) => !b.deletedAt && (!userId || !b.userId || b.userId === userId))
      .toArray();
  },

  async get(id: string): Promise<Budget | undefined> {
    return appDb.budgets.get(id);
  },

  async upsertBudget(input: {
    id?: string;
    categoryId: string;
    amount: number;
    period?: BudgetPeriod;
    userId?: string | null;
  }): Promise<Budget> {
    const timestamp = nowIso();
    const period = input.period ?? "monthly";

    let existing: Budget | undefined;
    if (input.id) {
      existing = await appDb.budgets.get(input.id);
    } else {
      existing = await appDb.budgets
        .filter((b) => !b.deletedAt && b.categoryId === input.categoryId && b.period === period)
        .first();
    }

    const budgetId = existing?.id ?? input.id ?? generateUuid();
    let currentUserId = input.userId ?? existing?.userId ?? null;

    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        currentUserId = currentUserId || sessionData?.session?.user?.id || null;
        if (currentUserId) {
          await supabase.from("budgets").upsert({
            id: budgetId,
            user_id: currentUserId,
            category_id: input.categoryId,
            amount_minor: Math.round(input.amount * 100),
            period,
            updated_at: timestamp
          });
        }
      } catch (e) {
        console.error("[Direct DB] Failed to upsert budget:", e);
      }
    }

    const record: Budget = {
      id: budgetId,
      categoryId: input.categoryId,
      amount: input.amount,
      period,
      userId: currentUserId,
      remoteId: budgetId,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    await appDb.budgets.put(record);
    return record;
  },

  async deleteBudget(id: string): Promise<void> {
    const existing = await appDb.budgets.get(id);
    if (!existing) return;

    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = existing.userId || sessionData?.session?.user?.id;
        if (userId) {
          await supabase.from("budgets").delete().eq("id", id).eq("user_id", userId);
        }
      } catch (e) {
        console.error("[Direct DB] Failed to delete budget:", e);
      }
    }

    await appDb.budgets.delete(id);
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

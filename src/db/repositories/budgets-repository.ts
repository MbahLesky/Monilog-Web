import { appDb } from "@/db/dexie";
import { syncRepository } from "@/db/repositories/sync-repository";
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

    // Check for existing budget for this category and period
    let existing: Budget | undefined;
    if (input.id) {
      existing = await appDb.budgets.get(input.id);
    } else {
      existing = await appDb.budgets
        .filter((b) => !b.deletedAt && b.categoryId === input.categoryId && b.period === period)
        .first();
    }

    if (existing) {
      const updated: Budget = {
        ...existing,
        amount: input.amount,
        period,
        userId: input.userId ?? existing.userId ?? null,
        syncStatus: "pending",
        syncError: null,
        updatedAt: timestamp
      };
      await appDb.budgets.put(updated);
      await syncRepository.enqueue("budgets", updated.id, "update", JSON.stringify(updated));
      return updated;
    }

    const created: Budget = {
      id: input.id ?? generateUuid(),
      categoryId: input.categoryId,
      amount: input.amount,
      period,
      userId: input.userId ?? null,
      remoteId: null,
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    await appDb.budgets.add(created);
    await syncRepository.enqueue("budgets", created.id, "create", JSON.stringify(created));
    return created;
  },

  async deleteBudget(id: string): Promise<void> {
    const existing = await appDb.budgets.get(id);
    if (!existing) return;

    const timestamp = nowIso();
    const deleted: Budget = {
      ...existing,
      deletedAt: timestamp,
      syncStatus: "pending",
      syncError: null,
      updatedAt: timestamp
    };

    await appDb.budgets.put(deleted);
    await syncRepository.enqueue("budgets", id, "delete", JSON.stringify(deleted));
  },

  calculateProgress(budgets: Budget[], transactions: TransactionRecord[]): BudgetProgress[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return budgets.map((budget) => {
      // Filter expenses for this category in current month
      const spent = transactions
        .filter((t) => {
          if (t.deletedAt || t.type !== "expense" || t.categoryId !== budget.categoryId) {
            return false;
          }
          const tDate = new Date(t.transactionDate);
          if (budget.period === "monthly") {
            return tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
          }
          if (budget.period === "yearly") {
            return tDate.getFullYear() === currentYear;
          }
          // Default weekly / fallback: last 7 days
          const diffDays = (now.getTime() - tDate.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 7;
        })
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const remaining = Math.max(0, budget.amount - spent);
      const percentage = budget.amount > 0 ? Math.min(Math.round((spent / budget.amount) * 100), 200) : 0;
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

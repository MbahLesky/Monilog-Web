import { isWithinInterval, parseISO } from "date-fns";
import { appDb } from "@/db/dexie";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { supabase } from "@/lib/supabase-client";
import type { TransactionFilters, TransactionListItem, TransactionRecord } from "@/types";
import { getRangeBounds, nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";

function matchesDateRange(transactionDate: string, filters: TransactionFilters) {
  if (filters.range === "all") {
    return true;
  }

  if (filters.range === "custom" && filters.startDate && filters.endDate) {
    return isWithinInterval(parseISO(transactionDate), {
      start: parseISO(filters.startDate),
      end: parseISO(filters.endDate)
    });
  }

  const bounds = getRangeBounds(filters.range as "today" | "7d" | "30d");
  return isWithinInterval(parseISO(transactionDate), bounds);
}

export const defaultTransactionFilters: TransactionFilters = {
  query: "",
  type: "all",
  categoryId: "all",
  accountId: "all",
  range: "all"
};

export const transactionsRepository = {
  async listActive() {
    const items = await appDb.transactions.filter((item) => !item.deletedAt).toArray();
    return items.sort((left, right) => right.transactionDate.localeCompare(left.transactionDate));
  },

  async listWithRelations(filters: TransactionFilters = defaultTransactionFilters): Promise<TransactionListItem[]> {
    const [transactions, accounts, categories, settings] = await Promise.all([
      this.listActive(),
      appDb.accounts.toArray(),
      appDb.categories.toArray(),
      settingsRepository.getSettings()
    ]);

    return transactions
      .map((transaction) => {
        const account = accounts.find((item) => item.id === transaction.accountId);
        const category = transaction.categoryId
          ? categories.find((item) => item.id === transaction.categoryId)
          : undefined;

        return {
          ...transaction,
          accountName:
            account?.name ??
            (transaction.accountId?.toLowerCase().includes("bank") ? "Bank" : "Cash"),
          accountCurrencyCode: settings.currencyCode,
          categoryName: category?.name ?? "General",
          categoryColorKey: category?.colorKey ?? null,
          categoryIconKey: category?.iconKey ?? null
        };
      })
      .filter((transaction) => {
        const matchesQuery =
          filters.query.length === 0 ||
          transaction.description.toLowerCase().includes(filters.query.toLowerCase()) ||
          transaction.accountName.toLowerCase().includes(filters.query.toLowerCase()) ||
          transaction.categoryName.toLowerCase().includes(filters.query.toLowerCase());

        const matchesType = filters.type === "all" || transaction.type === filters.type;
        const matchesCategory =
          filters.categoryId === "all" || transaction.categoryId === filters.categoryId;
        const matchesAccount = filters.accountId === "all" || transaction.accountId === filters.accountId;

        return (
          matchesQuery &&
          matchesType &&
          matchesCategory &&
          matchesAccount &&
          matchesDateRange(transaction.transactionDate, filters)
        );
      });
  },

  async getById(id: string) {
    return appDb.transactions.get(id);
  },

  async createTransaction(input: {
    amount: number;
    type: TransactionRecord["type"];
    accountId: string;
    categoryId: string | null;
    description?: string;
    affectsAccountBalance?: boolean;
    transactionDate: string;
    userId?: string | null;
  }) {
    const timestamp = nowIso();
    const transaction: TransactionRecord = {
      id: createId("txn"),
      amount: input.amount,
      type: input.type,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      description: input.description?.trim() ?? "",
      affectsAccountBalance: input.affectsAccountBalance ?? true,
      transactionDate: input.transactionDate,
      userId: input.userId ?? null,
      remoteId: null,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = input.userId || sessionData?.session?.user?.id;
      if (userId) {
        transaction.userId = userId;
        const { error } = await supabase.from("transactions").insert({
          id: transaction.id,
          user_id: userId,
          account_id: transaction.accountId,
          category_id: transaction.categoryId || null,
          type: transaction.type,
          amount_minor: Math.round(transaction.amount * 100),
          currency_code: transaction.currencyCode || "XAF",
          description: transaction.description || "",
          affects_account_balance: transaction.affectsAccountBalance ?? true,
          transaction_date: transaction.transactionDate,
          updated_at: timestamp
        });
        if (error) {
          console.error("[Direct DB] Failed to create transaction in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.transactions.add(transaction);
    return transaction;
  },

  async updateTransaction(
    id: string,
    updates: Partial<
      Pick<
        TransactionRecord,
        "amount" | "type" | "accountId" | "categoryId" | "description" | "affectsAccountBalance" | "transactionDate" | "userId"
      >
    >
  ) {
    const current = await appDb.transactions.get(id);
    if (!current) {
      throw new Error("Transaction not found.");
    }

    const timestamp = nowIso();
    const next: TransactionRecord = {
      ...current,
      ...updates,
      syncStatus: "synced",
      syncError: null,
      updatedAt: timestamp
    };

    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = next.userId || sessionData?.session?.user?.id;
      if (userId) {
        const payload: Record<string, unknown> = { updated_at: timestamp };
        if (updates.amount !== undefined) payload.amount_minor = Math.round(updates.amount * 100);
        if (updates.type !== undefined) payload.type = updates.type;
        if (updates.accountId !== undefined) payload.account_id = updates.accountId;
        if (updates.categoryId !== undefined) payload.category_id = updates.categoryId || null;
        if (updates.description !== undefined) payload.description = updates.description.trim();
        if (updates.affectsAccountBalance !== undefined) payload.affects_account_balance = updates.affectsAccountBalance;
        if (updates.transactionDate !== undefined) payload.transaction_date = updates.transactionDate;

        const { error } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to update transaction in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.transactions.put(next);
    return next;
  },

  async softDelete(id: string) {
    const current = await appDb.transactions.get(id);
    if (!current) {
      return;
    }

    const timestamp = nowIso();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = current.userId || sessionData?.session?.user?.id;
      if (userId) {
        const { error } = await supabase
          .from("transactions")
          .update({ deleted_at: timestamp, updated_at: timestamp })
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to soft-delete transaction in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.transactions.update(id, { deletedAt: timestamp, updatedAt: timestamp });
  },

  async findLikelyDuplicate(input: {
    transactionDate: string;
    type: TransactionRecord["type"];
    amount: number;
    accountId: string;
    description: string;
  }) {
    const transactions = await this.listActive();
    return transactions.find(
      (transaction) =>
        transaction.transactionDate === input.transactionDate &&
        transaction.type === input.type &&
        transaction.amount === input.amount &&
        transaction.accountId === input.accountId &&
        transaction.description.trim().toLowerCase() === input.description.trim().toLowerCase()
    );
  },

  async stampOwnership(userId: string) {
    const records = await appDb.transactions.toArray();
    const unclaimed = records.filter((record) => !record.userId);
    if (unclaimed.length === 0) {
      return;
    }
    await Promise.all(
      unclaimed.map((record) =>
        this.updateTransaction(record.id, {
          userId
        })
      )
    );
  }
};

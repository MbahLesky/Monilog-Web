import { isWithinInterval, parseISO } from "date-fns";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
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
  async listActive(userIdOverride?: string | null): Promise<TransactionRecord[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false });

    if (error) {
      console.error("[transactionsRepository.listActive] Supabase error:", error);
      return [];
    }

    return (data ?? []).map((t) => ({
      id: t.id,
      userId: t.user_id,
      accountId: t.account_id,
      categoryId: t.category_id,
      type: t.type,
      amount: Number(t.amount_minor || 0) / 100,
      currencyCode: t.currency_code || "XAF",
      description: t.description || "",
      affectsAccountBalance: t.affects_account_balance ?? true,
      transactionDate: t.transaction_date,
      createdAt: t.created_at || nowIso(),
      updatedAt: t.updated_at || nowIso(),
      deletedAt: t.deleted_at || null,
      remoteId: t.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
  },

  async listWithRelations(
    filters: TransactionFilters = defaultTransactionFilters,
    userIdOverride?: string | null
  ): Promise<TransactionListItem[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const [transactions, accounts, categories, settings] = await Promise.all([
      this.listActive(userId),
      accountsRepository.listActive(userId),
      categoriesRepository.listActive(userId),
      settingsRepository.getSettings(userId)
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

  async getById(id: string, userIdOverride?: string | null) {
    const txns = await this.listActive(userIdOverride);
    return txns.find((t) => t.id === id);
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
    const userId = await getCurrentUserId(input.userId);
    if (!userId || !supabase) {
      throw new Error("Please sign in to record a transaction.");
    }

    const timestamp = nowIso();
    const id = createId("txn");

    const { error } = await supabase.from("transactions").insert({
      id,
      user_id: userId,
      account_id: input.accountId,
      category_id: input.categoryId || null,
      type: input.type,
      amount_minor: Math.round(input.amount * 100),
      currency_code: "XAF",
      description: input.description?.trim() ?? "",
      affects_account_balance: input.affectsAccountBalance ?? true,
      transaction_date: input.transactionDate,
      updated_at: timestamp
    });

    if (error) {
      console.error("[Direct DB] Failed to create transaction in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();

    return {
      id,
      amount: input.amount,
      type: input.type,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      description: input.description?.trim() ?? "",
      affectsAccountBalance: input.affectsAccountBalance ?? true,
      transactionDate: input.transactionDate,
      userId,
      remoteId: id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };
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
    const userId = await getCurrentUserId();
    if (!userId || !supabase) {
      throw new Error("Please sign in.");
    }

    const timestamp = nowIso();
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

    notifyDatabaseChange();
  },

  async softDelete(id: string) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const timestamp = nowIso();
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Direct DB] Failed to soft-delete transaction in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();
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

  async stampOwnership(_userId: string) {}
};

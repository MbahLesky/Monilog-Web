import { format, parseISO, startOfMonth } from "date-fns";
import { getOptionalTable } from "@/db/dexie";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import type { TransferRecord } from "@/types";

export interface AnalyticsFilterOptions {
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  accountId?: string | null;
  typeFilter?: "all" | "income" | "expense";
}

export const analyticsService = {
  async getSnapshots(filters: AnalyticsFilterOptions = {}) {
    const transfersTable = getOptionalTable<TransferRecord>("transfers");
    const [allTransactions, allTransfers, accountsWithBalances] = await Promise.all([
      transactionsRepository.listWithRelations(),
      transfersTable ? transfersTable.toArray() : Promise.resolve([]),
      accountsRepository.listWithBalances()
    ]);

    const accountId =
      filters.accountId && filters.accountId !== "all" ? filters.accountId : null;
    const typeFilter =
      filters.typeFilter && filters.typeFilter !== "all" ? filters.typeFilter : null;
    const startDate = filters.startDate || null;
    const endDate = filters.endDate || null;

    const transactions = allTransactions.filter((tx) => {
      const day = tx.transactionDate.slice(0, 10);
      if (accountId && tx.accountId !== accountId) return false;
      if (typeFilter && tx.type !== typeFilter) return false;
      if (startDate && day < startDate) return false;
      if (endDate && day > endDate) return false;
      return true;
    });

    const transfers = allTransfers.filter((tf) => {
      if (tf.deletedAt) return false;
      const day = tf.transferDate.slice(0, 10);
      if (accountId && tf.fromAccountId !== accountId && tf.toAccountId !== accountId) {
        return false;
      }
      if (typeFilter === "income") return false;
      if (startDate && day < startDate) return false;
      if (endDate && day > endDate) return false;
      return true;
    });

    const monthlyTrendMap = new Map<
      string,
      { label: string; income: number; expense: number; net: number }
    >();
    const categoryBreakdownMap = new Map<string, { value: number; count: number }>();
    const incomeCategoryMap = new Map<string, { value: number; count: number }>();

    transactions.forEach((transaction) => {
      const monthKey = format(startOfMonth(parseISO(transaction.transactionDate)), "yyyy-MM");
      const label = format(parseISO(transaction.transactionDate), "MMM yyyy");
      const bucket = monthlyTrendMap.get(monthKey) ?? {
        label,
        income: 0,
        expense: 0,
        net: 0
      };

      if (transaction.type === "income") {
        bucket.income += transaction.amount;
        const prev = incomeCategoryMap.get(transaction.categoryName) ?? { value: 0, count: 0 };
        incomeCategoryMap.set(transaction.categoryName, {
          value: prev.value + transaction.amount,
          count: prev.count + 1
        });
      } else {
        bucket.expense += transaction.amount;
        const prev = categoryBreakdownMap.get(transaction.categoryName) ?? {
          value: 0,
          count: 0
        };
        categoryBreakdownMap.set(transaction.categoryName, {
          value: prev.value + transaction.amount,
          count: prev.count + 1
        });
      }

      bucket.net = bucket.income - bucket.expense;
      monthlyTrendMap.set(monthKey, bucket);
    });

    transfers
      .filter((transfer) => transfer.fee > 0)
      .forEach((transfer) => {
        const monthKey = format(startOfMonth(parseISO(transfer.transferDate)), "yyyy-MM");
        const label = format(parseISO(transfer.transferDate), "MMM yyyy");
        const bucket = monthlyTrendMap.get(monthKey) ?? {
          label,
          income: 0,
          expense: 0,
          net: 0
        };

        bucket.expense += transfer.fee;
        bucket.net = bucket.income - bucket.expense;
        const prev = categoryBreakdownMap.get("Transfer fees") ?? { value: 0, count: 0 };
        categoryBreakdownMap.set("Transfer fees", {
          value: prev.value + transfer.fee,
          count: prev.count + 1
        });
        monthlyTrendMap.set(monthKey, bucket);
      });

    const monthlyTrend = Array.from(monthlyTrendMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value);

    const categoryBreakdown = Array.from(categoryBreakdownMap.entries())
      .map(([name, item]) => ({
        name,
        value: item.value,
        count: item.count
      }))
      .sort((left, right) => right.value - left.value);

    const incomeCategoryBreakdown = Array.from(incomeCategoryMap.entries())
      .map(([name, item]) => ({
        name,
        value: item.value,
        count: item.count
      }))
      .sort((left, right) => right.value - left.value);

    const scopedAccounts = accountId
      ? accountsWithBalances.filter((a) => a.id === accountId)
      : accountsWithBalances;

    const accountBreakdown = scopedAccounts.map((acc) => {
      const accTx = transactions.filter((t) => t.accountId === acc.id);
      const income = accTx
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + t.amount, 0);
      const expense =
        accTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0) +
        transfers
          .filter((tf) => tf.fromAccountId === acc.id)
          .reduce((s, tf) => s + tf.fee, 0);
      const transferOut = transfers
        .filter((tf) => tf.fromAccountId === acc.id)
        .reduce((s, tf) => s + tf.amount, 0);
      const transferIn = transfers
        .filter((tf) => tf.toAccountId === acc.id)
        .reduce((s, tf) => s + tf.amount, 0);

      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        income,
        expense,
        transferIn,
        transferOut,
        balance: acc.currentBalance
      };
    });

    const topTransactions = [...transactions]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const totalIncome = transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalExpense =
      transactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + transaction.amount, 0) +
      transfers.reduce((sum, transfer) => sum + transfer.fee, 0);
    const totalTransferVolume = transfers.reduce((sum, tf) => sum + tf.amount, 0);

    return {
      monthlyTrend,
      categoryBreakdown,
      incomeCategoryBreakdown,
      accountBreakdown,
      topTransactions,
      totals: {
        income: totalIncome,
        expense: totalExpense,
        net: totalIncome - totalExpense,
        transferVolume: totalTransferVolume,
        savingsRate:
          totalIncome > 0
            ? Math.max(-100, Math.min(100, ((totalIncome - totalExpense) / totalIncome) * 100))
            : 0
      }
    };
  }
};

import { isSameDay, parseISO } from "date-fns";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { transfersRepository } from "@/db/repositories/transfers-repository";

export interface DashboardSnapshot {
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  todaySpending: number;
  accountSummaries: Awaited<ReturnType<typeof accountsRepository.listWithBalances>>;
  recentTransactions: Awaited<ReturnType<typeof transactionsRepository.listWithRelations>>;
}

export const dashboardRepository = {
  async getSnapshot(): Promise<DashboardSnapshot> {
    const [accountSummaries, recentTransactions, activeTransfers] = await Promise.all([
      accountsRepository.listWithBalances(),
      transactionsRepository.listWithRelations(),
      transfersRepository.listActive()
    ]);

    const currentBalance = accountSummaries.reduce((sum, account) => sum + account.currentBalance, 0);
    const totalIncome = recentTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalExpenses = recentTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0) +
      activeTransfers.reduce((sum, transfer) => sum + transfer.fee, 0);
    const todaySpending = recentTransactions
      .filter(
        (transaction) =>
          transaction.type === "expense" && isSameDay(parseISO(transaction.transactionDate), new Date())
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0) +
      activeTransfers
        .filter((transfer) => isSameDay(parseISO(transfer.transferDate), new Date()))
        .reduce((sum, transfer) => sum + transfer.fee, 0);

    return {
      currentBalance,
      totalIncome,
      totalExpenses,
      todaySpending,
      accountSummaries,
      recentTransactions: recentTransactions.slice(0, 6)
    };
  }
};

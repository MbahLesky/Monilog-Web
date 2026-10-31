import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { dashboardRepository } from "@/db/repositories/dashboard-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { nowIso } from "@/utils/date-utils";
import { formatCurrency } from "@/utils/formatting";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  transactionData?: {
    type: "expense" | "income";
    amount: number;
    categoryName: string;
    accountName: string;
    newBalance: number;
  };
}

export const inAppChatService = {
  async processMessage(input: string, userId?: string | null): Promise<ChatMessage> {
    const text = input.trim();
    const settings = await settingsRepository.getSettings();
    const currency = settings.currencyCode || "XAF";
    const timestamp = nowIso();

    // 1. Balance command
    if (/^(balance|solde|my balance|current balance)$/i.test(text)) {
      const snapshot = await dashboardRepository.getSnapshot();
      return {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: `💰 **Your current balance is ${formatCurrency(snapshot.currentBalance, currency)}.**\n\n*Accounts breakdown:*\n` +
          snapshot.accountSummaries.map(a => `• ${a.name}: ${formatCurrency(a.currentBalance, currency)}`).join("\n"),
        timestamp
      };
    }

    // 2. Summary command
    if (/^(summary|recap|monthly summary|stats)$/i.test(text)) {
      const snapshot = await dashboardRepository.getSnapshot();
      const net = snapshot.totalIncome - snapshot.totalExpenses;
      return {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: `📊 **Monthly Summary**\n` +
          `📈 **Income:** ${formatCurrency(snapshot.totalIncome, currency)}\n` +
          `📉 **Expenses:** ${formatCurrency(snapshot.totalExpenses, currency)}\n` +
          `➖ **Net:** ${formatCurrency(net, currency)}\n` +
          `💰 **Total Balance:** ${formatCurrency(snapshot.currentBalance, currency)}`,
        timestamp
      };
    }

    // 3. Recent command
    if (/^(recent|history|last transactions|last)$/i.test(text)) {
      const snapshot = await dashboardRepository.getSnapshot();
      if (snapshot.recentTransactions.length === 0) {
        return {
          id: `msg-${Date.now()}`,
          sender: "assistant",
          text: "🧾 You don't have any recent transactions yet.",
          timestamp
        };
      }
      return {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: `🧾 **Last ${Math.min(snapshot.recentTransactions.length, 5)} transactions:**\n` +
          snapshot.recentTransactions.slice(0, 5).map(t => {
            const sign = t.type === "expense" ? "-" : "+";
            return `• ${sign}${formatCurrency(t.amount, currency)} · ${t.categoryName || "General"} · ${t.accountName}`;
          }).join("\n"),
        timestamp
      };
    }

    // 4. Help command
    if (/^(help|aide|\?|commands)$/i.test(text)) {
      return {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: `🤖 **Moniilog Conversational Assistant**\n\n` +
          `You can chat with me just like on WhatsApp to log transactions or query your ledger:\n\n` +
          `• \`-5000 food\` → Logs an expense of 5,000 for Food\n` +
          `• \`+50000 salary\` → Logs an income of 50,000\n` +
          `• \`2500 taxi\` → Logs an expense of 2,500\n` +
          `• \`balance\` → Shows your total and per-account balance\n` +
          `• \`recent\` → Lists your last transactions\n` +
          `• \`summary\` → Shows income, expenses, and net summary`,
        timestamp
      };
    }

    // 5. Parse Transaction (Expense / Income)
    // Matches patterns:
    // -5000 food
    // +50000 salary
    // 2500 taxi with cash
    const expenseMatch = text.match(/^[-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s+(.+)$/i);
    const incomeMatch = text.match(/^\+\s*([0-9]+(?:[.,][0-9]{1,2})?)\s+(.+)$/i);

    if (incomeMatch) {
      const rawAmount = parseFloat(incomeMatch[1].replace(",", "."));
      const note = incomeMatch[2].trim();
      return await this._logParsedTransaction({
        type: "income",
        amount: rawAmount,
        note,
        currency,
        userId,
        timestamp
      });
    }

    if (expenseMatch) {
      const rawAmount = parseFloat(expenseMatch[1].replace(",", "."));
      const note = expenseMatch[2].trim();
      return await this._logParsedTransaction({
        type: "expense",
        amount: rawAmount,
        note,
        currency,
        userId,
        timestamp
      });
    }

    // Fallback friendly reply
    return {
      id: `msg-${Date.now()}`,
      sender: "assistant",
      text: `👋 I didn't quite catch that. Try sending an expense like **\`-5000 lunch\`**, an income like **\`+50000 salary\`**, or ask for your **\`balance\`**!`,
      timestamp
    };
  },

  async _logParsedTransaction(params: {
    type: "expense" | "income";
    amount: number;
    note: string;
    currency: string;
    userId?: string | null;
    timestamp: string;
  }): Promise<ChatMessage> {
    const accounts = await accountsRepository.listActive();
    const defaultAccount = accounts.find(a => a.isDefault) || accounts[0];
    const categories = await categoriesRepository.listActive();

    // Match category by keyword
    let matchedCategory = categories.find(c => 
      c.type === params.type && params.note.toLowerCase().includes(c.name.toLowerCase())
    );

    if (!matchedCategory) {
      matchedCategory = categories.find(c => c.type === params.type);
    }

    await transactionsRepository.createTransaction({
      amount: params.amount,
      type: params.type,
      accountId: defaultAccount?.id || "cash",
      categoryId: matchedCategory?.id || null,
      description: params.note,
      affectsAccountBalance: true,
      transactionDate: params.timestamp,
      userId: params.userId
    });

    const snapshot = await dashboardRepository.getSnapshot();
    const sign = params.type === "expense" ? "-" : "+";
    const label = params.type === "expense" ? "Expense logged" : "Income logged";

    return {
      id: `msg-${Date.now()}`,
      sender: "assistant",
      text: `✅ **${label}**\n` +
        `${sign}${formatCurrency(params.amount, params.currency)} · ${matchedCategory?.name || "General"} · ${defaultAccount?.name || "Cash"}\n` +
        `📝 *"${params.note}"*\n` +
        `💰 **New Balance:** ${formatCurrency(snapshot.currentBalance, params.currency)}`,
      timestamp: params.timestamp,
      transactionData: {
        type: params.type,
        amount: params.amount,
        categoryName: matchedCategory?.name || "General",
        accountName: defaultAccount?.name || "Cash",
        newBalance: snapshot.currentBalance
      }
    };
  }
};

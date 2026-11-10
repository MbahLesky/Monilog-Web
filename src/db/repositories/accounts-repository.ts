import { appDb, getOptionalTable } from "@/db/dexie";
import { createDefaultAccounts } from "@/db/seed/default-records";
import { supabase } from "@/lib/supabase-client";
import type { Account, AccountBalanceSnapshot, AccountType, TransactionRecord, TransferRecord } from "@/types";
import { nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";

async function ensureDefaultAccounts() {
  const count = await appDb.accounts.count();
  if (count === 0) {
    await appDb.accounts.bulkPut(createDefaultAccounts());
  }
}

function calculateBalanceForAccount(
  account: Account,
  transactions: TransactionRecord[],
  transfers: TransferRecord[]
) {
  const accountTransactions = transactions.filter(
    (item) => item.accountId === account.id && !item.deletedAt && item.affectsAccountBalance
  );
  const outgoingTransfers = transfers.filter((item) => item.fromAccountId === account.id && !item.deletedAt);
  const incomingTransfers = transfers.filter((item) => item.toAccountId === account.id && !item.deletedAt);

  const incomeTotal = accountTransactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const expenseTotal = accountTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  // Source account is debited amount + sourceFee; destination is credited amount - destinationFee.
  const outgoingTransferTotal = outgoingTransfers.reduce(
    (sum, item) => sum + item.amount + item.sourceFee,
    0
  );
  const incomingTransferTotal = incomingTransfers.reduce(
    (sum, item) => sum + item.amount - item.destinationFee,
    0
  );

  return {
    currentBalance:
      account.openingBalance +
      incomeTotal -
      expenseTotal -
      outgoingTransferTotal +
      incomingTransferTotal,
    incomeTotal,
    expenseTotal
  };
}

export const accountsRepository = {
  async listActive() {
    await ensureDefaultAccounts();
    return appDb.accounts.filter((account) => !account.deletedAt).sortBy("displayOrder");
  },

  async listWithBalances(): Promise<AccountBalanceSnapshot[]> {
    const transfersTable = getOptionalTable<TransferRecord>("transfers");
    const [accounts, transactions, transfers] = await Promise.all([
      this.listActive(),
      appDb.transactions.toArray(),
      transfersTable ? transfersTable.toArray() : Promise.resolve([])
    ]);

    return accounts.map((account) => ({
      ...account,
      ...calculateBalanceForAccount(account, transactions, transfers)
    }));
  },

  async getById(id: string) {
    await ensureDefaultAccounts();
    return appDb.accounts.get(id);
  },

  async createAccount(input: {
    name: string;
    type: AccountType;
    openingBalance: number;
    userId?: string | null;
  }) {
    const existingAccounts = await this.listActive();
    const timestamp = nowIso();
    const account: Account = {
      id: createId("account"),
      name: input.name.trim(),
      type: input.type,
      openingBalance: input.openingBalance,
      isDefault: false,
      displayOrder: existingAccounts.length,
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
        account.userId = userId;
        const { error } = await supabase.from("accounts").insert({
          id: account.id,
          user_id: userId,
          name: account.name,
          type: account.type,
          opening_balance_minor: Math.round(account.openingBalance * 100),
          currency_code: account.currencyCode || "XAF",
          is_default: false,
          display_order: account.displayOrder,
          updated_at: timestamp
        });
        if (error) {
          console.error("[Direct DB] Failed to create account in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.accounts.add(account);
    return account;
  },

  async updateAccount(
    id: string,
    updates: Partial<Pick<Account, "name" | "type" | "openingBalance" | "displayOrder" | "userId">>
  ) {
    const current = await appDb.accounts.get(id);
    if (!current) {
      throw new Error("Account not found.");
    }

    const timestamp = nowIso();
    const next: Account = {
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
        if (updates.name !== undefined) payload.name = updates.name.trim();
        if (updates.type !== undefined) payload.type = updates.type;
        if (updates.openingBalance !== undefined) {
          payload.opening_balance_minor = Math.round(updates.openingBalance * 100);
        }
        if (updates.displayOrder !== undefined) payload.display_order = updates.displayOrder;

        const { error } = await supabase
          .from("accounts")
          .update(payload)
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to update account in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.accounts.put(next);
    return next;
  },

  async saveOpeningBalances(rows: Array<{ id: string; balance: number }>) {
    await Promise.all(
      rows.map(async (row) => {
        return this.updateAccount(row.id, {
          openingBalance: row.balance
        });
      })
    );
  },

  async softDelete(id: string) {
    const account = await appDb.accounts.get(id);
    if (!account || account.isDefault) {
      return;
    }

    const timestamp = nowIso();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = account.userId || sessionData?.session?.user?.id;
      if (userId) {
        const { error } = await supabase
          .from("accounts")
          .update({ deleted_at: timestamp, updated_at: timestamp })
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to soft-delete account in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.accounts.update(id, { deletedAt: timestamp, updatedAt: timestamp });
  },

  async stampOwnership(userId: string) {
    const records = await appDb.accounts.toArray();
    const unclaimed = records.filter((record) => !record.userId);
    if (unclaimed.length === 0) {
      return;
    }
    await Promise.all(
      unclaimed.map((record) =>
        this.updateAccount(record.id, {
          userId
        })
      )
    );
  }
};

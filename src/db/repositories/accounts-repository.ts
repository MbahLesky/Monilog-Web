import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
import type { Account, AccountBalanceSnapshot, AccountType, TransactionRecord, TransferRecord } from "@/types";
import { nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";

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
  async listActive(userIdOverride?: string | null): Promise<Account[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[accountsRepository.listActive] Supabase error:", error);
      return [];
    }

    if (!data || data.length === 0) {
      // First-time seed into Supabase directly!
      const timestamp = nowIso();
      const defaultRows = [
        {
          id: "default-cash",
          user_id: userId,
          name: "Cash",
          type: "cash",
          opening_balance_minor: 0,
          currency_code: "XAF",
          is_default: true,
          display_order: 0,
          updated_at: timestamp
        },
        {
          id: "default-bank",
          user_id: userId,
          name: "Bank",
          type: "bank",
          opening_balance_minor: 0,
          currency_code: "XAF",
          is_default: true,
          display_order: 1,
          updated_at: timestamp
        }
      ];
      await supabase.from("accounts").upsert(defaultRows);
      return defaultRows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        presetKey: null,
        name: r.name,
        type: r.type as AccountType,
        openingBalance: 0,
        currencyCode: r.currency_code,
        isDefault: r.is_default,
        displayOrder: r.display_order,
        balanceResetAt: null,
        createdAt: r.updated_at,
        updatedAt: r.updated_at,
        deletedAt: null,
        remoteId: r.id,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: r.updated_at
      }));
    }

    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      presetKey: row.preset_key,
      name: row.name,
      type: row.type as AccountType,
      openingBalance: Number(row.opening_balance_minor || 0) / 100,
      currencyCode: row.currency_code || "XAF",
      isDefault: row.is_default ?? false,
      displayOrder: row.display_order ?? 0,
      balanceResetAt: row.balance_reset_at || null,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: row.deleted_at || null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
  },

  async listWithBalances(userIdOverride?: string | null): Promise<AccountBalanceSnapshot[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const [accounts, { data: txns }, { data: transfers }] = await Promise.all([
      this.listActive(userId),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null),
      supabase
        .from("transfers")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
    ]);

    const mappedTxns: TransactionRecord[] = (txns ?? []).map((t) => ({
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
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      deletedAt: t.deleted_at,
      remoteId: t.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));

    const mappedTransfers: TransferRecord[] = (transfers ?? []).map((tf) => ({
      id: tf.id,
      userId: tf.user_id,
      fromAccountId: tf.from_account_id,
      toAccountId: tf.to_account_id,
      amount: Number(tf.amount_minor || 0) / 100,
      fee: (Number(tf.source_fee_minor || 0) + Number(tf.destination_fee_minor || 0)) / 100,
      sourceFee: Number(tf.source_fee_minor || 0) / 100,
      destinationFee: Number(tf.destination_fee_minor || 0) / 100,
      currencyCode: tf.currency_code || "XAF",
      description: tf.description || "",
      transferDate: tf.transfer_date,
      createdAt: tf.created_at,
      updatedAt: tf.updated_at,
      deletedAt: tf.deleted_at,
      remoteId: tf.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));

    return accounts.map((account) => ({
      ...account,
      ...calculateBalanceForAccount(account, mappedTxns, mappedTransfers)
    }));
  },

  async getById(id: string, userIdOverride?: string | null) {
    const accounts = await this.listActive(userIdOverride);
    return accounts.find((a) => a.id === id);
  },

  async createAccount(input: {
    name: string;
    type: AccountType;
    openingBalance: number;
    userId?: string | null;
  }) {
    const userId = await getCurrentUserId(input.userId);
    if (!userId || !supabase) {
      throw new Error("Please sign in to add an account.");
    }

    const existingAccounts = await this.listActive(userId);
    const timestamp = nowIso();
    const id = createId("account");

    const { error } = await supabase.from("accounts").insert({
      id,
      user_id: userId,
      name: input.name.trim(),
      type: input.type,
      opening_balance_minor: Math.round(input.openingBalance * 100),
      currency_code: "XAF",
      is_default: false,
      display_order: existingAccounts.length,
      updated_at: timestamp
    });

    if (error) {
      console.error("[Direct DB] Failed to create account in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();

    return {
      id,
      name: input.name.trim(),
      type: input.type,
      openingBalance: input.openingBalance,
      isDefault: false,
      displayOrder: existingAccounts.length,
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

  async updateAccount(
    id: string,
    updates: Partial<Pick<Account, "name" | "type" | "openingBalance" | "displayOrder" | "userId">>
  ) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) {
      throw new Error("Please sign in.");
    }

    const timestamp = nowIso();
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

    notifyDatabaseChange();
  },

  async saveOpeningBalances(rows: Array<{ id: string; balance: number }>) {
    const userId = await getCurrentUserId();
    const client = supabase;
    if (!userId || !client) {
      throw new Error("Please sign in.");
    }

    const timestamp = nowIso();
    await Promise.all(
      rows.map((row) =>
        client
          .from("accounts")
          .update({
            opening_balance_minor: Math.round(row.balance * 100),
            updated_at: timestamp
          })
          .eq("id", row.id)
          .eq("user_id", userId)
      )
    );

    notifyDatabaseChange();
  },

  async softDelete(id: string) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const timestamp = nowIso();
    const { error } = await supabase
      .from("accounts")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Direct DB] Failed to soft-delete account in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();
  },

  async stampOwnership(_userId: string) {}
};

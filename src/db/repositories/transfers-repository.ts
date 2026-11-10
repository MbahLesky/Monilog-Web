import { isWithinInterval, parseISO } from "date-fns";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
import type { TransferFilters, TransferListItem, TransferRecord } from "@/types";
import { getRangeBounds, nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";

function matchesDateRange(transferDate: string, filters: TransferFilters) {
  if (filters.range === "all") {
    return true;
  }

  if (filters.range === "custom" && filters.startDate && filters.endDate) {
    return isWithinInterval(parseISO(transferDate), {
      start: parseISO(filters.startDate),
      end: parseISO(filters.endDate)
    });
  }

  const bounds = getRangeBounds(filters.range as "today" | "7d" | "30d");
  return isWithinInterval(parseISO(transferDate), bounds);
}

export const defaultTransferFilters: TransferFilters = {
  query: "",
  accountId: "all",
  range: "all"
};

interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  sourceFee?: number;
  destinationFee?: number;
  description?: string;
  transferDate: string;
  userId?: string | null;
}

async function validateAndNormalize(input: TransferInput, existingTransferId?: string) {
  if (!input.fromAccountId || !input.toAccountId || !input.transferDate) {
    throw new Error("From account, to account, and date are required.");
  }

  if (input.fromAccountId === input.toAccountId) {
    throw new Error("Choose two different accounts for a transfer.");
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Transfer amount must be greater than zero.");
  }

  const sourceFee = Number.isFinite(input.sourceFee) ? Number(input.sourceFee) : 0;
  const destinationFee = Number.isFinite(input.destinationFee) ? Number(input.destinationFee) : 0;

  if (sourceFee < 0 || destinationFee < 0) {
    throw new Error("Transfer fees cannot be negative.");
  }

  if (destinationFee > input.amount) {
    throw new Error("Destination fee cannot exceed the transfer amount.");
  }

  const [fromAccount, toAccount, balances, existingTransfer] = await Promise.all([
    accountsRepository.getById(input.fromAccountId),
    accountsRepository.getById(input.toAccountId),
    accountsRepository.listWithBalances(),
    existingTransferId ? transfersRepository.getById(existingTransferId) : Promise.resolve(undefined)
  ]);

  if (!fromAccount || fromAccount.deletedAt) {
    throw new Error("Source account is unavailable.");
  }

  if (!toAccount || toAccount.deletedAt) {
    throw new Error("Destination account is unavailable.");
  }

  let sourceBalance = balances.find((item) => item.id === input.fromAccountId)?.currentBalance ?? 0;
  if (existingTransfer && existingTransfer.fromAccountId === input.fromAccountId) {
    sourceBalance += existingTransfer.amount + existingTransfer.sourceFee;
  }

  const requiredSource = input.amount + sourceFee;
  if (sourceBalance < requiredSource) {
    throw new Error(
      `Insufficient funds in ${fromAccount.name}. Available: ${sourceBalance.toFixed(
        2
      )}, required (with fee): ${requiredSource.toFixed(2)}.`
    );
  }

  return { sourceFee, destinationFee };
}

export const transfersRepository = {
  async listActive(userIdOverride?: string | null): Promise<TransferRecord[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const { data, error } = await supabase
      .from("transfers")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("transfer_date", { ascending: false });

    if (error) {
      console.error("[transfersRepository.listActive] Supabase error:", error);
      return [];
    }

    return (data ?? []).map((tf) => ({
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
      createdAt: tf.created_at || nowIso(),
      updatedAt: tf.updated_at || nowIso(),
      deletedAt: tf.deleted_at || null,
      remoteId: tf.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
  },

  async listWithRelations(
    filters: TransferFilters = defaultTransferFilters,
    userIdOverride?: string | null
  ): Promise<TransferListItem[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const [transfers, accounts, settings] = await Promise.all([
      this.listActive(userId),
      accountsRepository.listActive(userId),
      settingsRepository.getSettings(userId)
    ]);

    return transfers
      .map((transfer) => {
        const fromAccount = accounts.find((item) => item.id === transfer.fromAccountId);
        const toAccount = accounts.find((item) => item.id === transfer.toAccountId);

        return {
          ...transfer,
          fromAccountName: fromAccount?.name ?? "Unknown Account",
          toAccountName: toAccount?.name ?? "Unknown Account",
          currencyCode: settings.currencyCode,
          fromAccountCurrencyCode: fromAccount?.currencyCode ?? settings.currencyCode,
          toAccountCurrencyCode: toAccount?.currencyCode ?? settings.currencyCode
        };
      })
      .filter((transfer) => {
        const matchesQuery =
          filters.query.length === 0 ||
          transfer.description.toLowerCase().includes(filters.query.toLowerCase()) ||
          transfer.fromAccountName.toLowerCase().includes(filters.query.toLowerCase()) ||
          transfer.toAccountName.toLowerCase().includes(filters.query.toLowerCase());

        const matchesAccount =
          filters.accountId === "all" ||
          transfer.fromAccountId === filters.accountId ||
          transfer.toAccountId === filters.accountId;

        return matchesQuery && matchesAccount && matchesDateRange(transfer.transferDate, filters);
      });
  },

  async getById(id: string, userIdOverride?: string | null) {
    const transfers = await this.listActive(userIdOverride);
    return transfers.find((t) => t.id === id);
  },

  async createTransfer(input: TransferInput) {
    const userId = await getCurrentUserId(input.userId);
    if (!userId || !supabase) {
      throw new Error("Please sign in to transfer funds.");
    }

    const { sourceFee, destinationFee } = await validateAndNormalize(input);
    const timestamp = nowIso();
    const id = createId("transfer");

    const { error } = await supabase.from("transfers").insert({
      id,
      user_id: userId,
      from_account_id: input.fromAccountId,
      to_account_id: input.toAccountId,
      amount_minor: Math.round(input.amount * 100),
      source_fee_minor: Math.round(sourceFee * 100),
      destination_fee_minor: Math.round(destinationFee * 100),
      currency_code: "XAF",
      description: input.description?.trim() ?? "",
      transfer_date: input.transferDate,
      updated_at: timestamp
    });

    if (error) {
      console.error("[Direct DB] Failed to create transfer in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();

    return {
      id,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      fee: sourceFee + destinationFee,
      sourceFee,
      destinationFee,
      description: input.description?.trim() ?? "",
      transferDate: input.transferDate,
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

  async updateTransfer(id: string, input: TransferInput) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) {
      throw new Error("Please sign in.");
    }

    const { sourceFee, destinationFee } = await validateAndNormalize(input, id);
    const timestamp = nowIso();

    const { error } = await supabase
      .from("transfers")
      .update({
        from_account_id: input.fromAccountId,
        to_account_id: input.toAccountId,
        amount_minor: Math.round(input.amount * 100),
        source_fee_minor: Math.round(sourceFee * 100),
        destination_fee_minor: Math.round(destinationFee * 100),
        description: input.description?.trim() ?? "",
        transfer_date: input.transferDate,
        updated_at: timestamp
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Direct DB] Failed to update transfer in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();
  },

  async softDelete(id: string) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const timestamp = nowIso();
    const { error } = await supabase
      .from("transfers")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Direct DB] Failed to soft-delete transfer in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();
  },

  async stampOwnership(_userId: string) {}
};

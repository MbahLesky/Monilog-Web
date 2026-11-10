import { isWithinInterval, parseISO } from "date-fns";
import { appDb, getOptionalTable } from "@/db/dexie";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { supabase } from "@/lib/supabase-client";
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

function getTransfersTable() {
  return getOptionalTable<TransferRecord>("transfers");
}

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
  const transfersTable = getTransfersTable();
  if (!transfersTable) {
    throw new Error("Transfer storage is unavailable. Refresh the app and try again.");
  }

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
    appDb.accounts.get(input.fromAccountId),
    appDb.accounts.get(input.toAccountId),
    accountsRepository.listWithBalances(),
    existingTransferId ? transfersTable.get(existingTransferId) : Promise.resolve(undefined)
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
  async listActive() {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      return [];
    }

    const items = await transfersTable.filter((item) => !item.deletedAt).toArray();
    return items.sort((left, right) => right.transferDate.localeCompare(left.transferDate));
  },

  async listWithRelations(filters: TransferFilters = defaultTransferFilters): Promise<TransferListItem[]> {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      return [];
    }

    const [transfers, accounts, settings] = await Promise.all([
      this.listActive(),
      appDb.accounts.toArray(),
      settingsRepository.getSettings()
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

  async getById(id: string) {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      return undefined;
    }

    return transfersTable.get(id);
  },

  async createTransfer(input: TransferInput) {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      throw new Error("Transfer storage is unavailable. Refresh the app and try again.");
    }

    const { sourceFee, destinationFee } = await validateAndNormalize(input);

    const timestamp = nowIso();
    const transfer: TransferRecord = {
      id: createId("transfer"),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      fee: sourceFee + destinationFee,
      sourceFee,
      destinationFee,
      description: input.description?.trim() ?? "",
      transferDate: input.transferDate,
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
        transfer.userId = userId;
        const { error } = await supabase.from("transfers").insert({
          id: transfer.id,
          user_id: userId,
          from_account_id: transfer.fromAccountId,
          to_account_id: transfer.toAccountId,
          amount_minor: Math.round(transfer.amount * 100),
          source_fee_minor: Math.round(transfer.sourceFee * 100),
          destination_fee_minor: Math.round(transfer.destinationFee * 100),
          currency_code: "XAF",
          description: transfer.description,
          transfer_date: transfer.transferDate,
          updated_at: timestamp
        });
        if (error) {
          console.error("[Direct DB] Failed to create transfer in Supabase:", error);
          throw error;
        }
      }
    }

    await transfersTable.add(transfer);
    return transfer;
  },

  async updateTransfer(id: string, input: TransferInput) {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      throw new Error("Transfer storage is unavailable. Refresh the app and try again.");
    }

    const current = await transfersTable.get(id);
    if (!current) {
      throw new Error("Transfer not found.");
    }

    const { sourceFee, destinationFee } = await validateAndNormalize(input, id);

    const timestamp = nowIso();
    const next: TransferRecord = {
      ...current,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      fee: sourceFee + destinationFee,
      sourceFee,
      destinationFee,
      description: input.description?.trim() ?? "",
      transferDate: input.transferDate,
      syncStatus: "synced",
      syncError: null,
      updatedAt: timestamp
    };

    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = next.userId || sessionData?.session?.user?.id;
      if (userId) {
        const { error } = await supabase
          .from("transfers")
          .update({
            from_account_id: next.fromAccountId,
            to_account_id: next.toAccountId,
            amount_minor: Math.round(next.amount * 100),
            source_fee_minor: Math.round(next.sourceFee * 100),
            destination_fee_minor: Math.round(next.destinationFee * 100),
            description: next.description,
            transfer_date: next.transferDate,
            updated_at: timestamp
          })
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to update transfer in Supabase:", error);
          throw error;
        }
      }
    }

    await transfersTable.put(next);
    return next;
  },

  async softDelete(id: string) {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      return;
    }

    const current = await transfersTable.get(id);
    if (!current) {
      return;
    }

    const timestamp = nowIso();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = current.userId || sessionData?.session?.user?.id;
      if (userId) {
        const { error } = await supabase
          .from("transfers")
          .update({ deleted_at: timestamp, updated_at: timestamp })
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to soft-delete transfer in Supabase:", error);
          throw error;
        }
      }
    }

    await transfersTable.update(id, { deletedAt: timestamp, updatedAt: timestamp });
  },

  async stampOwnership(userId: string) {
    const transfersTable = getTransfersTable();
    if (!transfersTable) {
      return;
    }

    const records = await transfersTable.toArray();
    const unclaimed = records.filter((record) => !record.userId);
    if (unclaimed.length === 0) {
      return;
    }

    await Promise.all(
      unclaimed.map((record) =>
        transfersTable.update(record.id, {
          userId,
          updatedAt: nowIso()
        })
      )
    );
  }
};

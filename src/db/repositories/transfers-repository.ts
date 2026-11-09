import { isWithinInterval, parseISO } from "date-fns";
import { appDb, getOptionalTable } from "@/db/dexie";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { syncRepository } from "@/db/repositories/sync-repository";
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

// Mirrors the Flutter app's transfer_logic.dart: the source account is debited
// amount + sourceFee, and the destination account is credited amount - destinationFee.
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
  // When editing, add back the existing transfer's debit so the check uses the
  // balance as if this transfer did not exist.
  if (existingTransfer && existingTransfer.fromAccountId === input.fromAccountId) {
    sourceBalance += existingTransfer.amount + existingTransfer.sourceFee;
  }

  const totalDebit = input.amount + sourceFee;
  if (sourceBalance + 0.0001 < totalDebit) {
    throw new Error("Insufficient balance in the source account for amount plus fee.");
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
          fromAccountName: fromAccount?.name ?? "Unknown source account",
          toAccountName: toAccount?.name ?? "Unknown destination account",
          fromAccountCurrencyCode: settings.currencyCode,
          toAccountCurrencyCode: settings.currencyCode
        };
      })
      .filter((transfer) => {
        const query = filters.query.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          transfer.description.toLowerCase().includes(query) ||
          transfer.fromAccountName.toLowerCase().includes(query) ||
          transfer.toAccountName.toLowerCase().includes(query);
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
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    await transfersTable.add(transfer);
    await syncRepository.enqueue("transfers", transfer.id, "create", JSON.stringify(transfer));
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
      syncStatus: "pending",
      syncError: null,
      updatedAt: nowIso()
    };

    await transfersTable.put(next);
    await syncRepository.enqueue("transfers", next.id, "update", JSON.stringify(next));
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

    const next: TransferRecord = {
      ...current,
      deletedAt: nowIso(),
      syncStatus: "pending",
      syncError: null,
      updatedAt: nowIso()
    };

    await transfersTable.put(next);
    await syncRepository.enqueue("transfers", next.id, "delete", JSON.stringify(next));
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
        transfersTable.put({
          ...record,
          userId,
          syncStatus: "pending",
          syncError: null,
          updatedAt: nowIso()
        })
      )
    );

    await Promise.all(
      unclaimed.map((record) => syncRepository.enqueue("transfers", record.id, "update"))
    );
  }
};

import { appDb, getOptionalTable } from "@/db/dexie";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { syncRepository } from "@/db/repositories/sync-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { transfersRepository } from "@/db/repositories/transfers-repository";
import type { Account, Category, TransactionRecord, TransferRecord } from "@/types";
import { nowIso } from "@/utils/date-utils";

// The JSON shape mirrors the Flutter app's LedgerBackupService (version 1) so a
// backup created on either surface restores on the other. The app uses `date`,
// `note`, and `selectedCurrencyCode`; the web maps those to `transactionDate`,
// `description`, and `currencyCode`.
interface BackupPayload {
  version: number;
  createdAt: string;
  settings?: {
    displayName?: string | null;
    selectedLanguage?: string | null;
    selectedCurrencyCode?: string | null;
    onboardingCompleted?: boolean;
    dailyReminderEnabled?: boolean;
    dailyReminderTime?: string | null;
    themeMode?: string | null;
  };
  accounts?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  transactions?: Array<Record<string, unknown>>;
  transfers?: Array<Record<string, unknown>>;
}

function downloadJson(fileName: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  link.click();
  URL.revokeObjectURL(url);
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export const jsonBackupService = {
  async createBackup(displayName?: string | null) {
    const [accounts, categories, transactions, transfers, settings, notification] = await Promise.all([
      accountsRepository.listActive(),
      categoriesRepository.listActive(),
      transactionsRepository.listActive(),
      transfersRepository.listActive(),
      settingsRepository.getSettings(),
      settingsRepository.getNotificationPreferences()
    ]);

    const payload: BackupPayload = {
      version: 1,
      createdAt: nowIso(),
      settings: {
        displayName: displayName ?? "",
        selectedLanguage: settings.language,
        selectedCurrencyCode: settings.currencyCode,
        onboardingCompleted: settings.onboardingComplete,
        dailyReminderEnabled: notification.enabled,
        dailyReminderTime: notification.reminderTime ?? null,
        themeMode: settings.themeMode
      },
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        openingBalance: account.openingBalance,
        isDefault: account.isDefault,
        displayOrder: account.displayOrder,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        isDefault: category.isDefault,
        iconKey: category.iconKey ?? null,
        colorKey: category.colorKey ?? null,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        categoryId: transaction.categoryId,
        accountId: transaction.accountId,
        date: transaction.transactionDate,
        note: transaction.description,
        affectsAccountBalance: transaction.affectsAccountBalance,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      })),
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amount: transfer.amount,
        sourceFee: transfer.sourceFee,
        destinationFee: transfer.destinationFee,
        date: transfer.transferDate,
        note: transfer.description,
        createdAt: transfer.createdAt,
        updatedAt: transfer.updatedAt
      }))
    };

    downloadJson(`moniilog_backup_${backupTimestamp()}.json`, JSON.stringify(payload, null, 2));
  },

  async restoreBackup(content: string, userId?: string | null) {
    let payload: BackupPayload;
    try {
      payload = JSON.parse(content) as BackupPayload;
    } catch {
      throw new Error("Invalid backup JSON format.");
    }

    if (!payload || typeof payload.version !== "number") {
      throw new Error("Unsupported backup format.");
    }

    const timestamp = nowIso();
    const owner = userId ?? null;

    const accounts: Account[] = (payload.accounts ?? []).map((raw) => ({
      id: asString(raw.id),
      name: asString(raw.name, "Account"),
      type: (raw.type as Account["type"]) ?? "other",
      openingBalance: Number(raw.openingBalance ?? 0),
      isDefault: Boolean(raw.isDefault),
      displayOrder: Number(raw.displayOrder ?? 0),
      userId: owner,
      remoteId: null,
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: asString(raw.createdAt, timestamp),
      updatedAt: timestamp,
      deletedAt: null
    }));

    const categories: Category[] = (payload.categories ?? []).map((raw) => ({
      id: asString(raw.id),
      name: asString(raw.name, "Category"),
      type: (raw.type as Category["type"]) ?? "expense",
      iconKey: (raw.iconKey as string | null | undefined) ?? null,
      colorKey: (raw.colorKey as string | null | undefined) ?? null,
      isDefault: Boolean(raw.isDefault),
      userId: owner,
      remoteId: null,
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: asString(raw.createdAt, timestamp),
      updatedAt: timestamp,
      deletedAt: null
    }));

    const transactions: TransactionRecord[] = (payload.transactions ?? []).map((raw) => ({
      id: asString(raw.id),
      accountId: asString(raw.accountId),
      categoryId: (raw.categoryId as string | null | undefined) ?? null,
      type: (raw.type as TransactionRecord["type"]) ?? "expense",
      amount: Number(raw.amount ?? 0),
      description: asString(raw.note),
      affectsAccountBalance: raw.affectsAccountBalance === undefined ? true : Boolean(raw.affectsAccountBalance),
      transactionDate: asString(raw.date, timestamp),
      userId: owner,
      remoteId: null,
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: asString(raw.createdAt, timestamp),
      updatedAt: timestamp,
      deletedAt: null
    }));

    const transfers: TransferRecord[] = (payload.transfers ?? []).map((raw) => {
      const sourceFee = Number(raw.sourceFee ?? 0);
      const destinationFee = Number(raw.destinationFee ?? 0);
      return {
        id: asString(raw.id),
        fromAccountId: asString(raw.fromAccountId),
        toAccountId: asString(raw.toAccountId),
        amount: Number(raw.amount ?? 0),
        fee: sourceFee + destinationFee,
        sourceFee,
        destinationFee,
        description: asString(raw.note),
        transferDate: asString(raw.date, timestamp),
        userId: owner,
        remoteId: null,
        syncStatus: "pending",
        syncError: null,
        lastSyncedAt: null,
        createdAt: asString(raw.createdAt, timestamp),
        updatedAt: timestamp,
        deletedAt: null
      };
    });

    const transfersTable = getOptionalTable<TransferRecord>("transfers");
    const tables = [
      appDb.accounts,
      appDb.categories,
      appDb.transactions,
      ...(transfersTable ? [transfersTable] : [])
    ];

    await appDb.transaction("rw", tables, async () => {
      await appDb.accounts.clear();
      await appDb.categories.clear();
      await appDb.transactions.clear();
      await appDb.accounts.bulkPut(accounts);
      await appDb.categories.bulkPut(categories);
      await appDb.transactions.bulkPut(transactions);
      if (transfersTable) {
        await transfersTable.clear();
        await transfersTable.bulkPut(transfers);
      }
    });

    if (payload.settings) {
      await settingsRepository.updateSettings({
        currencyCode: payload.settings.selectedCurrencyCode ?? undefined,
        language: (payload.settings.selectedLanguage as "en" | "fr" | undefined) ?? undefined,
        onboardingComplete: payload.settings.onboardingCompleted ?? true,
        userId: owner
      });
      await settingsRepository.updateNotificationPreferences({
        enabled: payload.settings.dailyReminderEnabled ?? false,
        reminderTime: payload.settings.dailyReminderTime ?? "20:00",
        userId: owner
      });
    }

    // Queue every restored record for the next sync run.
    await Promise.all([
      ...accounts.map((record) => syncRepository.enqueue("accounts", record.id, "update")),
      ...categories.map((record) => syncRepository.enqueue("categories", record.id, "update")),
      ...transactions.map((record) => syncRepository.enqueue("transactions", record.id, "update")),
      ...transfers.map((record) => syncRepository.enqueue("transfers", record.id, "update"))
    ]);
  }
};

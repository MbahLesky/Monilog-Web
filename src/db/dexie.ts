import Dexie, { type IndexableType, type Table } from "dexie";
import type {
  Account,
  AppSettings,
  Budget,
  Category,
  ExportRecord,
  ImportRecord,
  NotificationPreference,
  RecurringTransaction,
  SyncOperationRecord,
  TransferRecord,
  TransactionRecord
} from "@/types";

export class FinanceLedgerDatabase extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<TransactionRecord, string>;
  transfers!: Table<TransferRecord, string>;
  budgets!: Table<Budget, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  settings!: Table<AppSettings, string>;
  notificationPreferences!: Table<NotificationPreference, string>;
  importRecords!: Table<ImportRecord, string>;
  exportRecords!: Table<ExportRecord, string>;
  syncOperations!: Table<SyncOperationRecord, string>;

  constructor() {
    super("finance-ledger-web");

    this.version(1).stores({
      accounts: "id, userId, name, type, syncStatus, updatedAt, deletedAt, displayOrder",
      categories: "id, userId, [type+name], syncStatus, updatedAt, deletedAt, isActive",
      transactions:
        "id, userId, accountId, categoryId, transactionDate, type, syncStatus, updatedAt, deletedAt",
      settings: "id, userId, updatedAt, onboardingComplete",
      notificationPreferences: "id, userId, updatedAt, enabled",
      importRecords: "id, createdAt, status",
      exportRecords: "id, createdAt",
      syncOperations: "id, entityName, entityId, [entityName+entityId], status, updatedAt, createdAt"
    });

    this.version(2).stores({
      accounts: "id, userId, name, type, syncStatus, updatedAt, deletedAt, displayOrder",
      categories: "id, userId, [type+name], syncStatus, updatedAt, deletedAt, isActive",
      transactions:
        "id, userId, accountId, categoryId, transactionDate, type, syncStatus, updatedAt, deletedAt",
      transfers:
        "id, userId, fromAccountId, toAccountId, transferDate, syncStatus, updatedAt, deletedAt",
      settings: "id, userId, updatedAt, onboardingComplete",
      notificationPreferences: "id, userId, updatedAt, enabled",
      importRecords: "id, createdAt, status",
      exportRecords: "id, createdAt",
      syncOperations: "id, entityName, entityId, [entityName+entityId], status, updatedAt, createdAt"
    });

    // v3 aligns the web data model with the Flutter app (source of truth):
    // account.openingBalance, category.isDefault, transaction.description +
    // affectsAccountBalance, transfer source/destination fees, and settings
    // language + tutorial state. See src/db/seed/default-records.ts.
    this.version(3)
      .stores({
        accounts: "id, userId, name, type, syncStatus, updatedAt, deletedAt, displayOrder",
        categories: "id, userId, [type+name], syncStatus, updatedAt, deletedAt, isDefault",
        transactions:
          "id, userId, accountId, categoryId, transactionDate, type, syncStatus, updatedAt, deletedAt",
        transfers:
          "id, userId, fromAccountId, toAccountId, transferDate, syncStatus, updatedAt, deletedAt",
        settings: "id, userId, updatedAt, onboardingComplete",
        notificationPreferences: "id, userId, updatedAt, enabled",
        importRecords: "id, createdAt, status",
        exportRecords: "id, createdAt",
        syncOperations: "id, entityName, entityId, [entityName+entityId], status, updatedAt, createdAt"
      })
      .upgrade(async (tx) => {
        await tx.table("accounts").toCollection().modify((account: Record<string, unknown>) => {
          if (account.openingBalance === undefined) {
            account.openingBalance = account.initialBalance ?? 0;
          }
          delete account.initialBalance;
          delete account.currencyCode;
          delete account.isArchived;
        });

        await tx.table("categories").toCollection().modify((category: Record<string, unknown>) => {
          if (category.isDefault === undefined) {
            category.isDefault = Boolean(category.isSystem);
          }
          delete category.isSystem;
          delete category.isActive;
        });

        await tx.table("transactions").toCollection().modify((transaction: Record<string, unknown>) => {
          if (transaction.description === undefined) {
            transaction.description = transaction.note ?? "";
          }
          if (transaction.affectsAccountBalance === undefined) {
            transaction.affectsAccountBalance = true;
          }
          delete transaction.note;
          delete transaction.reference;
        });

        await tx.table("transfers").toCollection().modify((transfer: Record<string, unknown>) => {
          const fee = Number(transfer.fee ?? 0);
          if (transfer.sourceFee === undefined) {
            transfer.sourceFee = fee;
          }
          if (transfer.destinationFee === undefined) {
            transfer.destinationFee = 0;
          }
          transfer.fee = Number(transfer.sourceFee ?? 0) + Number(transfer.destinationFee ?? 0);
          if (transfer.description === undefined) {
            transfer.description = transfer.note ?? "";
          }
          delete transfer.note;
        });

        await tx.table("settings").toCollection().modify((settings: Record<string, unknown>) => {
          if (settings.language === undefined) {
            settings.language = "en";
          }
          if (settings.tutorialCompletedIds === undefined) {
            settings.tutorialCompletedIds = [];
          }
        });
      });

    // v4 adds budgets and recurring transactions
    this.version(4).stores({
      accounts: "id, userId, name, type, syncStatus, updatedAt, deletedAt, displayOrder",
      categories: "id, userId, [type+name], syncStatus, updatedAt, deletedAt, isDefault",
      transactions:
        "id, userId, accountId, categoryId, transactionDate, type, syncStatus, updatedAt, deletedAt",
      transfers:
        "id, userId, fromAccountId, toAccountId, transferDate, syncStatus, updatedAt, deletedAt",
      budgets: "id, userId, categoryId, period, syncStatus, updatedAt, deletedAt",
      recurringTransactions:
        "id, userId, accountId, categoryId, nextOccurrence, isActive, syncStatus, updatedAt, deletedAt",
      settings: "id, userId, updatedAt, onboardingComplete",
      notificationPreferences: "id, userId, updatedAt, enabled",
      importRecords: "id, createdAt, status",
      exportRecords: "id, createdAt",
      syncOperations: "id, entityName, entityId, [entityName+entityId], status, updatedAt, createdAt"
    });

    this.accounts = this.table("accounts");
    this.categories = this.table("categories");
    this.transactions = this.table("transactions");
    this.transfers = this.table("transfers");
    this.budgets = this.table("budgets");
    this.recurringTransactions = this.table("recurringTransactions");
    this.settings = this.table("settings");
    this.notificationPreferences = this.table("notificationPreferences");
    this.importRecords = this.table("importRecords");
    this.exportRecords = this.table("exportRecords");
    this.syncOperations = this.table("syncOperations");
  }
}

export const appDb = new FinanceLedgerDatabase();

export function getOptionalTable<RecordType, KeyType extends IndexableType = string>(
  tableName: string
) {
  const table = appDb.tables.find((candidate) => candidate.name === tableName);
  return (table as Table<RecordType, KeyType> | undefined) ?? null;
}

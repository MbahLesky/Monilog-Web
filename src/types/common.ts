export type SyncStatus = "pending" | "synced" | "failed";

export type TransactionType = "income" | "expense";
export type LedgerEntryType = TransactionType | "transfer";

export type ThemeMode = "light" | "dark" | "system";

export type AccountType =
  | "cash"
  | "bank"
  | "mobile_money"
  | "wallet"
  | "savings"
  | "other";

export type SyncEntityName =
  | "accounts"
  | "categories"
  | "transactions"
  | "transfers"
  | "settings"
  | "notificationPreferences"
  | "budgets"
  | "recurringTransactions";

export type SyncOperationType = "create" | "update" | "delete";

export interface SyncableEntity {
  id: string;
  remoteId?: string | null;
  userId?: string | null;
  syncStatus: SyncStatus;
  syncError?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface AsyncState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

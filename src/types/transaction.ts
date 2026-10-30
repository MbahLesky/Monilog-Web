import type { LedgerEntryType, SyncableEntity, TransactionType } from "@/types/common";

export interface TransactionRecord extends SyncableEntity {
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  currencyCode?: string;
  description: string;
  affectsAccountBalance: boolean;
  transactionDate: string;
}

export interface TransactionFilters {
  query: string;
  type: LedgerEntryType | "all";
  categoryId: string | "all";
  accountId: string | "all";
  range: "all" | "today" | "7d" | "30d" | "custom";
  startDate?: string;
  endDate?: string;
}

export interface TransactionListItem extends TransactionRecord {
  accountName: string;
  accountCurrencyCode: string;
  categoryName: string;
  categoryColorKey?: string | null;
  categoryIconKey?: string | null;
}

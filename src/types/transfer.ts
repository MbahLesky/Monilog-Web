import type { SyncableEntity } from "@/types/common";

export interface TransferRecord extends SyncableEntity {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currencyCode?: string;
  /** Total fee, kept as a convenience mirror of sourceFee + destinationFee. */
  fee: number;
  sourceFee: number;
  destinationFee: number;
  description: string;
  transferDate: string;
}

export interface TransferFilters {
  query: string;
  accountId: string | "all";
  range: "all" | "today" | "7d" | "30d" | "custom";
  startDate?: string;
  endDate?: string;
}

export interface TransferListItem extends TransferRecord {
  fromAccountName: string;
  toAccountName: string;
  fromAccountCurrencyCode: string;
  toAccountCurrencyCode: string;
}

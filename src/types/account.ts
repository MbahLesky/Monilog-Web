import type { AccountType, SyncableEntity } from "@/types/common";

export interface Account extends SyncableEntity {
  name: string;
  type: AccountType;
  openingBalance: number;
  isDefault: boolean;
  displayOrder: number;
  presetKey?: string | null;
  currencyCode?: string;
  balanceResetAt?: string | null;
}

export interface AccountBalanceSnapshot extends Account {
  currentBalance: number;
  incomeTotal: number;
  expenseTotal: number;
}

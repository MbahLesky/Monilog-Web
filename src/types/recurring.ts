import type { SyncableEntity, TransactionType } from "./common";

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringTransaction extends SyncableEntity {
  accountId: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: number; // in major units (e.g. 5000 XAF)
  description: string;
  frequency: RecurringFrequency;
  nextOccurrence: string;
  isActive: boolean;
}

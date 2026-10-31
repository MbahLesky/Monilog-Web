import type { SyncableEntity } from "./common";

export type BudgetPeriod = "weekly" | "monthly" | "yearly";

export interface Budget extends SyncableEntity {
  categoryId: string;
  amount: number; // in major units (e.g. 50000 XAF)
  period: BudgetPeriod;
}

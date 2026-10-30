import type { SyncableEntity, TransactionType } from "@/types/common";

export interface Category extends SyncableEntity {
  name: string;
  type: TransactionType;
  iconKey?: string | null;
  colorKey?: string | null;
  isDefault: boolean;
  presetKey?: string | null;
  displayOrder?: number;
}

import { appDb } from "@/db/dexie";
import { syncRepository } from "@/db/repositories/sync-repository";
import type { RecurringFrequency, RecurringTransaction, TransactionType } from "@/types";
import { nowIso } from "@/utils/date-utils";

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const recurringRepository = {
  async listActive(userId?: string): Promise<RecurringTransaction[]> {
    return appDb.recurringTransactions
      .filter((r) => !r.deletedAt && (!userId || !r.userId || r.userId === userId))
      .toArray();
  },

  async get(id: string): Promise<RecurringTransaction | undefined> {
    return appDb.recurringTransactions.get(id);
  },

  async upsert(input: {
    id?: string;
    accountId: string;
    categoryId?: string | null;
    type: TransactionType;
    amount: number;
    description: string;
    frequency?: RecurringFrequency;
    nextOccurrence?: string;
    isActive?: boolean;
    userId?: string | null;
  }): Promise<RecurringTransaction> {
    const timestamp = nowIso();

    if (input.id) {
      const existing = await appDb.recurringTransactions.get(input.id);
      if (existing) {
        const updated: RecurringTransaction = {
          ...existing,
          accountId: input.accountId,
          categoryId: input.categoryId ?? null,
          type: input.type,
          amount: input.amount,
          description: input.description,
          frequency: input.frequency ?? existing.frequency,
          nextOccurrence: input.nextOccurrence ?? existing.nextOccurrence,
          isActive: input.isActive ?? existing.isActive,
          userId: input.userId ?? existing.userId ?? null,
          syncStatus: "pending",
          syncError: null,
          updatedAt: timestamp
        };
        await appDb.recurringTransactions.put(updated);
        await syncRepository.enqueue("recurringTransactions", updated.id, "update", JSON.stringify(updated));
        return updated;
      }
    }

    const created: RecurringTransaction = {
      id: input.id ?? generateUuid(),
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amount: input.amount,
      description: input.description,
      frequency: input.frequency ?? "monthly",
      nextOccurrence: input.nextOccurrence ?? timestamp,
      isActive: input.isActive ?? true,
      userId: input.userId ?? null,
      remoteId: null,
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    await appDb.recurringTransactions.add(created);
    await syncRepository.enqueue("recurringTransactions", created.id, "create", JSON.stringify(created));
    return created;
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const existing = await appDb.recurringTransactions.get(id);
    if (!existing) return;

    const timestamp = nowIso();
    const updated: RecurringTransaction = {
      ...existing,
      isActive,
      syncStatus: "pending",
      syncError: null,
      updatedAt: timestamp
    };

    await appDb.recurringTransactions.put(updated);
    await syncRepository.enqueue("recurringTransactions", id, "update", JSON.stringify(updated));
  },

  async delete(id: string): Promise<void> {
    const existing = await appDb.recurringTransactions.get(id);
    if (!existing) return;

    const timestamp = nowIso();
    const deleted: RecurringTransaction = {
      ...existing,
      deletedAt: timestamp,
      syncStatus: "pending",
      syncError: null,
      updatedAt: timestamp
    };

    await appDb.recurringTransactions.put(deleted);
    await syncRepository.enqueue("recurringTransactions", id, "delete", JSON.stringify(deleted));
  }
};

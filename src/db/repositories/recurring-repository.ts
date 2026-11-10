import { appDb } from "@/db/dexie";
import { supabase } from "@/lib/supabase-client";
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
    const recurringId = input.id ?? generateUuid();

    let existing: RecurringTransaction | undefined;
    if (input.id) {
      existing = await appDb.recurringTransactions.get(input.id);
    }

    let currentUserId = input.userId ?? existing?.userId ?? null;
    const frequency = input.frequency ?? existing?.frequency ?? "monthly";
    const nextOccurrence = input.nextOccurrence ?? existing?.nextOccurrence ?? timestamp;
    const isActive = input.isActive ?? existing?.isActive ?? true;

    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        currentUserId = currentUserId || sessionData?.session?.user?.id || null;
        if (currentUserId) {
          await supabase.from("recurring_transactions").upsert({
            id: recurringId,
            user_id: currentUserId,
            account_id: input.accountId,
            category_id: input.categoryId || null,
            type: input.type,
            amount_minor: Math.round(input.amount * 100),
            description: input.description,
            frequency,
            next_occurrence: nextOccurrence,
            is_active: isActive,
            updated_at: timestamp
          });
        }
      } catch (e) {
        console.error("[Direct DB] Failed to upsert recurring transaction:", e);
      }
    }

    const record: RecurringTransaction = {
      id: recurringId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amount: input.amount,
      description: input.description,
      frequency,
      nextOccurrence,
      isActive,
      userId: currentUserId,
      remoteId: recurringId,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    await appDb.recurringTransactions.put(record);
    return record;
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const existing = await appDb.recurringTransactions.get(id);
    if (!existing) return;

    const timestamp = nowIso();
    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = existing.userId || sessionData?.session?.user?.id;
        if (userId) {
          await supabase
            .from("recurring_transactions")
            .update({ is_active: isActive, updated_at: timestamp })
            .eq("id", id)
            .eq("user_id", userId);
        }
      } catch (e) {
        console.error("[Direct DB] Failed to toggle recurring active:", e);
      }
    }

    await appDb.recurringTransactions.update(id, { isActive, updatedAt: timestamp });
  },

  async delete(id: string): Promise<void> {
    const existing = await appDb.recurringTransactions.get(id);
    if (!existing) return;

    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = existing.userId || sessionData?.session?.user?.id;
        if (userId) {
          await supabase.from("recurring_transactions").delete().eq("id", id).eq("user_id", userId);
        }
      } catch (e) {
        console.error("[Direct DB] Failed to delete recurring transaction:", e);
      }
    }

    await appDb.recurringTransactions.delete(id);
  }
};

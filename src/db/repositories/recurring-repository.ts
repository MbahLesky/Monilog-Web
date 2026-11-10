import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
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
  async listActive(userIdOverride?: string): Promise<RecurringTransaction[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const { data, error } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("[recurringRepository.listActive] Supabase error:", error);
      return [];
    }

    return (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      accountId: r.account_id,
      categoryId: r.category_id,
      type: r.type as TransactionType,
      amount: Number(r.amount_minor || 0) / 100,
      description: r.description || "",
      frequency: r.frequency as RecurringFrequency,
      nextOccurrence: r.next_occurrence,
      isActive: r.is_active ?? true,
      createdAt: r.created_at || nowIso(),
      updatedAt: r.updated_at || nowIso(),
      deletedAt: null,
      remoteId: r.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
  },

  async get(id: string): Promise<RecurringTransaction | undefined> {
    const list = await this.listActive();
    return list.find((r) => r.id === id);
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
    const userId = await getCurrentUserId(input.userId);
    if (!userId || !supabase) {
      throw new Error("Please sign in to configure recurring rules.");
    }

    const timestamp = nowIso();
    const recurringId = input.id ?? generateUuid();
    const frequency = input.frequency ?? "monthly";
    const nextOccurrence = input.nextOccurrence ?? timestamp;
    const isActive = input.isActive ?? true;

    const { error } = await supabase.from("recurring_transactions").upsert({
      id: recurringId,
      user_id: userId,
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

    if (error) {
      console.error("[Direct DB] Failed to upsert recurring transaction:", error);
      throw error;
    }

    notifyDatabaseChange();

    return {
      id: recurringId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amount: input.amount,
      description: input.description,
      frequency,
      nextOccurrence,
      isActive,
      userId,
      remoteId: recurringId,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const timestamp = nowIso();
    const { error } = await supabase
      .from("recurring_transactions")
      .update({ is_active: isActive, updated_at: timestamp })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Direct DB] Failed to toggle recurring active:", error);
      throw error;
    }

    notifyDatabaseChange();
  },

  async delete(id: string): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const { error } = await supabase.from("recurring_transactions").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      console.error("[Direct DB] Failed to delete recurring transaction:", error);
      throw error;
    }

    notifyDatabaseChange();
  }
};

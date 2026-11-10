import { appDb } from "@/db/dexie";
import { createDefaultCategories } from "@/db/seed/default-records";
import { supabase } from "@/lib/supabase-client";
import type { Category, TransactionType } from "@/types";
import { nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";

async function ensureDefaultCategories() {
  const count = await appDb.categories.count();
  if (count === 0) {
    await appDb.categories.bulkPut(createDefaultCategories());
  }
}

export const categoriesRepository = {
  async listActive() {
    await ensureDefaultCategories();
    const categories = await appDb.categories.filter((item) => !item.deletedAt).toArray();
    return categories.sort((left, right) => left.name.localeCompare(right.name));
  },

  async listByType(type: TransactionType) {
    const categories = await this.listActive();
    return categories.filter((category) => category.type === type);
  },

  async getById(id: string) {
    await ensureDefaultCategories();
    return appDb.categories.get(id);
  },

  async findMatch(name: string, type: TransactionType) {
    await ensureDefaultCategories();
    const normalized = name.trim().toLowerCase();
    return appDb.categories
      .filter(
        (category) =>
          !category.deletedAt &&
          category.type === type &&
          category.name.trim().toLowerCase() === normalized
      )
      .first();
  },

  async createCategory(input: {
    name: string;
    type: TransactionType;
    colorKey?: string | null;
    iconKey?: string | null;
    userId?: string | null;
  }) {
    const timestamp = nowIso();
    const category: Category = {
      id: createId("category"),
      name: input.name.trim(),
      type: input.type,
      colorKey: input.colorKey ?? (input.type === "income" ? "success" : "danger"),
      iconKey: input.iconKey ?? null,
      isDefault: false,
      userId: input.userId ?? null,
      remoteId: null,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = input.userId || sessionData?.session?.user?.id;
      if (userId) {
        category.userId = userId;
        const { error } = await supabase.from("categories").insert({
          id: category.id,
          user_id: userId,
          name: category.name,
          type: category.type,
          icon_key: category.iconKey,
          color_key: category.colorKey,
          is_default: false,
          updated_at: timestamp
        });
        if (error) {
          console.error("[Direct DB] Failed to create category in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.categories.add(category);
    return category;
  },

  async updateCategory(
    id: string,
    updates: Partial<Pick<Category, "name" | "colorKey" | "iconKey" | "userId">>
  ) {
    const current = await appDb.categories.get(id);
    if (!current) {
      throw new Error("Category not found.");
    }

    const timestamp = nowIso();
    const next: Category = {
      ...current,
      ...updates,
      syncStatus: "synced",
      syncError: null,
      updatedAt: timestamp
    };

    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = next.userId || sessionData?.session?.user?.id;
      if (userId) {
        const payload: Record<string, unknown> = { updated_at: timestamp };
        if (updates.name !== undefined) payload.name = updates.name.trim();
        if (updates.colorKey !== undefined) payload.color_key = updates.colorKey;
        if (updates.iconKey !== undefined) payload.icon_key = updates.iconKey;

        const { error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to update category in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.categories.put(next);
    return next;
  },

  async softDelete(id: string) {
    const category = await appDb.categories.get(id);
    if (!category || category.isDefault) {
      return;
    }

    const timestamp = nowIso();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = category.userId || sessionData?.session?.user?.id;
      if (userId) {
        const { error } = await supabase
          .from("categories")
          .update({ deleted_at: timestamp, updated_at: timestamp })
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          console.error("[Direct DB] Failed to soft-delete category in Supabase:", error);
          throw error;
        }
      }
    }

    await appDb.categories.update(id, { deletedAt: timestamp, updatedAt: timestamp });
  },

  async stampOwnership(userId: string) {
    const records = await appDb.categories.toArray();
    const unclaimed = records.filter((record) => !record.userId);
    if (unclaimed.length === 0) {
      return;
    }
    await Promise.all(
      unclaimed.map((record) =>
        this.updateCategory(record.id, {
          userId
        })
      )
    );
  }
};

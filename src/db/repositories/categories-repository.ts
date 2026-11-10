import { DEFAULT_CATEGORY_SEEDS } from "@/lib/constants";
import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
import type { Category, TransactionType } from "@/types";
import { nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";

export const categoriesRepository = {
  async listActive(userIdOverride?: string | null): Promise<Category[]> {
    const userId = await getCurrentUserId(userIdOverride);
    if (!userId || !supabase) return [];

    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[categoriesRepository.listActive] Supabase error:", error);
      return [];
    }

    if (!data || data.length === 0) {
      // Seed default categories directly into Supabase!
      const timestamp = nowIso();
      const defaultRows = DEFAULT_CATEGORY_SEEDS.map((cat, index) => ({
        id: cat.id,
        user_id: userId,
        preset_key: null,
        name: cat.name,
        type: cat.type,
        icon_key: cat.iconKey,
        color_key: cat.colorKey,
        is_default: true,
        display_order: index,
        updated_at: timestamp
      }));

      await supabase.from("categories").upsert(defaultRows);

      return defaultRows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        presetKey: null,
        name: r.name,
        type: r.type as TransactionType,
        iconKey: r.icon_key,
        colorKey: r.color_key,
        isDefault: r.is_default,
        displayOrder: r.display_order,
        createdAt: r.updated_at,
        updatedAt: r.updated_at,
        deletedAt: null,
        remoteId: r.id,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: r.updated_at
      }));
    }

    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      presetKey: row.preset_key,
      name: row.name,
      type: row.type as TransactionType,
      iconKey: row.icon_key,
      colorKey: row.color_key,
      isDefault: row.is_default ?? false,
      displayOrder: row.display_order ?? 0,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: row.deleted_at || null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
  },

  async listByType(type: TransactionType, userIdOverride?: string | null) {
    const categories = await this.listActive(userIdOverride);
    return categories.filter((category) => category.type === type);
  },

  async getById(id: string, userIdOverride?: string | null) {
    const categories = await this.listActive(userIdOverride);
    return categories.find((c) => c.id === id);
  },

  async findMatch(name: string, type: TransactionType, userIdOverride?: string | null) {
    const categories = await this.listActive(userIdOverride);
    const normalized = name.trim().toLowerCase();
    return categories.find(
      (c) => c.type === type && c.name.trim().toLowerCase() === normalized
    );
  },

  async createCategory(input: {
    name: string;
    type: TransactionType;
    colorKey?: string | null;
    iconKey?: string | null;
    userId?: string | null;
  }) {
    const userId = await getCurrentUserId(input.userId);
    if (!userId || !supabase) {
      throw new Error("Please sign in to add a category.");
    }

    const timestamp = nowIso();
    const id = createId("category");

    const { error } = await supabase.from("categories").insert({
      id,
      user_id: userId,
      name: input.name.trim(),
      type: input.type,
      icon_key: input.iconKey ?? null,
      color_key: input.colorKey ?? (input.type === "income" ? "success" : "danger"),
      is_default: false,
      updated_at: timestamp
    });

    if (error) {
      console.error("[Direct DB] Failed to create category in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();

    return {
      id,
      name: input.name.trim(),
      type: input.type,
      colorKey: input.colorKey ?? (input.type === "income" ? "success" : "danger"),
      iconKey: input.iconKey ?? null,
      isDefault: false,
      displayOrder: 99,
      userId,
      remoteId: id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };
  },

  async updateCategory(
    id: string,
    updates: Partial<Pick<Category, "name" | "colorKey" | "iconKey" | "userId">>
  ) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) {
      throw new Error("Please sign in.");
    }

    const timestamp = nowIso();
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

    notifyDatabaseChange();
  },

  async softDelete(id: string) {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;

    const timestamp = nowIso();
    const { error } = await supabase
      .from("categories")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Direct DB] Failed to soft-delete category in Supabase:", error);
      throw error;
    }

    notifyDatabaseChange();
  },

  async stampOwnership(_userId: string) {}
};

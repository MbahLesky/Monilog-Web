import { appDb } from "@/db/dexie";
import { createDefaultCategories } from "@/db/seed/default-records";
import type { Category, TransactionType } from "@/types";
import { nowIso } from "@/utils/date-utils";
import { createId } from "@/utils/id";
import { syncRepository } from "@/db/repositories/sync-repository";

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
      syncStatus: "pending",
      syncError: null,
      lastSyncedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };

    await appDb.categories.add(category);
    await syncRepository.enqueue("categories", category.id, "create", JSON.stringify(category));
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

    const next: Category = {
      ...current,
      ...updates,
      syncStatus: "pending",
      syncError: null,
      updatedAt: nowIso()
    };

    await appDb.categories.put(next);
    await syncRepository.enqueue("categories", next.id, "update", JSON.stringify(next));
    return next;
  },

  async softDelete(id: string) {
    const category = await appDb.categories.get(id);
    if (!category || category.isDefault) {
      return;
    }

    const next: Category = {
      ...category,
      deletedAt: nowIso(),
      syncStatus: "pending",
      syncError: null,
      updatedAt: nowIso()
    };

    await appDb.categories.put(next);
    await syncRepository.enqueue("categories", next.id, "delete", JSON.stringify(next));
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

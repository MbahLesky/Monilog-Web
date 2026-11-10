import { appDb, getOptionalTable } from "@/db/dexie";
import { syncRepository } from "@/db/repositories/sync-repository";
import { supabase } from "@/lib/supabase-client";
import type {
  Account,
  AppSettings,
  Budget,
  Category,
  NotificationPreference,
  RecurringTransaction,
  SyncEntityName,
  SyncOperationRecord,
  TransferRecord,
  TransactionRecord
} from "@/types";
import { nowIso } from "@/utils/date-utils";

type SyncableRecord =
  | Account
  | Category
  | TransactionRecord
  | TransferRecord
  | Budget
  | RecurringTransaction
  | AppSettings
  | NotificationPreference;

function assertSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

function getSyncTable(entityName: SyncEntityName) {
  if (entityName === "accounts") return appDb.accounts;
  if (entityName === "categories") return appDb.categories;
  if (entityName === "transactions") return appDb.transactions;
  if (entityName === "transfers") {
    const table = getOptionalTable<TransferRecord>("transfers");
    if (!table) throw new Error("Transfers table is unavailable.");
    return table;
  }
  if (entityName === "budgets") return appDb.budgets;
  if (entityName === "recurringTransactions") return appDb.recurringTransactions;
  if (entityName === "settings") return appDb.settings;
  return appDb.notificationPreferences;
}

async function markLocalSynced(entityName: SyncEntityName, entityId: string, remoteId: string) {
  const table = getSyncTable(entityName) as {
    get: (id: string) => Promise<SyncableRecord | undefined>;
    put: (record: SyncableRecord) => Promise<unknown>;
  };
  const record = await table.get(entityId);
  if (!record) return;

  await table.put({
    ...record,
    remoteId,
    syncStatus: "synced",
    syncError: null,
    lastSyncedAt: nowIso()
  });
}

async function markLocalFailed(entityName: SyncEntityName, entityId: string, errorMessage: string) {
  const table = getSyncTable(entityName) as {
    get: (id: string) => Promise<SyncableRecord | undefined>;
    put: (record: SyncableRecord) => Promise<unknown>;
  };
  const record = await table.get(entityId);
  if (!record) return;

  await table.put({
    ...record,
    syncStatus: "failed",
    syncError: errorMessage
  });
}

async function writeEntityToDatabase(
  entityName: SyncEntityName,
  entityId: string,
  userId: string,
  operationType?: string
) {
  const client = assertSupabase();
  const table = getSyncTable(entityName);
  const record = (await table.get(entityId)) as SyncableRecord | undefined;

  if (!record) {
    if (operationType === "delete") {
      if (entityName === "budgets") {
        await client.from("budgets").delete().eq("id", entityId).eq("user_id", userId);
      } else if (entityName === "recurringTransactions") {
        await client.from("recurring_transactions").delete().eq("id", entityId).eq("user_id", userId);
      }
    }
    return;
  }

  if (entityName === "accounts") {
    const a = record as Account;
    const { error } = await client.from("accounts").upsert({
      id: a.id,
      user_id: userId,
      preset_key: a.presetKey || null,
      name: a.name,
      type: a.type,
      opening_balance_minor: Math.round((a.openingBalance || 0) * 100),
      currency_code: a.currencyCode || "XAF",
      is_default: a.isDefault ?? false,
      display_order: a.displayOrder ?? 0,
      balance_reset_at: a.balanceResetAt || "1970-01-01T00:00:00.000Z",
      updated_at: nowIso(),
      deleted_at: a.deletedAt || null
    });
    if (error) throw error;
  } else if (entityName === "categories") {
    const c = record as Category;
    const { error } = await client.from("categories").upsert({
      id: c.id,
      user_id: userId,
      preset_key: c.presetKey || null,
      name: c.name,
      type: c.type,
      icon_key: c.iconKey || null,
      color_key: c.colorKey || null,
      is_default: c.isDefault ?? false,
      display_order: c.displayOrder ?? 0,
      updated_at: nowIso(),
      deleted_at: c.deletedAt || null
    });
    if (error) throw error;
  } else if (entityName === "transactions") {
    const t = record as TransactionRecord;
    const { error } = await client.from("transactions").upsert({
      id: t.id,
      user_id: userId,
      account_id: t.accountId,
      category_id: t.categoryId || null,
      type: t.type,
      amount_minor: Math.round((t.amount || 0) * 100),
      currency_code: t.currencyCode || "XAF",
      description: t.description || "",
      affects_account_balance: t.affectsAccountBalance ?? true,
      transaction_date: t.transactionDate,
      updated_at: nowIso(),
      deleted_at: t.deletedAt || null
    });
    if (error) throw error;
  } else if (entityName === "transfers") {
    const tf = record as TransferRecord;
    const { error } = await client.from("transfers").upsert({
      id: tf.id,
      user_id: userId,
      from_account_id: tf.fromAccountId,
      to_account_id: tf.toAccountId,
      amount_minor: Math.round((tf.amount || 0) * 100),
      source_fee_minor: Math.round((tf.sourceFee || 0) * 100),
      destination_fee_minor: Math.round((tf.destinationFee || 0) * 100),
      currency_code: tf.currencyCode || "XAF",
      description: tf.description || "",
      transfer_date: tf.transferDate,
      updated_at: nowIso(),
      deleted_at: tf.deletedAt || null
    });
    if (error) throw error;
  } else if (entityName === "budgets") {
    const b = record as Budget;
    if (b.deletedAt || operationType === "delete") {
      const { error } = await client.from("budgets").delete().eq("id", b.id).eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await client.from("budgets").upsert({
        id: b.id,
        user_id: userId,
        category_id: b.categoryId,
        amount_minor: Math.round((b.amount || 0) * 100),
        period: b.period,
        updated_at: nowIso()
      });
      if (error) throw error;
    }
  } else if (entityName === "recurringTransactions") {
    const r = record as RecurringTransaction;
    if (r.deletedAt || operationType === "delete") {
      const { error } = await client.from("recurring_transactions").delete().eq("id", r.id).eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await client.from("recurring_transactions").upsert({
        id: r.id,
        user_id: userId,
        account_id: r.accountId,
        category_id: r.categoryId || null,
        type: r.type,
        amount_minor: Math.round((r.amount || 0) * 100),
        description: r.description || "",
        frequency: r.frequency,
        next_occurrence: r.nextOccurrence,
        is_active: r.isActive,
        updated_at: nowIso()
      });
      if (error) throw error;
    }
  } else if (entityName === "settings") {
    const s = record as AppSettings;
    const tutorialIdsStr = Array.isArray(s.tutorialCompletedIds)
      ? s.tutorialCompletedIds.join(",")
      : String(s.tutorialCompletedIds || "");
    const { error } = await client.from("profiles").upsert({
      id: userId,
      preferred_currency: s.currencyCode || "XAF",
      preferred_language: s.language || "en",
      theme_mode: s.themeMode || "system",
      onboarding_completed: s.onboardingComplete ?? true,
      tutorial_completed_ids: tutorialIdsStr,
      updated_at: nowIso()
    });
    if (error) throw error;
  }

  await markLocalSynced(entityName, entityId, record.id);
}

async function pushOperation(operation: SyncOperationRecord, userId: string) {
  await syncRepository.markProcessing(operation.id);
  try {
    await writeEntityToDatabase(operation.entityName, operation.entityId, userId, operation.operation);
    await syncRepository.remove(operation.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database write failed.";
    await markLocalFailed(operation.entityName, operation.entityId, message);
    await syncRepository.markFailed(operation.id, message);
    throw new Error(message);
  }
}

async function pullTable(entityName: SyncEntityName, userId: string) {
  const client = assertSupabase();
  const table = getSyncTable(entityName);
  const pendingOps = await syncRepository.listPending(200);
  const pendingIds = new Set(
    pendingOps.filter((op) => op.entityName === entityName).map((op) => op.entityId)
  );

  if (entityName === "accounts") {
    const { data, error } = await client
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true });
    if (error) return;

    const remoteIds = new Set<string>();
    for (const row of data ?? []) {
      if (row.is_default && row.id !== "default-cash" && row.id !== "default-bank") {
        continue;
      }
      remoteIds.add(row.id);
      if (pendingIds.has(row.id)) continue;

      const remoteRecord: Account = {
        id: row.id,
        userId: row.user_id,
        presetKey: row.preset_key,
        name: row.name,
        type: row.type,
        openingBalance: Number(row.opening_balance_minor || 0) / 100,
        currencyCode: row.currency_code,
        isDefault: row.is_default,
        displayOrder: row.display_order,
        balanceResetAt: row.balance_reset_at || "1970-01-01T00:00:00.000Z",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      await table.put(remoteRecord as never);
    }

    if (remoteIds.size === 0) {
      const localAccounts = await appDb.accounts.toArray();
      for (const local of localAccounts) {
        if (!local.deletedAt) {
          await writeEntityToDatabase("accounts", local.id, userId, "create");
        }
      }
      return;
    }

    const localAccounts = await appDb.accounts.toArray();
    for (const local of localAccounts) {
      if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
        await appDb.accounts.delete(local.id);
      }
    }
  } else if (entityName === "categories") {
    const { data, error } = await client
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: true });
    if (error) return;

    let hasActiveRemote = false;
    for (const row of data ?? []) {
      if (!row.deleted_at) hasActiveRemote = true;
      if (pendingIds.has(row.id)) continue;

      const remoteRecord: Category = {
        id: row.id,
        userId: row.user_id,
        presetKey: row.preset_key,
        name: row.name,
        type: row.type,
        iconKey: row.icon_key,
        colorKey: row.color_key,
        isDefault: row.is_default,
        displayOrder: row.display_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      await table.put(remoteRecord as never);
    }

    if (!hasActiveRemote) {
      const localCategories = await appDb.categories.toArray();
      for (const local of localCategories) {
        if (!local.deletedAt) {
          await writeEntityToDatabase("categories", local.id, userId, "create");
        }
      }
    }
  } else if (entityName === "transactions") {
    const { data, error } = await client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false });
    if (error) {
      console.error("[SyncEngine] Failed to pull transactions:", error);
      return;
    }

    const remoteIds = new Set<string>();
    for (const row of data ?? []) {
      remoteIds.add(row.id);
      if (pendingIds.has(row.id)) continue;

      const remoteRecord: TransactionRecord = {
        id: row.id,
        userId: row.user_id,
        accountId: row.account_id,
        categoryId: row.category_id,
        type: row.type,
        amount: Number(row.amount_minor || 0) / 100,
        currencyCode: row.currency_code,
        description: row.description,
        affectsAccountBalance: row.affects_account_balance ?? true,
        transactionDate: row.transaction_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      await table.put(remoteRecord as never);
    }

    const localTransactions = await appDb.transactions.toArray();
    for (const local of localTransactions) {
      if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
        await appDb.transactions.delete(local.id);
      }
    }
  } else if (entityName === "transfers") {
    const { data, error } = await client
      .from("transfers")
      .select("*")
      .eq("user_id", userId)
      .order("transfer_date", { ascending: false });
    if (error) return;

    const remoteIds = new Set<string>();
    for (const row of data ?? []) {
      remoteIds.add(row.id);
      if (pendingIds.has(row.id)) continue;

      const remoteRecord: TransferRecord = {
        id: row.id,
        userId: row.user_id,
        fromAccountId: row.from_account_id,
        toAccountId: row.to_account_id,
        amount: Number(row.amount_minor || 0) / 100,
        fee: (Number(row.source_fee_minor || 0) + Number(row.destination_fee_minor || 0)) / 100,
        sourceFee: Number(row.source_fee_minor || 0) / 100,
        destinationFee: Number(row.destination_fee_minor || 0) / 100,
        currencyCode: row.currency_code,
        description: row.description,
        transferDate: row.transfer_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      await table.put(remoteRecord as never);
    }

    const transfersTable = getOptionalTable<TransferRecord>("transfers");
    if (transfersTable) {
      const localTransfers = await transfersTable.toArray();
      for (const local of localTransfers) {
        if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
          await transfersTable.delete(local.id);
        }
      }
    }
  } else if (entityName === "budgets") {
    const { data, error } = await client
      .from("budgets")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: true });
    if (error) return;

    const remoteIds = new Set<string>();
    for (const row of data ?? []) {
      remoteIds.add(row.id);
      if (pendingIds.has(row.id)) continue;

      const remoteRecord: Budget = {
        id: row.id,
        userId: row.user_id,
        categoryId: row.category_id,
        amount: Number(row.amount_minor || 0) / 100,
        period: row.period,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: null,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      await table.put(remoteRecord as never);
    }

    const localBudgets = await appDb.budgets.toArray();
    for (const local of localBudgets) {
      if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
        await appDb.budgets.delete(local.id);
      }
    }
  } else if (entityName === "recurringTransactions") {
    const { data, error } = await client
      .from("recurring_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: true });
    if (error) return;

    const remoteIds = new Set<string>();
    for (const row of data ?? []) {
      remoteIds.add(row.id);
      if (pendingIds.has(row.id)) continue;

      const remoteRecord: RecurringTransaction = {
        id: row.id,
        userId: row.user_id,
        accountId: row.account_id,
        categoryId: row.category_id,
        type: row.type,
        amount: Number(row.amount_minor || 0) / 100,
        description: row.description,
        frequency: row.frequency,
        nextOccurrence: row.next_occurrence,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: null,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      await table.put(remoteRecord as never);
    }

    const localRecurring = await appDb.recurringTransactions.toArray();
    for (const local of localRecurring) {
      if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
        await appDb.recurringTransactions.delete(local.id);
      }
    }
  } else if (entityName === "settings") {
    const { data: profile } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profile && !pendingIds.has("app-settings")) {
      const local = (await table.get("app-settings")) as AppSettings | undefined;
      const localTourDone =
        typeof localStorage !== "undefined" &&
        localStorage.getItem("moniilog_tour_completed") === "true";
      const remoteTutorials =
        typeof profile.tutorial_completed_ids === "string"
          ? profile.tutorial_completed_ids
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : Array.isArray(profile.tutorial_completed_ids)
            ? profile.tutorial_completed_ids
            : [];
      const localTutorials = local?.tutorialCompletedIds ?? [];
      const mergedTutorials = Array.from(
        new Set([
          ...localTutorials,
          ...remoteTutorials,
          ...(localTourDone ? ["app-tour"] : [])
        ])
      );
      await table.put({
        id: "app-settings",
        userId,
        remoteId: userId,
        currencyCode: profile.preferred_currency || local?.currencyCode || "XAF",
        language: (profile.preferred_language as "en" | "fr") || local?.language || "en",
        themeMode: (profile.theme_mode as "light" | "dark" | "system") || local?.themeMode || "dark",
        onboardingComplete: true,
        tutorialCompletedIds: mergedTutorials,
        createdAt: local?.createdAt || profile.created_at || nowIso(),
        updatedAt: profile.updated_at || nowIso(),
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      } as never);
    }
  }
}

let isSyncRunning = false;

export const syncEngine = {
  async pushEntityImmediate(
    entityName: SyncEntityName,
    entityId: string,
    operation?: string,
    opId?: string
  ) {
    if (!navigator.onLine || !supabase) return;
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;

      await writeEntityToDatabase(entityName, entityId, userId, operation);
      if (opId) {
        await syncRepository.remove(opId);
      }
      syncRepository.recordSyncSuccess();
    } catch {
      // Operation remains in syncOperations for next run
    }
  },

  async run(userId: string) {
    if (!navigator.onLine || !supabase) {
      return syncRepository.summarize();
    }

    if (isSyncRunning) {
      return syncRepository.summarize();
    }

    isSyncRunning = true;
    try {
      const pendingOperations = await syncRepository.listPending();
      for (const operation of pendingOperations) {
        try {
          await pushOperation(operation, userId);
        } catch {
          // Individual failure logged; proceed with other queue items
        }
      }

      // Pull foundational data (settings, accounts, categories) first so
      // transaction foreign keys and names resolve reliably without dangling relations.
      await pullTable("settings", userId);
      await pullTable("accounts", userId);
      await pullTable("categories", userId);

      await Promise.all([
        pullTable("transactions", userId),
        pullTable("transfers", userId),
        pullTable("budgets", userId),
        pullTable("recurringTransactions", userId)
      ]);

      syncRepository.recordSyncSuccess();
      return syncRepository.summarize();
    } finally {
      isSyncRunning = false;
    }
  },

  subscribeRealtime(userId: string, onUpdate?: () => void) {
    if (!supabase) return () => {};

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePull = (tableName: SyncEntityName) => {
      if (isSyncRunning) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (isSyncRunning) return;
        await pullTable(tableName, userId);
        syncRepository.recordSyncSuccess();
        onUpdate?.();
      }, 600);
    };

    const channel = supabase
      .channel(`realtime-ledger-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        () => schedulePull("transactions")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
        () => schedulePull("accounts")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${userId}` },
        () => schedulePull("categories")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transfers", filter: `user_id=eq.${userId}` },
        () => schedulePull("transfers")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${userId}` },
        () => schedulePull("budgets")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${userId}` },
        () => schedulePull("recurringTransactions")
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase?.removeChannel(channel);
    };
  }
};

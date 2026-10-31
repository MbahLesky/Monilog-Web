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
  SyncableEntity,
  SyncEntityName,
  SyncOperationRecord,
  TransferRecord,
  TransactionRecord
} from "@/types";
import { nowIso } from "@/utils/date-utils";

const CHECKPOINT_PREFIX = "moniilog-supabase-checkpoint";

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

function getCheckpointKey(entityName: SyncEntityName) {
  return `${CHECKPOINT_PREFIX}:${entityName}`;
}

function getCheckpoint(entityName: SyncEntityName) {
  return window.localStorage.getItem(getCheckpointKey(entityName));
}

function setCheckpoint(entityName: SyncEntityName, value: string) {
  window.localStorage.setItem(getCheckpointKey(entityName), value);
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

async function pushOperation(operation: SyncOperationRecord, userId: string) {
  const client = assertSupabase();
  const table = getSyncTable(operation.entityName);
  const record = (await table.get(operation.entityId)) as SyncableRecord | undefined;

  if (!record) {
    await syncRepository.remove(operation.id);
    return;
  }

  await syncRepository.markProcessing(operation.id);

  try {
    if (operation.entityName === "accounts") {
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
        balance_reset_at: a.balanceResetAt || null,
        updated_at: a.updatedAt,
        deleted_at: a.deletedAt || null
      });
      if (error) throw error;
    } else if (operation.entityName === "categories") {
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
        updated_at: c.updatedAt,
        deleted_at: c.deletedAt || null
      });
      if (error) throw error;
    } else if (operation.entityName === "transactions") {
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
        updated_at: t.updatedAt,
        deleted_at: t.deletedAt || null
      });
      if (error) throw error;
    } else if (operation.entityName === "transfers") {
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
        updated_at: tf.updatedAt,
        deleted_at: tf.deletedAt || null
      });
      if (error) throw error;
    } else if (operation.entityName === "budgets") {
      const b = record as Budget;
      const { error } = await client.from("budgets").upsert({
        id: b.id,
        user_id: userId,
        category_id: b.categoryId,
        amount_minor: Math.round((b.amount || 0) * 100),
        period: b.period,
        updated_at: b.updatedAt
      });
      if (error) throw error;
    } else if (operation.entityName === "recurringTransactions") {
      const r = record as RecurringTransaction;
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
        updated_at: r.updatedAt
      });
      if (error) throw error;
    } else if (operation.entityName === "settings") {
      const s = record as AppSettings;
      const { error } = await client.from("profiles").upsert({
        id: userId,
        preferred_currency: s.currencyCode || "XAF",
        preferred_language: s.language || "en",
        theme_mode: s.themeMode || "system",
        onboarding_completed: s.onboardingComplete ?? false,
        tutorial_completed_ids: s.tutorialCompletedIds || "",
        updated_at: s.updatedAt
      });
      if (error) throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    await markLocalFailed(operation.entityName, operation.entityId, message);
    await syncRepository.markFailed(operation.id, message);
    throw new Error(message);
  }

  await markLocalSynced(operation.entityName, operation.entityId, record.id);
  await syncRepository.remove(operation.id);
}

async function pullTable(entityName: SyncEntityName, userId: string) {
  const client = assertSupabase();
  const checkpoint = getCheckpoint(entityName);
  const table = getSyncTable(entityName);

  let latestUpdatedAt: string | null = null;

  if (entityName === "accounts") {
    let q = client.from("accounts").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
    if (checkpoint) q = q.gt("updated_at", checkpoint);
    const { data } = await q;

    for (const row of data ?? []) {
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
        balanceResetAt: row.balance_reset_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      const local = (await table.get(remoteRecord.id)) as Account | undefined;
      if (!local || remoteRecord.updatedAt >= local.updatedAt) {
        await table.put(remoteRecord as never);
      }
      latestUpdatedAt = row.updated_at;
    }
  } else if (entityName === "categories") {
    let q = client.from("categories").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
    if (checkpoint) q = q.gt("updated_at", checkpoint);
    const { data } = await q;

    for (const row of data ?? []) {
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
      const local = (await table.get(remoteRecord.id)) as Category | undefined;
      if (!local || remoteRecord.updatedAt >= local.updatedAt) {
        await table.put(remoteRecord as never);
      }
      latestUpdatedAt = row.updated_at;
    }
  } else if (entityName === "transactions") {
    let q = client.from("transactions").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
    if (checkpoint) q = q.gt("updated_at", checkpoint);
    const { data } = await q;

    for (const row of data ?? []) {
      const remoteRecord: TransactionRecord = {
        id: row.id,
        userId: row.user_id,
        accountId: row.account_id,
        categoryId: row.category_id,
        type: row.type,
        amount: Number(row.amount_minor || 0) / 100,
        currencyCode: row.currency_code,
        description: row.description,
        affectsAccountBalance: row.affects_account_balance,
        transactionDate: row.transaction_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: nowIso()
      };
      const local = (await table.get(remoteRecord.id)) as TransactionRecord | undefined;
      if (!local || remoteRecord.updatedAt >= local.updatedAt) {
        await table.put(remoteRecord as never);
      }
      latestUpdatedAt = row.updated_at;
    }
  } else if (entityName === "transfers") {
    let q = client.from("transfers").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
    if (checkpoint) q = q.gt("updated_at", checkpoint);
    const { data } = await q;

    for (const row of data ?? []) {
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
      const local = (await table.get(remoteRecord.id)) as TransferRecord | undefined;
      if (!local || remoteRecord.updatedAt >= local.updatedAt) {
        await table.put(remoteRecord as never);
      }
      latestUpdatedAt = row.updated_at;
    }
  } else if (entityName === "budgets") {
    let q = client.from("budgets").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
    if (checkpoint) q = q.gt("updated_at", checkpoint);
    const { data } = await q;

    for (const row of data ?? []) {
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
      const local = (await table.get(remoteRecord.id)) as Budget | undefined;
      if (!local || remoteRecord.updatedAt >= local.updatedAt) {
        await table.put(remoteRecord as never);
      }
      latestUpdatedAt = row.updated_at;
    }
  } else if (entityName === "recurringTransactions") {
    let q = client.from("recurring_transactions").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
    if (checkpoint) q = q.gt("updated_at", checkpoint);
    const { data } = await q;

    for (const row of data ?? []) {
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
      const local = (await table.get(remoteRecord.id)) as RecurringTransaction | undefined;
      if (!local || remoteRecord.updatedAt >= local.updatedAt) {
        await table.put(remoteRecord as never);
      }
      latestUpdatedAt = row.updated_at;
    }
  } else if (entityName === "settings") {
    const { data: profile } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profile) {
      const local = (await table.get("app-settings")) as AppSettings | undefined;
      if (!local || profile.updated_at >= local.updatedAt) {
        await table.put({
          id: "app-settings",
          userId,
          currencyCode: profile.preferred_currency || "XAF",
          language: profile.preferred_language || "en",
          themeMode: profile.theme_mode || "system",
          onboardingCompleted: profile.onboarding_completed,
          tutorialCompletedIds: profile.tutorial_completed_ids,
          updatedAt: profile.updated_at,
          syncStatus: "synced",
          syncError: null,
          lastSyncedAt: nowIso()
        } as never);
      }
      latestUpdatedAt = profile.updated_at;
    }
  }

  if (latestUpdatedAt) {
    setCheckpoint(entityName, latestUpdatedAt);
  }
}

export const syncEngine = {
  async run(userId: string) {
    if (!navigator.onLine || !supabase) {
      return syncRepository.summarize();
    }

    const pendingOperations = await syncRepository.listPending();

    for (const operation of pendingOperations) {
      try {
        await pushOperation(operation, userId);
      } catch {
        // Individual failure logged; proceed with other queue items
      }
    }

    await Promise.all([
      pullTable("accounts", userId),
      pullTable("categories", userId),
      pullTable("transactions", userId),
      pullTable("transfers", userId),
      pullTable("budgets", userId),
      pullTable("recurringTransactions", userId),
      pullTable("settings", userId)
    ]);

    return syncRepository.summarize();
  },

  subscribeRealtime(userId: string, onUpdate?: () => void) {
    if (!supabase) return () => {};

    const channel = supabase
      .channel(`realtime-ledger-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        async () => {
          await pullTable("transactions", userId);
          onUpdate?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
        async () => {
          await pullTable("accounts", userId);
          onUpdate?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${userId}` },
        async () => {
          await pullTable("categories", userId);
          onUpdate?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transfers", filter: `user_id=eq.${userId}` },
        async () => {
          await pullTable("transfers", userId);
          onUpdate?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${userId}` },
        async () => {
          await pullTable("budgets", userId);
          onUpdate?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${userId}` },
        async () => {
          await pullTable("recurringTransactions", userId);
          onUpdate?.();
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }
};

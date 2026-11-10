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
  SyncSummary,
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

export async function writeEntityToDatabase(
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
}

let isSyncRunning = false;

export async function loadAllFromCloud(userId: string): Promise<SyncSummary> {
  if (!supabase) {
    return { pending: 0, failed: 0, processing: false, lastSyncedAt: null };
  }

  const client = supabase;
  const [
    { data: profile },
    { data: accounts },
    { data: categories },
    { data: transactions },
    { data: transfers },
    { data: budgets },
    { data: recurring }
  ] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    client.from("accounts").select("*").eq("user_id", userId).order("display_order", { ascending: true }),
    client.from("categories").select("*").eq("user_id", userId).order("display_order", { ascending: true }),
    client.from("transactions").select("*").eq("user_id", userId).order("transaction_date", { ascending: false }),
    client.from("transfers").select("*").eq("user_id", userId).order("transfer_date", { ascending: false }),
    client.from("budgets").select("*").eq("user_id", userId),
    client.from("recurring_transactions").select("*").eq("user_id", userId)
  ]);

  // Settings / Profile
  if (profile) {
    const tutorialIds =
      typeof profile.tutorial_completed_ids === "string"
        ? profile.tutorial_completed_ids.split(",").map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(profile.tutorial_completed_ids)
          ? profile.tutorial_completed_ids
          : [];

    await appDb.settings.put({
      id: "app-settings",
      userId,
      remoteId: userId,
      currencyCode: profile.preferred_currency || "XAF",
      language: (profile.preferred_language as "en" | "fr") || "en",
      themeMode: (profile.theme_mode as "light" | "dark" | "system") || "system",
      onboardingComplete: profile.onboarding_completed ?? true,
      tutorialCompletedIds: tutorialIds,
      createdAt: profile.created_at || nowIso(),
      updatedAt: profile.updated_at || nowIso(),
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    });
  }

  // Accounts
  if (accounts && accounts.length > 0) {
    const mappedAccounts: Account[] = accounts.map((row) => ({
      id: row.id,
      userId: row.user_id,
      presetKey: row.preset_key,
      name: row.name,
      type: row.type,
      openingBalance: Number(row.opening_balance_minor || 0) / 100,
      currencyCode: row.currency_code || "XAF",
      isDefault: row.is_default ?? false,
      displayOrder: row.display_order ?? 0,
      balanceResetAt: row.balance_reset_at || null,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: row.deleted_at || null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
    await appDb.accounts.clear();
    await appDb.accounts.bulkPut(mappedAccounts);
  }

  // Categories
  if (categories && categories.length > 0) {
    const mappedCategories: Category[] = categories.map((row) => ({
      id: row.id,
      userId: row.user_id,
      presetKey: row.preset_key,
      name: row.name,
      type: row.type,
      iconKey: row.icon_key,
      colorKey: row.color_key,
      isDefault: row.is_default,
      displayOrder: row.display_order,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: row.deleted_at,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
    await appDb.categories.clear();
    await appDb.categories.bulkPut(mappedCategories);
  }

  // Transactions
  if (transactions) {
    const mappedTransactions: TransactionRecord[] = transactions.map((row) => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      categoryId: row.category_id,
      type: row.type,
      amount: Number(row.amount_minor || 0) / 100,
      currencyCode: row.currency_code || "XAF",
      description: row.description || "",
      affectsAccountBalance: row.affects_account_balance ?? true,
      transactionDate: row.transaction_date,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: row.deleted_at || null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
    await appDb.transactions.clear();
    if (mappedTransactions.length > 0) {
      await appDb.transactions.bulkPut(mappedTransactions);
    }
  }

  // Transfers
  if (transfers) {
    const mappedTransfers: TransferRecord[] = transfers.map((row) => ({
      id: row.id,
      userId: row.user_id,
      fromAccountId: row.from_account_id,
      toAccountId: row.to_account_id,
      amount: Number(row.amount_minor || 0) / 100,
      fee: (Number(row.source_fee_minor || 0) + Number(row.destination_fee_minor || 0)) / 100,
      sourceFee: Number(row.source_fee_minor || 0) / 100,
      destinationFee: Number(row.destination_fee_minor || 0) / 100,
      currencyCode: row.currency_code || "XAF",
      description: row.description || "",
      transferDate: row.transfer_date,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: row.deleted_at || null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
    const transfersTable = getOptionalTable<TransferRecord>("transfers");
    if (transfersTable) {
      await transfersTable.clear();
      if (mappedTransfers.length > 0) {
        await transfersTable.bulkPut(mappedTransfers);
      }
    }
  }

  // Budgets
  if (budgets) {
    const mappedBudgets: Budget[] = budgets.map((row) => ({
      id: row.id,
      userId: row.user_id,
      categoryId: row.category_id,
      amount: Number(row.amount_minor || 0) / 100,
      period: row.period,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
    await appDb.budgets.clear();
    if (mappedBudgets.length > 0) {
      await appDb.budgets.bulkPut(mappedBudgets);
    }
  }

  // Recurring Transactions
  if (recurring) {
    const mappedRecurring: RecurringTransaction[] = recurring.map((row) => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      categoryId: row.category_id,
      type: row.type,
      amount: Number(row.amount_minor || 0) / 100,
      description: row.description || "",
      frequency: row.frequency,
      nextOccurrence: row.next_occurrence,
      isActive: row.is_active,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      deletedAt: null,
      remoteId: row.id,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: nowIso()
    }));
    await appDb.recurringTransactions.clear();
    if (mappedRecurring.length > 0) {
      await appDb.recurringTransactions.bulkPut(mappedRecurring);
    }
  }

  // Clear any legacy sync queue records
  await syncRepository.clearAll();

  return {
    pending: 0,
    failed: 0,
    processing: false,
    lastSyncedAt: nowIso()
  };
}

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
    } catch (e) {
      console.warn(`[Direct DB Write] ${entityName} error:`, e);
    }
  },

  async run(userId: string): Promise<SyncSummary> {
    if (!navigator.onLine || !supabase) {
      return { pending: 0, failed: 0, processing: false, lastSyncedAt: null };
    }

    if (isSyncRunning) {
      return { pending: 0, failed: 0, processing: false, lastSyncedAt: nowIso() };
    }

    isSyncRunning = true;
    try {
      return await loadAllFromCloud(userId);
    } finally {
      isSyncRunning = false;
    }
  },

  subscribeRealtime(userId: string, onUpdate?: () => void) {
    if (!supabase) return () => {};

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await loadAllFromCloud(userId);
          onUpdate?.();
        } catch (e) {
          console.warn("[Realtime Refresh] error:", e);
        }
      }, 400);
    };

    const channel = supabase
      .channel(`realtime-ledger-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transfers", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase?.removeChannel(channel);
    };
  }
};

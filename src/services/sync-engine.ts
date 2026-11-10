import { notifyDatabaseChange, initGlobalRealtime } from "@/lib/live-query";
import type { SyncEntityName, SyncSummary } from "@/types";
import { nowIso } from "@/utils/date-utils";

export async function writeEntityToDatabase(
  _entityName: SyncEntityName,
  _entityId: string,
  _userId: string,
  _operationType?: string
) {
  // Repositories write directly to Supabase.
  notifyDatabaseChange();
}

export async function loadAllFromCloud(_userId: string): Promise<SyncSummary> {
  notifyDatabaseChange();
  return {
    pending: 0,
    failed: 0,
    processing: false,
    lastSyncedAt: nowIso()
  };
}

export const syncEngine = {
  async pushEntityImmediate(
    _entityName: SyncEntityName,
    _entityId: string,
    _operation?: string,
    _opId?: string
  ) {
    notifyDatabaseChange();
  },

  async run(_userId: string): Promise<SyncSummary> {
    notifyDatabaseChange();
    return {
      pending: 0,
      failed: 0,
      processing: false,
      lastSyncedAt: nowIso()
    };
  },

  subscribeRealtime(userId: string, onUpdate?: () => void) {
    const cleanup = initGlobalRealtime(userId);
    return () => {
      cleanup();
      onUpdate?.();
    };
  }
};

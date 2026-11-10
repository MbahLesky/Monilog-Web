import { appDb } from "@/db/dexie";
import type { SyncEntityName, SyncOperationRecord, SyncOperationType, SyncSummary } from "@/types";
import { nowIso } from "@/utils/date-utils";

const LAST_SYNCED_STORAGE_KEY = "moniilog-last-synced-at";

export const syncRepository = {
  recordSyncSuccess(timestamp = nowIso()) {
    try {
      window.localStorage.setItem(LAST_SYNCED_STORAGE_KEY, timestamp);
    } catch {
      // Ignore storage errors in restricted environments
    }
  },

  getLastSyncedAt(): string | null {
    try {
      return window.localStorage.getItem(LAST_SYNCED_STORAGE_KEY) || nowIso();
    } catch {
      return null;
    }
  },

  async enqueue(
    _entityName: SyncEntityName,
    _entityId: string,
    _operation: SyncOperationType,
    _payload?: string
  ) {
    // Direct cloud database writes supersede local outbox queueing.
    return "direct-db";
  },

  async listPending(_limit = 50): Promise<SyncOperationRecord[]> {
    return [];
  },

  async markProcessing(_id: string) {},

  async markFailed(_id: string, _errorMessage: string) {},

  async remove(id: string) {
    try {
      await appDb.syncOperations.delete(id);
    } catch {}
  },

  async summarize(): Promise<SyncSummary> {
    return {
      pending: 0,
      failed: 0,
      processing: false,
      lastSyncedAt: this.getLastSyncedAt()
    };
  },

  async clearAll() {
    try {
      await appDb.syncOperations.clear();
    } catch {}
  }
};

import { create } from "zustand";
import { syncRepository } from "@/db/repositories/sync-repository";
import { syncEngine } from "@/services/sync-engine";
import type { SyncSummary } from "@/types";

interface SyncState extends SyncSummary {
  error: string | null;
  refresh: () => Promise<void>;
  runNow: (userId: string) => Promise<void>;
  initRealtime: (userId: string) => () => void;
}

const initialSummary: SyncSummary = {
  pending: 0,
  failed: 0,
  processing: false,
  lastSyncedAt: null
};

export const useSyncStore = create<SyncState>((set, get) => ({
  ...initialSummary,
  error: null,
  refresh: async () => {
    const summary = await syncRepository.summarize();
    set({ ...summary });
  },
  initRealtime: (userId: string) => {
    return syncEngine.subscribeRealtime(userId, () => {
      get().refresh();
    });
  },
  runNow: async (userId) => {
    set({ processing: true, error: null });

    try {
      const summary = await syncEngine.run(userId);
      set({
        ...(summary ?? initialSummary),
        processing: false,
        error: null
      });
    } catch (error) {
      set({
        processing: false,
        error: error instanceof Error ? error.message : "Sync failed."
      });
    }
  }
}));


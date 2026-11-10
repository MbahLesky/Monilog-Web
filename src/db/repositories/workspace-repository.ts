import { appDb, getOptionalTable } from "@/db/dexie";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { syncRepository } from "@/db/repositories/sync-repository";
import { notifyDatabaseChange } from "@/lib/live-query";

export const workspaceRepository = {
  async initialize() {
    await accountsRepository.listActive();
    await categoriesRepository.listActive();
    notifyDatabaseChange();
  },

  async releaseStaleOwnership(_userId: string) {},

  async stampOwnership(_userId: string) {},

  async resetAppData() {
    try {
      const transfersTable = getOptionalTable("transfers");
      await Promise.all([
        appDb.accounts.clear(),
        appDb.categories.clear(),
        appDb.transactions.clear(),
        transfersTable ? transfersTable.clear() : Promise.resolve(),
        appDb.settings.clear(),
        appDb.notificationPreferences.clear(),
        appDb.importRecords.clear(),
        appDb.exportRecords.clear(),
        syncRepository.clearAll()
      ]);
    } catch {}
    notifyDatabaseChange();
  }
};

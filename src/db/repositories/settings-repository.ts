import { appDb } from "@/db/dexie";
import { createDefaultNotificationPreferences, createDefaultSettings } from "@/db/seed/default-records";
import { SETTINGS_ROW_ID } from "@/lib/constants";
import type { AppLanguage, AppSettings, NotificationPreference, ThemeMode } from "@/types";
import { nowIso } from "@/utils/date-utils";
import { syncRepository } from "@/db/repositories/sync-repository";
import { supabase } from "@/lib/supabase-client";

export const settingsRepository = {
  async ensureSeedData() {
    const [settings, notificationPreferences] = await Promise.all([
      appDb.settings.get(SETTINGS_ROW_ID),
      appDb.notificationPreferences.toCollection().first()
    ]);

    await appDb.transaction("rw", appDb.settings, appDb.notificationPreferences, async () => {
      if (!settings) {
        await appDb.settings.put(createDefaultSettings());
      }

      if (!notificationPreferences) {
        await appDb.notificationPreferences.put(createDefaultNotificationPreferences());
      }
    });
  },

  async getSettings() {
    const settings = await appDb.settings.get(SETTINGS_ROW_ID);
    return settings ?? createDefaultSettings();
  },

  // Local storage is a single, unpartitioned store shared by whichever account
  // last signed in on this browser. When it currently belongs to someone else,
  // its fields must not be carried forward onto a new owner — that would leak
  // the previous account's onboarding/preference state, and a fresh `updatedAt`
  // stamp would block the new owner's real synced state from ever being pulled
  // down. Resetting to a never-synced default clears the slate before that pull
  // runs.
  async resetSettingsOwnership() {
    await appDb.settings.put(createDefaultSettings());
  },

  async resetNotificationPreferencesOwnership() {
    await appDb.notificationPreferences.put(createDefaultNotificationPreferences());
  },

  async updateSettings(
    updates: Partial<
      Pick<
        AppSettings,
        "currencyCode" | "language" | "themeMode" | "onboardingComplete" | "tutorialCompletedIds" | "userId"
      >
    >
  ) {
    const current = await this.getSettings();

    const next: AppSettings = {
      ...current,
      ...updates,
      syncStatus: "pending",
      syncError: null,
      updatedAt: nowIso()
    };

    await appDb.settings.put(next);
    await syncRepository.enqueue("settings", next.id, "update", JSON.stringify(next));
    return next;
  },

  async setThemeMode(themeMode: ThemeMode) {
    return this.updateSettings({ themeMode });
  },

  async setCurrency(currencyCode: string) {
    return this.updateSettings({ currencyCode });
  },

  async setLanguage(language: AppLanguage) {
    return this.updateSettings({ language });
  },

  async setOnboardingComplete(onboardingComplete: boolean) {
    return this.updateSettings({ onboardingComplete });
  },

  async markTutorialComplete(tutorialId: string) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("moniilog_tour_completed", "true");
    }
    const current = await this.getSettings();
    if (current.tutorialCompletedIds.includes(tutorialId)) {
      return current;
    }

    const next = await this.updateSettings({
      tutorialCompletedIds: [...current.tutorialCompletedIds, tutorialId]
    });

    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (userId) {
          await supabase
            .from("profiles")
            .update({
              tutorial_completed_ids: next.tutorialCompletedIds.join(","),
              updated_at: next.updatedAt
            })
            .eq("id", userId);
        }
      } catch (_) {}
    }

    return next;
  },

  async resetTutorials() {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("moniilog_tour_completed");
    }
    return this.updateSettings({ tutorialCompletedIds: [] });
  },

  async getNotificationPreferences(): Promise<NotificationPreference> {
    const preferences = await appDb.notificationPreferences.toCollection().first();
    return preferences ?? createDefaultNotificationPreferences();
  },

  async updateNotificationPreferences(
    updates: Partial<Pick<NotificationPreference, "enabled" | "reminderTime" | "timingMode" | "userId">>
  ) {
    const current = await this.getNotificationPreferences();

    const next: NotificationPreference = {
      ...current,
      ...updates,
      syncStatus: "pending",
      syncError: null,
      updatedAt: nowIso()
    };

    await appDb.notificationPreferences.put(next);
    await syncRepository.enqueue("notificationPreferences", next.id, "update", JSON.stringify(next));
    return next;
  }
};

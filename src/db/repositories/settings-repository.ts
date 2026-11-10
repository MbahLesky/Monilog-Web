import { appDb } from "@/db/dexie";
import { createDefaultNotificationPreferences, createDefaultSettings } from "@/db/seed/default-records";
import { SETTINGS_ROW_ID } from "@/lib/constants";
import { supabase } from "@/lib/supabase-client";
import type { AppLanguage, AppSettings, NotificationPreference, ThemeMode } from "@/types";
import { nowIso } from "@/utils/date-utils";

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
    const timestamp = nowIso();

    const next: AppSettings = {
      ...current,
      ...updates,
      syncStatus: "synced",
      syncError: null,
      updatedAt: timestamp
    };

    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = next.userId || sessionData?.session?.user?.id;
        if (userId) {
          const profilePayload: Record<string, unknown> = { updated_at: timestamp };
          if (updates.currencyCode !== undefined) profilePayload.preferred_currency = updates.currencyCode;
          if (updates.language !== undefined) profilePayload.preferred_language = updates.language;
          if (updates.themeMode !== undefined) profilePayload.theme_mode = updates.themeMode;
          if (updates.onboardingComplete !== undefined) profilePayload.onboarding_completed = updates.onboardingComplete;
          if (updates.tutorialCompletedIds !== undefined) {
            profilePayload.tutorial_completed_ids = updates.tutorialCompletedIds.join(",");
          }

          await supabase.from("profiles").update(profilePayload).eq("id", userId);
        }
      } catch (err) {
        console.warn("[Direct DB] Failed to update profile in Supabase:", err);
      }
    }

    await appDb.settings.put(next);
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

    const nextTutorials = [...current.tutorialCompletedIds, tutorialId];
    return this.updateSettings({
      tutorialCompletedIds: nextTutorials
    });
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
    const timestamp = nowIso();

    const next: NotificationPreference = {
      ...current,
      ...updates,
      syncStatus: "synced",
      syncError: null,
      updatedAt: timestamp
    };

    await appDb.notificationPreferences.put(next);
    return next;
  }
};

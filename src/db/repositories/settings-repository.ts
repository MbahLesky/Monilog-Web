import { DEFAULT_CURRENCY, DEFAULT_LANGUAGE, NOTIFICATION_PREFERENCES_ID, SETTINGS_ROW_ID } from "@/lib/constants";
import { supabase } from "@/lib/supabase-client";
import { getCurrentUserId } from "@/lib/current-user";
import { notifyDatabaseChange } from "@/lib/live-query";
import type { AppLanguage, AppSettings, NotificationPreference, ThemeMode } from "@/types";
import { nowIso } from "@/utils/date-utils";

export const settingsRepository = {
  async ensureSeedData() {},

  async getSettings(userIdOverride?: string | null): Promise<AppSettings> {
    const userId = await getCurrentUserId(userIdOverride);
    const timestamp = nowIso();

    const fallback: AppSettings = {
      id: SETTINGS_ROW_ID,
      currencyCode: DEFAULT_CURRENCY,
      language: DEFAULT_LANGUAGE,
      themeMode: "dark",
      onboardingComplete: true,
      tutorialCompletedIds: [],
      userId,
      remoteId: userId,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    if (!userId || !supabase) return fallback;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error || !profile) {
      return fallback;
    }

    const tutorialIds =
      typeof profile.tutorial_completed_ids === "string"
        ? profile.tutorial_completed_ids.split(",").map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(profile.tutorial_completed_ids)
          ? profile.tutorial_completed_ids
          : [];

    return {
      id: SETTINGS_ROW_ID,
      currencyCode: profile.preferred_currency || DEFAULT_CURRENCY,
      language: (profile.preferred_language as AppLanguage) || DEFAULT_LANGUAGE,
      themeMode: (profile.theme_mode as ThemeMode) || "dark",
      onboardingComplete: profile.onboarding_completed ?? true,
      tutorialCompletedIds: tutorialIds,
      userId,
      remoteId: userId,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: profile.created_at || timestamp,
      updatedAt: profile.updated_at || timestamp
    };
  },

  async resetSettingsOwnership() {},

  async resetNotificationPreferencesOwnership() {},

  async updateSettings(
    updates: Partial<
      Pick<
        AppSettings,
        "currencyCode" | "language" | "themeMode" | "onboardingComplete" | "tutorialCompletedIds" | "userId"
      >
    >
  ) {
    const userId = await getCurrentUserId(updates.userId);
    if (!userId || !supabase) return this.getSettings();

    const timestamp = nowIso();
    const profilePayload: Record<string, unknown> = { updated_at: timestamp };

    if (updates.currencyCode !== undefined) profilePayload.preferred_currency = updates.currencyCode;
    if (updates.language !== undefined) profilePayload.preferred_language = updates.language;
    if (updates.themeMode !== undefined) profilePayload.theme_mode = updates.themeMode;
    if (updates.onboardingComplete !== undefined) profilePayload.onboarding_completed = updates.onboardingComplete;
    if (updates.tutorialCompletedIds !== undefined) {
      profilePayload.tutorial_completed_ids = updates.tutorialCompletedIds.join(",");
    }

    const { error } = await supabase.from("profiles").update(profilePayload).eq("id", userId);
    if (error) {
      console.error("[Direct DB] Failed to update profile in Supabase:", error);
    }

    notifyDatabaseChange();
    return this.getSettings(userId);
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
    try {
      localStorage.setItem("moniilog_tour_completed", "true");
    } catch {}

    const current = await this.getSettings();
    if (current.tutorialCompletedIds.includes(tutorialId)) {
      return current;
    }

    return this.updateSettings({
      tutorialCompletedIds: [...current.tutorialCompletedIds, tutorialId]
    });
  },

  async resetTutorials() {
    try {
      localStorage.removeItem("moniilog_tour_completed");
    } catch {}
    return this.updateSettings({ tutorialCompletedIds: [] });
  },

  async getNotificationPreferences(): Promise<NotificationPreference> {
    const userId = await getCurrentUserId();
    const timestamp = nowIso();

    // Stored in localStorage for browser push reminder preferences
    let enabled = false;
    let reminderTime = "20:00";
    try {
      enabled = localStorage.getItem("moniilog_reminder_enabled") === "true";
      reminderTime = localStorage.getItem("moniilog_reminder_time") || "20:00";
    } catch {}

    return {
      id: NOTIFICATION_PREFERENCES_ID,
      enabled,
      reminderTime,
      timingMode: "daily",
      userId,
      remoteId: null,
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  },

  async updateNotificationPreferences(
    updates: Partial<Pick<NotificationPreference, "enabled" | "reminderTime" | "timingMode" | "userId">>
  ) {
    try {
      if (updates.enabled !== undefined) {
        localStorage.setItem("moniilog_reminder_enabled", String(updates.enabled));
      }
      if (typeof updates.reminderTime === "string") {
        localStorage.setItem("moniilog_reminder_time", updates.reminderTime);
      }
    } catch {}

    notifyDatabaseChange();
    return this.getNotificationPreferences();
  }
};

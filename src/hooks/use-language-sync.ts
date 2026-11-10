import { useEffect } from "react";
import { useLiveQuery } from "@/lib/live-query";
import i18n from "@/i18n";
import { settingsRepository } from "@/db/repositories/settings-repository";

// Keeps the active i18n language in sync with AppSettings.language (Dexie).
export function useLanguageSync() {
  const language = useLiveQuery(
    () => settingsRepository.getSettings().then((settings) => settings.language),
    []
  );

  useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);
}

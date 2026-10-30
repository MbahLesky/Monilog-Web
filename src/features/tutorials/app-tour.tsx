import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Joyride, { STATUS, type CallBackProps, type Step } from "react-joyride";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { useUiStore } from "@/store/ui-store";

const TOUR_ID = "app-tour";

// Body-anchored steps keep the tour robust across the desktop sidebar and the
// mobile bottom bar. Mirrors the Flutter app's guided coach-mark tour and records
// completion in AppSettings.tutorialCompletedIds.
const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    disableBeacon: true,
    title: "Welcome to Moniilog",
    content: "A quick tour of how your local-first ledger works on the web."
  },
  {
    target: "body",
    placement: "center",
    title: "Dashboard",
    content: "See your balance, income, expenses, accounts, and recent activity at a glance."
  },
  {
    target: "body",
    placement: "center",
    title: "Add & transfer",
    content: "Use Add to record income or expenses, and open Transfer to move money between accounts."
  },
  {
    target: "body",
    placement: "center",
    title: "Analytics",
    content: "Track income vs. expense trends and your spending by category over time."
  },
  {
    target: "body",
    placement: "center",
    title: "Settings",
    content: "Change currency, language, theme, manage categories, and back up your data any time."
  }
];

export function AppTour() {
  const tourNonce = useUiStore((state) => state.tourNonce);
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const [run, setRun] = useState(false);

  // Auto-start once for a user who has never completed the tour.
  useEffect(() => {
    if (settings && !settings.tutorialCompletedIds.includes(TOUR_ID)) {
      setRun(true);
    }
  }, [settings]);

  // Replay when triggered from Settings.
  useEffect(() => {
    if (tourNonce > 0) {
      setRun(true);
    }
  }, [tourNonce]);

  function handleCallback(data: CallBackProps) {
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(data.status)) {
      setRun(false);
      void settingsRepository.markTutorialComplete(TOUR_ID);
    }
  }

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableScrolling
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: "#173B7A",
          zIndex: 60
        }
      }}
    />
  );
}

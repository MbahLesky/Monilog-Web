import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Joyride, { STATUS, type CallBackProps, type Step } from "react-joyride";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { useUiStore } from "@/store/ui-store";

const TOUR_ID = "app-tour";

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    disableBeacon: true,
    title: "Welcome to Moniilog",
    content: "A quick tour of your financial ledger on the web."
  },
  {
    target: "body",
    placement: "center",
    title: "Dashboard",
    content: "See your live balance, income, expenses, accounts, and recent activity at a glance."
  },
  {
    target: "body",
    placement: "center",
    title: "Add & Transfer",
    content: "Record income or expenses with Add, and move money between accounts with Transfer."
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
    content: "Manage accounts, categories, currencies, security, and export statements anytime."
  }
];

export function AppTour() {
  const tourNonce = useUiStore((state) => state.tourNonce);
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const [run, setRun] = useState(false);

  // Auto-start ONLY for a brand-new user who has never completed or dismissed the tour.
  useEffect(() => {
    if (!settings) return;

    const isCompleted =
      localStorage.getItem("moniilog_tour_completed") === "true" ||
      Boolean(settings.tutorialCompletedIds?.includes(TOUR_ID)) ||
      Boolean(settings.tutorialCompletedIds?.includes("dashboard")) ||
      Boolean(settings.onboardingComplete);

    if (!isCompleted) {
      setRun(true);
    }
  }, [settings]);

  // Replay when explicitly triggered by the user from Settings.
  useEffect(() => {
    if (tourNonce > 0) {
      setRun(true);
    }
  }, [tourNonce]);

  function handleCallback(data: CallBackProps) {
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(data.status) || data.action === "close") {
      setRun(false);
      try {
        localStorage.setItem("moniilog_tour_completed", "true");
      } catch {}
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

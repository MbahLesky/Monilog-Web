import { create } from "zustand";
import type { ThemeMode } from "@/types";

interface UiState {
  themeMode: ThemeMode;
  isTransactionComposerOpen: boolean;
  // Incremented to (re)start the guided tour on demand, e.g. "Replay app tour".
  tourNonce: number;
  setThemeMode: (themeMode: ThemeMode) => void;
  openTransactionComposer: () => void;
  closeTransactionComposer: () => void;
  startTour: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  themeMode: "dark",
  isTransactionComposerOpen: false,
  tourNonce: 0,
  setThemeMode: (themeMode) => set({ themeMode }),
  openTransactionComposer: () => set({ isTransactionComposerOpen: true }),
  closeTransactionComposer: () => set({ isTransactionComposerOpen: false }),
  startTour: () => set((state) => ({ tourNonce: state.tourNonce + 1 }))
}));


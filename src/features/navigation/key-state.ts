import { create } from "zustand";

/** What the keyboard is doing, which the status bar's hints follow. */
interface KeyState {
  /** `G` was pressed and waits for a place's letter. */
  chord: boolean;
  /** Focus is in a field: a composer or a form, or a search field. */
  focus: "writing" | "searching" | null;
  set(change: Partial<Omit<KeyState, "set">>): void;
}

export const useKeyState = create<KeyState>((set) => ({
  chord: false,
  focus: null,
  set: (change) => set(change),
}));

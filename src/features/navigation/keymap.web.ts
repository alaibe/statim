import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent } from "react";

import { useLockStore } from "@/core/account/lock-store";
import type { ChatId } from "@/core/messaging/types";
import { overlayOpen } from "@/design";

import { COMMANDS, type Command, type CommandScope, useOverlays } from "./commands";
import { useKeyState } from "./key-state";
import { commandFor, editable, keysOf, same } from "./keys";

const CHORD_WAIT = 1500;

// A shortcut the app menu also shows can arrive twice: as the page's keydown and as the menu item.
let last = { id: "", at: 0 };

function run(command: Command, scope: CommandScope) {
  if (useLockStore.getState().status !== "open") return;
  const now = Date.now();
  if (command.id === last.id && now - last.at < 150) return;
  last = { id: command.id, at: now };
  if (command.id !== "palette") useOverlays.getState().set({ palette: false });
  command.run(scope);
}

/** One listener for the whole window: the shared keys, `G` chords, the app menu, and where focus is. */
export function useKeymap(segments: readonly string[], chatId: ChatId | undefined): void {
  const scope = useEffectEvent((): CommandScope => ({ segments, chatId }));

  useEffect(() => {
    let chordTimer: ReturnType<typeof setTimeout> | undefined;
    const endChord = () => {
      clearTimeout(chordTimer);
      useKeyState.getState().set({ chord: false });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const keys = keysOf(event);
      const editing = editable(event.target);
      const current = scope();

      if (useKeyState.getState().chord) {
        endChord();
        const command = COMMANDS.find((c) => c.sequence && c.keys && same(c.keys, ["g", ...keys]));
        if (command) {
          event.preventDefault();
          run(command, current);
        }
        return;
      }
      if (same(keys, ["g"]) && !editing && !overlayOpen()) {
        event.preventDefault();
        useKeyState.getState().set({ chord: true });
        chordTimer = setTimeout(endChord, CHORD_WAIT);
        return;
      }
      if (same(keys, ["esc"]) && (overlayOpen() || editing)) return;
      if (overlayOpen() && !keys.includes("mod")) return;

      const command = commandFor(keys, editing, current);
      if (!command) return;
      event.preventDefault();
      run(command, current);
    };

    const onFocus = () => {
      const active = document.activeElement;
      useKeyState.getState().set({
        focus: editable(active) ? ((active as HTMLElement).closest("[data-search]") ? "searching" : "writing") : null,
      });
    };

    // Capture phase: react-native-web stops keydown from bubbling out of inputs.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onFocus);

    let stop: UnlistenFn | undefined;
    let cancelled = false;
    void listen<string>("app-menu", ({ payload }) => {
      const command = COMMANDS.find((c) => c.id === payload);
      if (command) run(command, scope());
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });

    return () => {
      cancelled = true;
      stop?.();
      endChord();
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
    };
  }, []);
}

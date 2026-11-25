import { useSegments } from "expo-router";

import { useAppearanceStore } from "@/core/app/appearance";
import type { ChatId } from "@/core/messaging/types";
import { StatusBar as Bar, overlayOpen } from "@/design";

import { type HintContext, hintsFor, openPlace, useOverlays } from "./commands";
import { useConnectionSummary } from "./connection";
import { useKeyState } from "./key-state";
import { DIALOG_SEGMENTS } from "./routes";

/** The context the hints follow, in the status bar page's order: chord, writing, searching, palette, dialog, item, list. */
function useHintContext(chatId: ChatId | undefined): HintContext {
  const segments = useSegments() as string[];
  const chord = useKeyState((s) => s.chord);
  const focus = useKeyState((s) => s.focus);
  const palette = useOverlays((s) => s.palette);
  if (chord) return "chord";
  if (palette) return "palette";
  if (focus === "searching") return "searching";
  if (DIALOG_SEGMENTS.has(segments[0] ?? "") || overlayOpen()) return "dialog";
  if (focus === "writing") return "writing";
  return chatId ? "item" : "list";
}

/** The desktop's status bar: the protocols' live state on the left, the keys of the moment on the right. */
export function StatusBar({ chatId }: { chatId?: ChatId }) {
  const segments = useSegments() as string[];
  const context = useHintContext(chatId);
  const quickTips = useAppearanceStore((s) => s.quickTips);
  const summary = useConnectionSummary();

  const hints = quickTips
    ? hintsFor(context, { segments, chatId }).map((hint) =>
        context === "chord" ? { ...hint, keys: hint.keys.slice(-1), sequence: false } : hint,
      )
    : [];

  return (
    <Bar
      app="Statim"
      working={summary.busy}
      segments={summary.segments.map((segment) => ({
        ...segment,
        onPress: segment.protocol ? () => openPlace("settings") : undefined,
      }))}
      hints={hints}
    />
  );
}

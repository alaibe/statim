import { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { Button } from "./components/button";
import { Pressable } from "./components/pressable";
import { Tag, type TagTone } from "./components/tag";
import { Text } from "./components/text";
import { useThemeColors } from "./hooks/use-theme-colors";
import { PASS_THROUGH } from "./lib/pass-through";
import { desktop } from "./lib/platform";
import { Enter, Exit } from "./motion";
import { Layer, Layout, Radius, Shadow, Space } from "./tokens";

export type ToastTone = "ok" | "info" | "warn" | "err";

export interface ToastAction {
  /** A verb, usually Undo; ⌘Z runs it while the toast shows. */
  label: string;
  run(): void;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push(message: string, tone: ToastTone, action?: ToastAction): void;
  dismiss(id: number): void;
  /** Hovering a toast holds every timer. */
  hold(held: boolean): void;
}

let nextId = 1;
const timers = new Map<number, { left: number; started: number; timer?: ReturnType<typeof setTimeout> }>();
let held = false;

function schedule(id: number) {
  const entry = timers.get(id);
  if (!entry || held) return;
  entry.started = Date.now();
  entry.timer = setTimeout(() => useToastStore.getState().dismiss(id), entry.left);
}

/** Shown 4s, 8s with an action; at most three stack upwards. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, tone, action) {
    const id = nextId++;
    timers.set(id, { left: action ? 8000 : 4000, started: Date.now() });
    const kept = get().toasts.slice(-2);
    for (const old of get().toasts) if (!kept.includes(old)) get().dismiss(old.id);
    set({ toasts: [...kept, { id, message, tone, action }] });
    schedule(id);
  },
  dismiss(id) {
    clearTimeout(timers.get(id)?.timer);
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  hold(value) {
    held = value;
    for (const [id, entry] of timers) {
      if (value) {
        clearTimeout(entry.timer);
        entry.left = Math.max(1000, entry.left - (Date.now() - entry.started));
      } else schedule(id);
    }
  },
}));

/** Feedback after an action: the tag first, then what happened in the past tense of the button. */
export const toast = {
  success: (message: string, action?: ToastAction) => useToastStore.getState().push(message, "ok", action),
  info: (message: string, action?: ToastAction) => useToastStore.getState().push(message, "info", action),
  warn: (message: string, action?: ToastAction) => useToastStore.getState().push(message, "warn", action),
  error: (message: string, action?: ToastAction) => useToastStore.getState().push(message, "err", action),
};

/** ⌘Z: the newest toast's action. Esc: dismiss the newest. */
export function runNewestToastAction(): boolean {
  const newest = useToastStore.getState().toasts.findLast((t) => t.action);
  if (!newest?.action) return false;
  newest.action.run();
  useToastStore.getState().dismiss(newest.id);
  return true;
}

export function dismissNewestToast(): boolean {
  const newest = useToastStore.getState().toasts.at(-1);
  if (!newest) return false;
  useToastStore.getState().dismiss(newest.id);
  return true;
}

const TAG: Record<ToastTone, TagTone> = { ok: "ok", info: "info", warn: "warn", err: "err" };

function ToastView({ toast: t }: { toast: Toast }) {
  const colors = useThemeColors();
  const dismiss = useToastStore((s) => s.dismiss);
  const hold = useToastStore((s) => s.hold);

  return (
    <Animated.View entering={Enter.fromBottom()} exiting={Exit.fade()} style={{ maxWidth: Layout.toast }}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={t.message}
        onPress={() => dismiss(t.id)}
        onHoverIn={() => hold(true)}
        onHoverOut={() => hold(false)}
        style={{
          minHeight: Space[12],
          flexDirection: "row",
          alignItems: "center",
          gap: Space[3],
          paddingVertical: Space[2],
          paddingHorizontal: Space[3],
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors["line-strong"],
          borderRadius: Radius.lg,
          boxShadow: Shadow.popover,
        }}
      >
        <Tag tone={TAG[t.tone]} />
        <Text size="sm" style={{ flexShrink: 1 }}>
          {t.message}
        </Text>
        {t.action ? (
          <Button
            variant="ghost"
            size="sm"
            label={t.action.label}
            keys={["mod", "z"]}
            onPress={() => {
              t.action?.run();
              dismiss(t.id);
            }}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS reports the frame before the keyboard moves, Android only after.
    const ios = process.env.EXPO_OS === "ios";
    const shown = Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", (event) =>
      setHeight(event.endCoordinates?.height ?? 0),
    );
    const hidden = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}

/** Bottom-right on the desktop, 16 from the edges above the status bar; bottom-centre on a phone, above the tab bar. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();

  if (toasts.length === 0) return null;

  const bottom = desktop
    ? Layout.statusbar + Space[4]
    : Math.max(keyboard + Space[3], insets.bottom + Layout.tabbar + Space[3]);

  return (
    <View
      style={[
        PASS_THROUGH,
        {
          position: "absolute",
          bottom,
          left: desktop ? undefined : Space[4],
          right: Space[4],
          zIndex: Layer.toast,
          gap: Space[2],
          alignItems: desktop ? "flex-end" : "center",
        },
      ]}
    >
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} />
      ))}
    </View>
  );
}

import { useEffect, useEffectEvent } from "react";

/** ⌘↵ (Ctrl+Enter) runs a dialog's primary action while it is open. */
export function useSubmitKey(active: boolean, onSubmit: () => void): void {
  const submit = useEffectEvent(onSubmit);
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      submit();
    };
    // Capture phase: react-native-web stops keydown from bubbling out of inputs.
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [active]);
}

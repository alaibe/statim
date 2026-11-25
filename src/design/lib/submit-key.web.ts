import { useEffect, useEffectEvent } from "react";

// Mounted ⌘↵ buttons, innermost last; ⌘↵ reaches only the top one, even while it is disabled.
const stack: (() => void)[] = [];

function onKey(event: KeyboardEvent) {
  const top = stack.at(-1);
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || !top) return;
  event.preventDefault();
  top();
}

// Capture phase: react-native-web stops keydown from bubbling out of inputs.
function listen(handler: () => void) {
  if (stack.length === 0) globalThis.addEventListener("keydown", onKey, true);
  stack.push(handler);
  return () => {
    stack.splice(stack.indexOf(handler), 1);
    if (stack.length === 0) globalThis.removeEventListener("keydown", onKey, true);
  };
}

/** ⌘↵ (Ctrl+Enter) presses the button that shows it, the innermost one when dialogs stack. */
export function useSubmitKey(active: boolean, onSubmit: () => void): void {
  const submit = useEffectEvent(onSubmit);
  useEffect(() => (active ? listen(() => submit()) : undefined), [active]);
}

import { useEffect, useEffectEvent } from 'react';

function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}

export function useDigitKeys(
  active: boolean,
  onDigit: (digit: string) => void,
  onDelete: () => void
): void {
  const digit = useEffectEvent(onDigit);
  const erase = useEffectEvent(onDelete);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || editable(event.target)) return;
      if (/^\d$/.test(event.key)) digit(event.key);
      else if (event.key === 'Backspace') erase();
      else return;
      event.preventDefault();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [active]);
}

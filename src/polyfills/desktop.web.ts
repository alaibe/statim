import { exit } from '@tauri-apps/plugin-process';
import { Buffer } from 'buffer';

// The Ledger libraries build APDUs with Node's Buffer.
globalThis.Buffer ??= Buffer;

/** The window's own right-click menu (Back, Reload, Inspect) stays only in text fields. */
function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, [contenteditable]') !== null;
}

document.addEventListener('contextmenu', (event) => {
  if (!editable(event.target)) event.preventDefault();
});

// Closing the window leaves the app running; macOS quits from its app menu,
// Windows and Linux with Ctrl+Q as well as from the tray.
if (!/Mac/.test(navigator.userAgent)) {
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        void exit(0);
      }
    },
    true
  );
}

// ⌘R reloads the page during development; the window has no menu item for it.
if (__DEV__) {
  document.addEventListener(
    'keydown',
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        location.reload();
      }
    },
    true
  );
}

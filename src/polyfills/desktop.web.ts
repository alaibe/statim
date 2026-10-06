import { invoke } from '@tauri-apps/api/core';
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

// Closing the window leaves the app running; Ctrl+Q quits, as Quit Statim
// does in the menu and the tray. Alt on its own shows a hidden menu bar until
// the next click.
if (!/Mac/.test(navigator.userAgent)) {
  let altAlone = false;
  let peeking = false;
  document.addEventListener(
    'keydown',
    (event) => {
      altAlone = event.key === 'Alt';
      if (event.ctrlKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        void exit(0);
      }
    },
    true
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'Alt' && altAlone) {
        peeking = true;
        void invoke('menu_bar_peek', { show: true });
      }
      altAlone = false;
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    () => {
      if (!peeking) return;
      peeking = false;
      void invoke('menu_bar_peek', { show: false });
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

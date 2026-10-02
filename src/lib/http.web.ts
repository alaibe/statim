import { fetch } from '@tauri-apps/plugin-http';

// The window's fetch is bound by CORS, which neither the sites behind link
// previews nor a self-hosted model server open; the plugin's runs in Rust.
export const appFetch: typeof fetch = fetch;

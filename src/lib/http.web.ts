import { fetch } from "@tauri-apps/plugin-http";

// The plugin's fetch runs in Rust: link-preview sites and self-hosted model servers do not open CORS.
export const appFetch: typeof fetch = fetch;

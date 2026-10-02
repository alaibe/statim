import { fetch } from '@tauri-apps/plugin-http';

// The window's fetch is bound by CORS, which a self-hosted model server rarely opens.
export const aiFetch: typeof fetch = fetch;

import { appFetch } from "@/lib/http";

const IDENTIFIER = /^([a-z0-9._-]+)@((?:[a-z0-9-]+\.)+[a-z]{2,})$/i;
const HEX_KEY = /^[0-9a-f]{64}$/;
const TIMEOUT_MS = 8_000;

/** NIP-05: the hex public key that `name@domain` names, as that domain's nostr.json says. */
export async function resolveNip05(input: string, fetcher: typeof fetch = appFetch): Promise<string | null> {
  const match = IDENTIFIER.exec(input.trim());
  if (!match) return null;
  const [, name, domain] = match.map((part) => part.toLowerCase());
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok || response.redirected || (response.url && response.url !== url)) return null;
    const body = (await response.json()) as { names?: Record<string, unknown> };
    const key = body.names?.[name];
    return typeof key === "string" && HEX_KEY.test(key) ? key : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

import { toHex } from "@/lib/bytes";
import { VaultKey, vaultDelete, vaultGet, vaultSet } from "@/storage/vault";

import { post, system } from "./platform";
import { SCREENS, type ScreenUrl } from "./screens";

const WEBSITE = "58e49091-a4c1-4c64-afe4-c2806ee75458";
const HOSTNAME = "statim-app.laibe.cc";
export const APP_NAME = "Statim";
const LANGUAGE = "en-US";
const IP = "127.0.0.1";
/** 365 days: never more than 12 months, inside the 13 months CNIL lets an audience-measurement tracker live without consent. */
export const ID_LIFETIME_SECONDS = 31_536_000;
const MAX_BROWSER = 20;
const MAX_SCREEN = 11;
export const OFF_TEXT = '{"off":true}';

export interface System {
  os: "macOS" | "Windows" | "Linux" | "iOS" | "Android";
  device: "desktop" | "mobile" | "tablet";
  width: number;
  height: number;
}

export interface PageView {
  type: "event";
  payload: {
    website: string;
    hostname: string;
    url: ScreenUrl;
    title: string;
    id: string;
    ip: string;
    tag: string;
    browser: string;
    os: System["os"];
    device: System["device"];
    screen?: string;
    language: string;
  };
}

export type Stored = { kind: "missing" | "off" | "damaged" } | { kind: "id"; id: string; made: number };

/** The one place the install id and the switch are kept. */
export interface Store {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

export interface Usage {
  isEnabled(): Promise<boolean>;
  setEnabled(on: boolean): Promise<void>;
  /** The hit for `screen` at `now` (Unix seconds), or null when none may be sent. */
  pageView(screen: ScreenUrl, width: number, height: number, now: number): Promise<PageView | null>;
}

export function parseStore(text: string | null): Stored {
  if (text === null) return { kind: "missing" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "damaged" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { kind: "damaged" };
  const { off, id, made } = value as Record<string, unknown>;
  if (off === true) return { kind: "off" };
  if (typeof id === "string" && /^[0-9a-f]{32}$/.test(id) && Number.isSafeInteger(made) && (made as number) >= 0) {
    return { kind: "id", id, made: made as number };
  }
  return { kind: "damaged" };
}

export function idText(id: string, made: number): string {
  return JSON.stringify({ id, made });
}

export function needsNewId(made: number, now: number): boolean {
  return made > now || now - made >= ID_LIFETIME_SECONDS;
}

export function month(now: number): string {
  return new Date(now * 1000).toISOString().slice(0, 7);
}

/** Hashed with the UTC month, the one Umami turns its own salt over on. */
export function visitorId(install: string, now: number): string {
  return bytesToHex(sha256(utf8ToBytes(`${install}:${month(now)}`))).slice(0, 32);
}

export function browser(version: string): string {
  return `${APP_NAME} ${version}`.slice(0, MAX_BROWSER);
}

export function screenSize(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  const size = `${width}x${height}`;
  return size.length <= MAX_SCREEN ? size : null;
}

/** No `name`: Umami counts visitors only from page views. */
export function payload(
  screen: ScreenUrl,
  visitor: string,
  version: string,
  os: System["os"],
  device: System["device"],
  size: string | null,
): PageView {
  return {
    type: "event",
    payload: {
      website: WEBSITE,
      hostname: HOSTNAME,
      url: screen,
      title: SCREENS[screen],
      id: visitor,
      ip: IP,
      tag: version,
      browser: browser(version),
      os,
      device,
      ...(size !== null && { screen: size }),
      language: LANGUAGE,
    },
  };
}

function newInstallId(): string {
  return toHex(Crypto.getRandomBytes(16));
}

export function createUsage(options: {
  store: Store;
  sends: boolean;
  version: string;
  os: System["os"];
  device: System["device"];
}): Usage {
  const { store, sends, version, os, device } = options;
  let queue: Promise<unknown> = Promise.resolve();

  /** One store read or write at a time, so a switch flipped twice lands in order. */
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function read(): Promise<Stored> {
    try {
      return parseStore(await store.read());
    } catch {
      return { kind: "damaged" };
    }
  }

  return {
    isEnabled: () =>
      serial(async () => {
        const { kind } = await read();
        return kind === "missing" || kind === "id";
      }),

    setEnabled: (on) =>
      serial(async () => {
        if (!on) return store.write(OFF_TEXT);
        const { kind } = await read();
        if (kind === "off" || kind === "damaged") await store.remove();
      }),

    pageView: async (screen, width, height, now) => {
      if (!sends) return null;
      return serial(async () => {
        const stored = await read();
        if (stored.kind === "off" || stored.kind === "damaged") return null;
        let id: string;
        if (stored.kind === "id" && !needsNewId(stored.made, now)) {
          id = stored.id;
        } else {
          id = newInstallId();
          try {
            await store.write(idText(id, now));
          } catch {
            return null;
          }
        }
        return payload(screen, visitorId(id, now), version, os, device, screenSize(width, height));
      });
    },
  };
}

const VAULT_STORE: Store = {
  read: () => vaultGet(VaultKey.usageStore),
  write: (text) => vaultSet(VaultKey.usageStore, text),
  remove: () => vaultDelete(VaultKey.usageStore),
};

const started = system();

export const usage = createUsage({
  store: VAULT_STORE,
  sends: !__DEV__,
  version: Constants.expoConfig?.version ?? "unknown",
  os: started.os,
  device: started.device,
});

/** Fire and forget. */
export async function sendPageView(screen: ScreenUrl): Promise<void> {
  try {
    const { width, height } = system();
    const body = await usage.pageView(screen, width, height, Math.floor(Date.now() / 1000));
    if (body) await post(body);
  } catch {}
}

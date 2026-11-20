import * as SecureStore from "expo-secure-store";

import { VaultKey, vaultGet, vaultWipe } from "@/storage/vault";

import { post } from "./platform";
import type { ScreenUrl } from "./screens";
import {
  APP_NAME,
  browser,
  createUsage,
  idText,
  month,
  needsNewId,
  OFF_TEXT,
  type PageView,
  parseStore,
  payload,
  type Store,
  screenSize,
  type Usage,
  visitorId,
} from "./usage";
import vectors from "./usage-vectors.json";

jest.mock("./platform", () => ({
  post: jest.fn(async () => {}),
  system: () => ({ os: "iOS", device: "mobile", width: 393, height: 852 }),
}));

jest.mock("expo-constants", () => ({ expoConfig: { version: "0.7.13" } }));

const input = vectors.payload.input;
const expected = vectors.payload.apps.statim.expected as PageView;
const AT = input.at;
const A = vectors.idText.id;

function memoryStore(text: string | null = null) {
  const store = {
    text,
    read: async () => store.text,
    write: async (next: string) => {
      store.text = next;
    },
    remove: async () => {
      store.text = null;
    },
  };
  return store;
}

function recorder(store: Store, sends = true): Usage {
  return createUsage({ store, sends, version: input.version, os: "macOS", device: "desktop" });
}

const hit = (usage: Usage, now = AT) => usage.pageView(input.url as ScreenUrl, input.width, input.height, now);

function storedId(text: string | null): string {
  const stored = parseStore(text);
  if (stored.kind !== "id") throw new Error(`no id in ${text}`);
  return stored.id;
}

const damaged = vectors.store.filter((row) => row.state === "damaged");

describe("the recorder", () => {
  it("U01 visitor id matches the vectors", () => {
    for (const row of vectors.visitor) {
      expect(month(row.at)).toBe(row.month);
      expect(visitorId(row.install, row.at)).toBe(row.visitor);
      expect(row.visitor).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("U02 id lifetime matches the vectors", () => {
    for (const row of vectors.lifetime)
      expect([row.case, needsNewId(row.made, row.now)]).toEqual([row.case, row.replace]);
  });

  it("U03 store text parses as the vectors say", () => {
    for (const row of vectors.store) {
      const stored = parseStore(row.text);
      expect([row.case, stored.kind]).toEqual([row.case, row.state]);
      if (stored.kind === "id") expect(stored).toEqual({ kind: "id", id: row.id, made: row.made });
    }
  });

  it("U04 store texts are exact", () => {
    expect(idText(vectors.idText.id, vectors.idText.made)).toBe(vectors.idText.text);
    expect(OFF_TEXT).toBe(vectors.offText);
  });

  it("U05 payload matches this app's vector", () => {
    const visitor = visitorId(input.install, AT);
    const size = screenSize(input.width, input.height);
    const view = payload(input.url as ScreenUrl, visitor, input.version, "macOS", "desktop", size);
    expect(view).toEqual(expected);
    expect(view.payload.title).toBe(input.title);

    const { screen: _, ...unsized } = expected.payload;
    const without = payload(input.url as ScreenUrl, visitor, input.version, "macOS", "desktop", null);
    expect(without).toEqual({ ...expected, payload: unsized });
    expect(Object.keys(without.payload)).not.toContain("screen");
    for (const key of ["name", "referrer", "timestamp"]) expect(Object.keys(view.payload)).not.toContain(key);
  });

  it("U06 browser and screen cuts", () => {
    const rows = vectors.browser.filter((row) => row.app === APP_NAME);
    expect(rows).not.toHaveLength(0);
    for (const row of rows) expect(browser(row.version)).toBe(row.browser);
    for (const row of vectors.screen) expect(screenSize(row.width, row.height)).toBe(row.screen);
  });

  it("U08 debug build sends nothing", async () => {
    const store = memoryStore();
    expect(await hit(recorder(store, false))).toBeNull();
    expect(store.text).toBeNull();
  });

  it("U09 first hit makes and keeps one id", async () => {
    const store = memoryStore();
    const usage = recorder(store);

    const first = await hit(usage);
    const id = storedId(store.text);
    expect(store.text).toBe(idText(id, AT));
    expect(first?.payload.id).toBe(visitorId(id, AT));

    expect((await hit(usage))?.payload.id).toBe(first?.payload.id);
    expect((await hit(recorder(store)))?.payload.id).toBe(first?.payload.id);
    expect(store.text).toBe(idText(id, AT));
  });

  it("U09 a store that can't keep the id sends nothing", async () => {
    const store = { ...memoryStore(), write: async () => Promise.reject(new Error("read-only")) };
    expect(await hit(recorder(store))).toBeNull();
  });

  it("U10 old or future id is replaced before the hit", async () => {
    for (const row of vectors.lifetime) {
      const store = memoryStore(idText(A, row.made));
      const view = await hit(recorder(store), row.now);
      if (row.replace) {
        const id = storedId(store.text);
        expect([row.case, id === A]).toEqual([row.case, false]);
        expect(store.text).toBe(idText(id, row.now));
        expect(view?.payload.id).toBe(visitorId(id, row.now));
      } else {
        expect([row.case, store.text]).toEqual([row.case, idText(A, row.made)]);
        expect(view?.payload.id).toBe(visitorId(A, row.now));
      }
    }
  });

  it("U11 off sends nothing and deletes the id", async () => {
    const store = memoryStore();
    const usage = recorder(store);
    await hit(usage);

    await usage.setEnabled(false);
    expect(store.text).toBe(OFF_TEXT);
    expect(await usage.isEnabled()).toBe(false);
    expect(await hit(usage)).toBeNull();
    expect(store.text).toBe(OFF_TEXT);
  });

  it("U12 on again: the next hit has a new id", async () => {
    const store = memoryStore();
    const usage = recorder(store);
    await hit(usage);
    const old = storedId(store.text);
    await usage.setEnabled(false);

    await usage.setEnabled(true);
    expect(store.text).toBeNull();
    expect(await usage.isEnabled()).toBe(true);
    const view = await hit(usage);
    expect(storedId(store.text)).not.toBe(old);
    expect(view?.payload.id).toBe(visitorId(storedId(store.text), AT));

    const kept = store.text;
    await usage.setEnabled(true);
    expect(store.text).toBe(kept);
  });

  it("U13 a damaged store counts as off", async () => {
    expect(damaged).not.toHaveLength(0);
    for (const row of damaged) {
      const store = memoryStore(row.text);
      const usage = recorder(store);
      expect([row.case, await usage.isEnabled()]).toEqual([row.case, false]);
      expect(await hit(usage)).toBeNull();
      expect(store.text).toBe(row.text);
      await usage.setEnabled(true);
      expect(store.text).toBeNull();
    }
  });

  it("U13 a store that can't be read counts as off", async () => {
    const store = { ...memoryStore(), read: async () => Promise.reject(new Error("locked")) };
    const usage = recorder(store);
    expect(await usage.isEnabled()).toBe(false);
    expect(await hit(usage)).toBeNull();
  });

  it("lands quick flips of the switch in the order they were made", async () => {
    const store = memoryStore();
    const usage = recorder(store);
    await Promise.all([usage.setEnabled(false), usage.setEnabled(true), usage.setEnabled(false)]);
    expect(store.text).toBe(OFF_TEXT);
  });
});

describe("the app's recorder, over the vault", () => {
  const posted = post as jest.MockedFunction<typeof post>;
  const dev = __DEV__;
  let app: typeof import("./usage");

  beforeEach(() => {
    (SecureStore as unknown as { __reset(): void }).__reset();
    posted.mockClear();
    Object.assign(globalThis, { __DEV__: false });
    jest.isolateModules(() => {
      app = jest.requireActual<typeof import("./usage")>("./usage");
    });
  });

  afterAll(() => Object.assign(globalThis, { __DEV__: dev }));

  it("sends the screen with this install's id from the vault", async () => {
    await app.sendPageView("/settings/privacy");
    const id = storedId(await vaultGet(VaultKey.usageStore));
    const now = Math.floor(Date.now() / 1000);
    expect(posted).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ url: "/settings/privacy", id: visitorId(id, now), screen: "393x852" }),
      }),
    );
  });

  it("keeps quiet when sending fails", async () => {
    posted.mockRejectedValueOnce(new Error("offline"));
    await expect(app.sendPageView("/chats")).resolves.toBeUndefined();
  });

  it("keeps the switch in the vault, and Erase everything turns it back on with a new id", async () => {
    await app.sendPageView("/chats");
    const before = storedId(await vaultGet(VaultKey.usageStore));

    await app.usage.setEnabled(false);
    expect(await vaultGet(VaultKey.usageStore)).toBe(OFF_TEXT);
    await app.sendPageView("/chats");
    expect(posted).toHaveBeenCalledTimes(1);

    await vaultWipe();
    expect(await app.usage.isEnabled()).toBe(true);
    await app.sendPageView("/chats");
    expect(posted).toHaveBeenCalledTimes(2);
    expect(storedId(await vaultGet(VaultKey.usageStore))).not.toBe(before);
  });
});

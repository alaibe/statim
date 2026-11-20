import { readdirSync } from "node:fs";
import path from "node:path";

import { SCREENS, screenUrl } from "./screens";

const APP = path.resolve(__dirname, "../../app");

const NEVER_SENT = new Set(["/", "/welcome", "/create", "/import", "/recover", "/sheet"]);

/** Each route file's segments, as `useSegments()` reports them. */
const routes = readdirSync(APP, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => file.replace(/(\.web)?\.tsx?$/, "").split(path.sep))
  .filter((segments) => !/^[_+]/.test(segments[segments.length - 1]))
  .map((segments) => (segments[segments.length - 1] === "index" ? segments.slice(0, -1) : segments));

describe("the screen list", () => {
  it("A01 view state maps to screens, never to ids", () => {
    expect(screenUrl(["(tabs)", "(settings)", "settings", "privacy"])).toBe("/settings/privacy");
    expect(screenUrl(["chat", "[id]"])).toBe("/chat/[id]");
    for (const segments of [
      ["chat", "xmtp:3f2a9c"],
      ["profile", "0x52908400098527886E0F7030069857D2E4169EE7"],
      ["thread", "$event:matrix.org"],
      ["settings", "protocol", "telegram"],
      ["search?q=rent"],
    ]) {
      expect(screenUrl(segments)).toBeNull();
    }
  });

  it("A02 the list matches the app's routes, but onboarding, recovery and the sheet host", () => {
    const unlisted = routes.filter((segments) => {
      const url = `/${segments.filter((s) => !s.startsWith("(")).join("/")}`;
      return screenUrl(segments) === null && !NEVER_SENT.has(url);
    });
    expect(unlisted).toEqual([]);
    const urls = new Set(routes.map(screenUrl));
    expect(Object.keys(SCREENS).filter((url) => !urls.has(url as keyof typeof SCREENS))).toEqual([]);
  });

  it("U14 an unlisted screen is refused", () => {
    for (const segments of [
      ["thread", "18c2f0a9"],
      ["settings?q=salary"],
      ["inbox"],
      ["sheet"],
      ["+not-found"],
      ["(onboarding)", "create"],
      [],
    ]) {
      expect(screenUrl(segments)).toBeNull();
    }
  });

  it("U15 screens are fixed paths with fixed titles", () => {
    const titles = Object.values(SCREENS);
    expect(new Set(titles).size).toBe(titles.length);
    for (const [url, title] of Object.entries(SCREENS)) {
      expect(url).toMatch(/^(\/([a-z0-9]+(-[a-z0-9]+)*|\[[a-z]+\]))+$/);
      expect(title).toMatch(/^(Settings: )?[A-Za-z][A-Za-z -]*$/);
      expect(title.startsWith("Settings: ")).toBe(url.startsWith("/settings/"));
    }
  });
});

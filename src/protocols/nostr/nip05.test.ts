import { resolveNip05 } from "./nip05";

const KEY = "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9";

function answering(body: unknown, init: { status?: number; url?: string; redirected?: boolean } = {}) {
  const asked: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return {
      ok: (init.status ?? 200) < 300,
      redirected: init.redirected ?? false,
      url: init.url ?? String(input),
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return { fetcher, asked };
}

describe("resolveNip05", () => {
  it("asks the domain for the name and returns its key", async () => {
    const { fetcher, asked } = answering({ names: { bob: KEY } });
    expect(await resolveNip05("Bob@Example.com", fetcher)).toBe(KEY);
    expect(asked).toEqual(["https://example.com/.well-known/nostr.json?name=bob"]);
  });

  it("takes the root name, _@domain", async () => {
    const { fetcher } = answering({ names: { _: KEY } });
    expect(await resolveNip05("_@example.com", fetcher)).toBe(KEY);
  });

  it("asks nothing for what is not a name@domain", async () => {
    const { fetcher, asked } = answering({ names: {} });
    expect(await resolveNip05("npub1xyz", fetcher)).toBeNull();
    expect(await resolveNip05("@alice:matrix.org", fetcher)).toBeNull();
    expect(asked).toEqual([]);
  });

  it("refuses an answer that came through a redirect", async () => {
    const { fetcher } = answering({ names: { bob: KEY } }, { url: "https://elsewhere.com/.well-known/nostr.json" });
    expect(await resolveNip05("bob@example.com", fetcher)).toBeNull();
  });

  it("refuses a missing name, a key that is not hex, and an error status", async () => {
    expect(await resolveNip05("bob@example.com", answering({ names: { alice: KEY } }).fetcher)).toBeNull();
    expect(await resolveNip05("bob@example.com", answering({ names: { bob: "npub1abc" } }).fetcher)).toBeNull();
    expect(await resolveNip05("bob@example.com", answering({}, { status: 404 }).fetcher)).toBeNull();
  });

  it("returns nothing when the domain cannot be reached", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await resolveNip05("bob@example.com", failing)).toBeNull();
  });
});

import { device, userAgent } from "./platform";
import type { PageView } from "./usage";
import vectors from "./usage-vectors.json";

let mockOS: "ios" | "android" = "ios";

jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockOS;
    },
  },
  AppState: {},
  Dimensions: {},
}));

const VIEW = vectors.payload.apps.statim.expected as PageView;

type Sent = RequestInit & { headers: Record<string, string>; signal: AbortSignal };

it("U06 device cuts", () => {
  for (const row of vectors.device) expect(device(row.width, row.height)).toBe(row.device);
});

it("U07 User-Agents match the table", () => {
  for (const os of ["iOS", "Android"] as const) {
    expect(userAgent(os)).toBe(vectors.userAgent[os]);
    expect(userAgent(os)).not.toMatch(/kestrel|grenier|statim|okhttp/i);
  }
});

describe.each([
  ["ios", "iOS"],
  ["android", "Android"],
] as const)("post on %s", (platform, os) => {
  let post: typeof import("./platform").post;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const sent = () => fetchMock.mock.calls[0][1] as Sent;

  beforeEach(() => {
    mockOS = platform;
    fetchMock.mockReset().mockResolvedValue({} as Response);
    Object.assign(globalThis, { fetch: fetchMock });
    jest.isolateModules(() => {
      ({ post } = jest.requireActual<typeof import("./platform")>("./platform"));
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "fetch");
    jest.useRealTimers();
  });

  it("U16 post sends JSON with the User-Agent", async () => {
    await post(VIEW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(vectors.endpoint);
    expect(sent()).toMatchObject({
      method: "POST",
      body: JSON.stringify(VIEW),
      headers: { "Content-Type": "application/json", "User-Agent": vectors.userAgent[os] },
    });
  });

  it("U16 post gives up after the timeout", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );

    const sending = post(VIEW);
    jest.advanceTimersByTime(vectors.timeoutSeconds * 1000 - 1);
    expect(sent().signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(sent().signal.aborted).toBe(true);
    await expect(sending).rejects.toThrow("aborted");
  });
});

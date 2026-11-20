import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";

import { useAccountStore } from "@/core/account/account-store";
import { useLockStore } from "@/core/account/lock-store";

import { sendPageView } from "./usage";
import { UsageStatistics } from "./usage-statistics";

let mockSegments: string[] = [];
let mockFront = true;
const mockFrontListeners = new Set<(inFront: boolean) => void>();

jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));
jest.mock("./usage", () => ({ sendPageView: jest.fn(async () => {}) }));
jest.mock("./front", () => ({
  currentFront: async () => mockFront,
  watchFront: (listener: (inFront: boolean) => void) => {
    mockFrontListeners.add(listener);
    return () => mockFrontListeners.delete(listener);
  },
}));

const sent = sendPageView as jest.MockedFunction<typeof sendPageView>;
const CHATS = ["(tabs)", "(chats)", "chats"];

describe("UsageStatistics", () => {
  let tree: ReactTestRenderer;

  const render = () =>
    act(async () => {
      if (tree) tree.update(createElement(UsageStatistics));
      else tree = create(createElement(UsageStatistics));
    });

  const wait = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });

  const flip = (front: boolean) =>
    act(async () => {
      mockFront = front;
      for (const listener of mockFrontListeners) listener(front);
    });

  beforeEach(() => {
    jest.useFakeTimers();
    sent.mockClear();
    mockSegments = CHATS;
    mockFront = true;
    useAccountStore.setState({ status: "ready" });
    useLockStore.setState({ status: "open" });
  });

  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined as unknown as ReactTestRenderer;
    jest.useRealTimers();
  });

  it("sends the screen in front once it has stayed a second", async () => {
    await render();
    await wait(999);
    expect(sent).not.toHaveBeenCalled();
    await wait(1);
    expect(sent.mock.calls).toEqual([["/chats"]]);
  });

  it("A03 nothing before set-up or while locked", async () => {
    useAccountStore.setState({ status: "absent" });
    await render();
    await wait(1000);
    mockSegments = ["(onboarding)", "create"];
    await render();
    await wait(1000);
    mockSegments = CHATS;
    await act(async () => useAccountStore.setState({ status: "ready" }));
    await act(async () => useLockStore.setState({ status: "locked" }));
    await render();
    await wait(1000);
    expect(sent).not.toHaveBeenCalled();

    await act(async () => useLockStore.setState({ status: "open" }));
    await wait(1000);
    expect(sent.mock.calls).toEqual([["/chats"]]);
  });

  it("sends nothing while the app is behind other apps, and the screen once it comes to the front", async () => {
    mockFront = false;
    await render();
    await wait(5000);
    expect(sent).not.toHaveBeenCalled();
    await flip(true);
    await wait(1000);
    expect(sent.mock.calls).toEqual([["/chats"]]);
  });

  it("sends the same screen again when the app comes back after 30 minutes", async () => {
    await render();
    await wait(1000);
    jest.setSystemTime(new Date("2026-11-20T10:00:00Z"));
    await flip(false);
    jest.setSystemTime(new Date("2026-11-20T10:31:00Z"));
    await flip(true);
    await wait(1000);
    expect(sent.mock.calls).toEqual([["/chats"], ["/chats"]]);
  });

  it("sends nothing for a sheet, nor for the screen under it once the sheet closes", async () => {
    await render();
    await wait(1000);
    mockSegments = ["sheet"];
    await render();
    await wait(1000);
    mockSegments = CHATS;
    await render();
    await wait(1000);
    expect(sent.mock.calls).toEqual([["/chats"]]);
  });
});

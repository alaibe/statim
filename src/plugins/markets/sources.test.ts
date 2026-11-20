import type { PluginContext } from "@/core/plugins/types";
import { publicClientFor } from "@/lib/evm/chains";
import { marketsCommands } from "./commands";
import {
  CHAINLINK_FEEDS,
  chainlink,
  chainlinkFeed,
  exchange,
  fetchPrices,
  type PriceSource,
  priceSource,
} from "./sources";

jest.mock("@/lib/evm/chains", () => ({ ...jest.requireActual("@/lib/evm/chains"), publicClientFor: jest.fn() }));

const stored = new Map<string, unknown>();
const context = {
  storage: {
    get: async (key: string) => stored.get(key) ?? null,
    set: async (key: string, value: unknown) => void stored.set(key, value),
    remove: async (key: string) => void stored.delete(key),
  },
} as unknown as PluginContext;

describe("chainlinkFeed", () => {
  it("reads any dollar quote as the asset's USD feed", () => {
    expect(chainlinkFeed("BTCUSDT")).toEqual({ base: "BTC", feed: CHAINLINK_FEEDS.BTC });
    expect(chainlinkFeed("ETHUSDC")).toEqual({ base: "ETH", feed: CHAINLINK_FEEDS.ETH });
  });

  it("refuses a market quoted in something else, and one with no feed", () => {
    expect(chainlinkFeed("ETHBTC")).toEqual({ error: expect.stringMatching(/US dollars/) });
    expect(chainlinkFeed("PEPEUSDT")).toEqual({ error: expect.stringMatching(/no Chainlink feed for PEPE/) });
  });
});

describe("chainlink", () => {
  it("scales the answer by the feed's decimals and says when it was written", async () => {
    jest.mocked(publicClientFor).mockReturnValue({
      multicall: async () => [8, [1n, 6_160_933_000_000n, 0n, 1_795_000_000n, 1n]],
    } as never);

    expect(await chainlink.ticker("BTCUSDT")).toEqual({
      symbol: "BTCUSDT",
      label: "BTC/USD",
      price: 61_609.33,
      updatedAt: 1_795_000_000,
    });
    expect(publicClientFor).toHaveBeenCalledWith(1);
  });
});

describe("fetchPrices", () => {
  it("leaves out a market the source could not price", async () => {
    const source: PriceSource = {
      ...exchange,
      ticker: async (symbol) => {
        if (symbol === "ETHUSDT") throw new Error("down");
        return { symbol, price: 1 };
      },
    };
    expect(await fetchPrices(["BTCUSDT", "ETHUSDT"], source)).toEqual({ BTCUSDT: 1 });
  });
});

describe("/marketapi", () => {
  const marketapi = marketsCommands(context, { alerts: jest.fn(), marketapi: jest.fn() }).find(
    (c) => c.name === "marketapi",
  )!;
  const run = (args: string[]) =>
    marketapi.run({ args, rest: args.join(" "), chatId: "statim" as never, context, respond: jest.fn() });

  it("switches to Chainlink and back", async () => {
    await run(["chainlink"]);
    expect(priceSource()).toBe(chainlink);
    expect(stored.get("price-source")).toBe("chainlink");

    await run(["reset"]);
    expect(priceSource()).toBe(exchange);
    expect(stored.has("price-source")).toBe(false);
  });

  it("goes back to an exchange when given one", async () => {
    await run(["chainlink"]);
    await run(["https://data.example/api/v3"]);
    expect(priceSource()).toBe(exchange);
  });
});

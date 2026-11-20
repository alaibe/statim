import type { Address } from "viem";

import { createEndpointSetting } from "@/core/plugins/endpoint-setting";
import type { PluginContext } from "@/core/plugins/types";
import { publicClientFor } from "@/lib/evm/chains";
import { fetchTicker, type Ticker } from "./api";
import { apiBase } from "./storage";

export interface PriceSource {
  id: "exchange" | "chainlink";
  name: string;
  ticker(symbol: string): Promise<Ticker>;
}

export const exchange: PriceSource = {
  id: "exchange",
  name: "Exchange",
  ticker: (symbol) => fetchTicker(symbol, apiBase()),
};

/** Chainlink's USD feeds on Ethereum, each checked on chain by its description(). */
export const CHAINLINK_FEEDS: Record<string, Address> = {
  BTC: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  SOL: "0x4ffC43a60e009B551865A93d232E33Fce9f01507",
  LINK: "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c",
  USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
  USDT: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  DAI: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
  BNB: "0x14e613AC84a31f709eadbdF89C6CC390fDc9540A",
  AAVE: "0x547a514d5e3769680Ce22B2361c10Ea13619e8a9",
  UNI: "0x553303d460EE0afB37EdFf9bE42922D8FF63220e",
  MATIC: "0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676",
  AVAX: "0xFF3EEb22B5E3dE6e705b44749C2559d704923FD7",
};

const DOLLARS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USD"];

const FEED_ABI = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/** The feed a market reads from, which is always in US dollars. */
export function chainlinkFeed(symbol: string): { base: string; feed: Address } | { error: string } {
  const quote = DOLLARS.find((q) => symbol.endsWith(q) && symbol.length > q.length);
  if (!quote) return { error: `Chainlink prices here are in US dollars, so ask for ${symbol.slice(0, 3)} on its own.` };
  const base = symbol.slice(0, -quote.length);
  const feed = CHAINLINK_FEEDS[base];
  if (!feed) {
    return { error: `There is no Chainlink feed for ${base} here. It has ${Object.keys(CHAINLINK_FEEDS).join(", ")}.` };
  }
  return { base, feed };
}

export const chainlink: PriceSource = {
  id: "chainlink",
  name: "Chainlink",
  async ticker(symbol) {
    const found = chainlinkFeed(symbol);
    if ("error" in found) throw new Error(found.error);
    const contract = { address: found.feed, abi: FEED_ABI } as const;
    const [decimals, round] = await publicClientFor(1).multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "decimals" },
        { ...contract, functionName: "latestRoundData" },
      ],
    });
    const [, answer, , updatedAt] = round;
    if (answer <= 0n) throw new Error(`The ${found.base} / USD feed has no price right now.`);
    return { symbol, label: `${found.base}/USD`, price: Number(answer) / 10 ** decimals, updatedAt: Number(updatedAt) };
  },
};

const setting = createEndpointSetting({ key: "price-source", fallback: exchange.id });

export const hydratePriceSource = setting.hydrate;

export const priceSource = (): PriceSource => (setting.current() === chainlink.id ? chainlink : exchange);

export const choosePriceSource = (context: PluginContext, source: PriceSource) =>
  setting.save(context, source === exchange ? null : source.id);

/** The markets that could be priced; one that failed is left out rather than read as zero. */
export async function fetchPrices(symbols: string[], source: PriceSource): Promise<Record<string, number>> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return [symbol, (await source.ticker(symbol)).price] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(results.filter((r): r is readonly [string, number] => r !== null && Number.isFinite(r[1])));
}

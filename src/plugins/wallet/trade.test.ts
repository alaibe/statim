import { secp256k1 } from "@noble/curves/secp256k1.js";
import { decodeFunctionData, encodeFunctionData, erc20Abi } from "viem";
import { loadLcxKey } from "@/core/account/trade-key";
import { STATIM_LOCAL_ID } from "@/core/messaging/bots";
import type { PluginContext } from "@/core/plugins/types";
import type { Widget } from "@/design/widgets";
import { publicClientFor } from "@/lib/evm/chains";
import { permittedCall, planPermit } from "@/lib/evm/permit";
import { walletClientFor } from "@/lib/evm/wallet";
import { JupiterError, jupiterQuote, jupiterSwap, SOL_MINT } from "@/lib/jupiter";
import { LcxError, type LcxSwap, lcxSwap } from "@/lib/lcx";
import {
  LIFI_NATIVE,
  LifiError,
  type LifiQuote,
  type LifiToken,
  lifiPermitTargets,
  lifiQuote,
  lifiStatus,
  lifiToken,
} from "@/lib/lifi";
import { THORCHAIN_ROUTER_ABI, type ThorQuote, thorInbound, thorQuote, thorStatus } from "@/lib/thorchain";
import { broadcast, fetchFeeRates, fetchUtxos } from "./bitcoin/api";
import { EVM_CHAINS, evmStrategy } from "./chains/evm";
import { type ChainStrategy, registerChainStrategy } from "./chains/strategy";
import { getBalance, getTokenDecimals, sendTransaction as sendSolana, signatureStatus } from "./solana/rpc";
import { signPrepared } from "./solana/transaction";
import { tradeCommand } from "./trade";

jest.mock("./bitcoin/bot", () => ({ checkAddress: jest.fn() }));
jest.mock("./bitcoin", () => ({ bitcoinStrategy: jest.fn() }));
jest.mock("./bitcoin/config", () => ({ hydrateApiBase: jest.fn(), apiBase: () => "https://mempool.test/api" }));
jest.mock("./bitcoin/api", () => ({
  ...jest.requireActual("./bitcoin/api"),
  fetchUtxos: jest.fn(),
  fetchFeeRates: jest.fn(),
  broadcast: jest.fn(),
}));
jest.mock("@/lib/thorchain", () => ({
  ...jest.requireActual("@/lib/thorchain"),
  thorQuote: jest.fn(),
  thorInbound: jest.fn(),
  thorStatus: jest.fn(),
}));
jest.mock("./solana", () => ({ solanaStrategy: {} }));
jest.mock("./chains/watcher", () => ({ checkBalances: jest.fn() }));
jest.mock("@/lib/lifi", () => ({
  ...jest.requireActual("@/lib/lifi"),
  lifiToken: jest.fn(),
  lifiQuote: jest.fn(),
  lifiStatus: jest.fn(),
  lifiPermitTargets: jest.fn(),
}));
jest.mock("@/lib/evm/permit", () => ({
  ...jest.requireActual("@/lib/evm/permit"),
  planPermit: jest.fn(),
  permittedCall: jest.fn(),
}));
jest.mock("@/lib/evm/wallet", () => ({ walletClientFor: jest.fn() }));
jest.mock("@/lib/lcx", () => ({ ...jest.requireActual("@/lib/lcx"), lcxSwap: jest.fn() }));
jest.mock("@/core/account/trade-key", () => ({
  loadTradeKey: jest.fn(async () => null),
  loadLcxKey: jest.fn(async () => null),
}));
jest.mock("@/lib/jupiter", () => ({
  ...jest.requireActual("@/lib/jupiter"),
  jupiterQuote: jest.fn(),
  jupiterSwap: jest.fn(),
}));
jest.mock("./solana/rpc", () => ({
  ...jest.requireActual("./solana/rpc"),
  getBalance: jest.fn(),
  getTokenDecimals: jest.fn(),
  sendTransaction: jest.fn(),
  signatureStatus: jest.fn(),
}));
jest.mock("./solana/transaction", () => ({
  ...jest.requireActual("./solana/transaction"),
  signPrepared: jest.fn(() => new Uint8Array([1])),
}));
jest.mock("@/lib/evm/chains", () => ({
  ...jest.requireActual("@/lib/evm/chains"),
  publicClientFor: jest.fn(),
}));

const me = "0x0000000000000000000000000000000000000002" as const;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const ROUTER = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const APPROVAL = `0x${"cd".repeat(32)}` as const;

const eth = (chainId: number): LifiToken => ({
  address: LIFI_NATIVE,
  chainId,
  symbol: "ETH",
  decimals: 18,
});
const usdc = (chainId: number, address: `0x${string}`): LifiToken => ({
  address,
  chainId,
  symbol: "USDC",
  decimals: 6,
});

function quoteFor(from: LifiToken, fromAmount: string): LifiQuote {
  return {
    toolDetails: { name: "Layerswap" },
    action: { fromAmount },
    estimate: {
      approvalAddress: ROUTER,
      toAmount: "2716948",
      toAmountMin: "2703363",
      executionDuration: 10,
      fromAmountUSD: "2.7280",
      toAmountUSD: "2.7141",
      feeCosts: [{ amount: "2500000000000", amountUSD: "0.0068", token: eth(from.chainId) }],
      gasCosts: [{ amount: "2834750000000", amountUSD: "0.0077", token: eth(from.chainId) }],
    },
    transactionRequest: {
      to: ROUTER,
      data: "0x4c279d6b",
      value: "0x38d7ea4c68000",
      gasLimit: "0xfe204",
    },
  };
}

const token = jest.mocked(lifiToken);
const quote = jest.mocked(lifiQuote);
const status = jest.mocked(lifiStatus);
const targets = jest.mocked(lifiPermitTargets);
const plan = jest.mocked(planPermit);
const permitted = jest.mocked(permittedCall);
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const PROXY = "0x89c6340B1a1f4b25D36cd8B063D49045caF3f818" as const;
const reads = {
  getBalance: jest.fn(),
  readContract: jest.fn(),
  waitForTransactionReceipt: jest.fn(),
};
const sendTransaction = jest.fn();

const context = {
  account: { address: me, signer: () => ({ address: me }) },
  storage: { get: async () => null },
} as unknown as PluginContext;

async function run(args: string[], runContext: PluginContext = context) {
  const widgets: Widget[] = [];
  const result = await tradeCommand.run({
    args,
    rest: args.join(" "),
    chatId: STATIM_LOCAL_ID,
    context: runContext,
    respond: async (content) => {
      if (typeof content !== "string" && content.kind === "widget") widgets.push(content.widget);
    },
  });
  const card = widgets.at(-1);
  const titles = widgets.flatMap((w) => (w.kind === "card" && w.title ? [w.title] : []));
  const children = card?.kind === "card" ? card.children : [];
  const find = <K extends Widget["kind"]>(kind: K) =>
    children.find((c): c is Extract<Widget, { kind: K }> => c.kind === kind);
  return {
    result,
    title: card?.kind === "card" ? card.title : undefined,
    titles,
    texts: widgets.flatMap((w) =>
      w.kind === "card" ? w.children.flatMap((c) => (c.kind === "text" ? [c.text] : [])) : [],
    ),
    message: result.type === "error" ? result.message : "",
    form: find("form"),
    stat: find("stat"),
    rows: find("rows")?.rows,
    actions: find("actions")?.actions,
    codes: children.flatMap((c) => (c.kind === "code" ? [c.value] : [])),
    links: children.flatMap((c) => (c.kind === "link" ? [c] : [])),
  };
}

const field = (form: Extract<Widget, { kind: "form" }> | undefined, id: string) =>
  form?.fields.find((f) => f.id === id);

function stubChain(id: string, name: string, self: string, explorer: string): ChainStrategy {
  return {
    id,
    name,
    icon: "ellipse",
    selfAddress: () => self,
    isAddress: (value: string) => value.length >= 26 && !value.startsWith("0x"),
    addressHint: "",
    explorer: {
      name,
      addressUrl: (address: string) => address,
      transactionUrl: (hash: string) => `${explorer}${hash}`,
    },
    transfer: { symbol: name, quote: jest.fn(), commit: jest.fn() },
  } as unknown as ChainStrategy;
}

const withAccount = (account: Record<string, unknown>) =>
  ({ ...context, account: { ...context.account, ...account } }) as unknown as PluginContext;

const usdcToEth = async (params: { fromChain: number; fromAmount: bigint }) =>
  quoteFor(usdc(params.fromChain, USDC_BASE), params.fromAmount.toString());

const disposers: (() => void)[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  for (const id of ["base", "arbitrum"]) {
    const chain = evmStrategy(EVM_CHAINS.find((spec) => spec.id === id)!);
    chain.holdings = async () => [{ symbol: "USDC", id: USDC_BASE, amount: "12" }];
    disposers.push(registerChainStrategy(chain));
  }
  jest.mocked(publicClientFor).mockReturnValue(reads as never);
  jest.mocked(walletClientFor).mockReturnValue({ sendTransaction } as never);
  reads.getBalance.mockResolvedValue(10n ** 18n);
  reads.readContract.mockResolvedValue(0n);
  reads.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  sendTransaction.mockReset().mockResolvedValueOnce(APPROVAL).mockResolvedValueOnce(HASH);
  token.mockImplementation(async (chainId) => usdc(chainId, chainId === 8453 ? USDC_BASE : USDC_ARB));
  // A chain with no proxy by default, so each test says which lane it takes.
  targets.mockResolvedValue(null);
  plan.mockResolvedValue(null);
  quote.mockImplementation(async (params) => quoteFor(eth(params.fromChain), params.fromAmount.toString()));
});

afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

describe("/trade", () => {
  it("opens a from/to form on the default chain, with LI.FI credited", async () => {
    const { result, form, links } = await run([]);

    expect(result).toEqual({ type: "handled" });
    expect(field(form, "from")?.value).toBe("base");
    expect(field(form, "to")?.value).toBe("base");
    expect(field(form, "from")?.options?.map((o) => o.value)).toEqual(["base", "arbitrum"]);
    expect(field(form, "token")?.options).toEqual(
      expect.arrayContaining([
        { label: "ETH", value: "native", when: { from: "base" } },
        { label: "USDC", value: USDC_BASE, when: { from: "base" } },
      ]),
    );
    expect(form?.submit.command).toBe(
      "/trade {amount} {token} {receive} --from {from} --to {to} --recipient {recipient}",
    );
    expect(field(form, "recipient")?.optional).toBe(true);
    expect(links).toContainEqual(expect.objectContaining({ label: "Powered by LI.FI", url: "https://li.fi" }));
    expect(quote).not.toHaveBeenCalled();
  });

  it("quotes to your own address when no recipient is given", async () => {
    const { rows } = await run(["0.001", "native", "usdc"]);

    expect(quote).toHaveBeenCalledWith(expect.objectContaining({ toAddress: me }), null);
    expect(rows?.some((row) => row.label === "Lands in")).toBe(false);
  });

  it("quotes to the recipient asked for, and says so on the review", async () => {
    const other = "0x00000000000000000000000000000000000000AA" as const;
    const { rows, actions } = await run(["0.001", "native", "usdc", "--recipient", other]);

    expect(quote).toHaveBeenCalledWith(expect.objectContaining({ toAddress: other }), null);
    expect(rows).toContainEqual(expect.objectContaining({ label: "Lands in", tone: "warning" }));
    // Confirming quotes again, so the command has to carry it.
    expect(actions?.[0].command).toContain(`--recipient ${other}`);
  });

  it("refuses a recipient that is not an address rather than quoting", async () => {
    const { result, message } = await run(["0.001", "native", "usdc", "--recipient", "not-an-address"]);

    expect(result.type).toBe("error");
    expect(message).toMatch(/could not be resolved to a Base address/i);
    expect(quote).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the form has to ask for the rest", async () => {
    const { form } = await run(["0.5", "usdc", "--to", "arbitrum"]);

    expect(field(form, "amount")?.value).toBe("0.5");
    expect(field(form, "token")?.value).toBe(USDC_BASE);
    expect(field(form, "to")?.value).toBe("arbitrum");
  });

  it("refuses a chain that is off", async () => {
    expect((await run(["--from", "bitcoin"])).message).toMatch(/not switched on/);
    expect((await run(["--to", "polygon"])).message).toMatch(/not switched on/);
  });

  it("quotes a bridge and offers confirmation without signing anything", async () => {
    const { result, title, stat, rows, actions, links } = await run([
      "0.001",
      "native",
      "USDC",
      "--from",
      "base",
      "--to",
      "arbitrum",
    ]);

    expect(result).toEqual({ type: "handled" });
    expect(token).toHaveBeenCalledTimes(1);
    expect(quote).toHaveBeenCalledWith(
      expect.objectContaining({
        fromChain: 8453,
        toChain: 42161,
        fromToken: LIFI_NATIVE,
        toToken: USDC_ARB,
        fromAmount: 10n ** 15n,
        fromAddress: me,
        toAddress: me,
      }),
      null,
    );
    expect(title).toBe("Bridge Base → Arbitrum One");
    expect(stat).toEqual(expect.objectContaining({ value: "≈ 2.716948 USDC", label: "You receive on Arbitrum One" }));
    expect(rows).toEqual([
      { label: "You send", value: "0.001 ETH on Base" },
      { label: "Route", value: "Layerswap" },
      { label: "Takes about", value: "10 s" },
      { label: "Gas fee", value: "0.000003 ETH (≈ $0.01)" },
      { label: "Route fees", value: "0.000003 ETH (≈ $0.01)" },
      { label: "Value", value: "$2.73 → $2.71" },
    ]);
    expect(actions).toEqual([
      {
        label: "Confirm and bridge",
        command: "/trade 0.001 native USDC --from base --to arbitrum --confirm",
      },
    ]);
    expect(links.map((l) => l.label)).toContain("Powered by LI.FI");
    expect(walletClientFor).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("stops before asking LI.FI when the balance does not cover the amount", async () => {
    reads.getBalance.mockResolvedValue(10n ** 14n);

    const { message } = await run(["0.001", "native", "USDC", "--from", "base", "--to", "base"]);

    expect(message).toMatch(/Not enough ETH on Base/);
    expect(message).toMatch(/Nothing was sent/);
    expect(quote).not.toHaveBeenCalled();
  });

  it("stops before the quote is signed when the balance does not also cover gas", async () => {
    reads.getBalance.mockResolvedValue(10n ** 15n);

    const { message } = await run(["0.001", "native", "USDC", "--from", "base", "--to", "base", "--confirm"]);

    expect(message).toMatch(/Not enough ETH on Base/);
    expect(message).toMatch(/in fees/);
    expect(message).toMatch(/Nothing was sent/);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("surfaces LI.FI’s own explanation when there is no route", async () => {
    quote.mockRejectedValue(
      new LifiError(404, "LI.FI found no route for this trade. A larger amount or a different pair may have one."),
    );

    const { message } = await run(["0.001", "native", "USDC", "--from", "base", "--to", "arbitrum"]);

    expect(message).toMatch(/no route for this trade/);
    expect(message).toMatch(/Nothing was sent/);
  });

  it("names a token LI.FI does not know", async () => {
    token.mockResolvedValue(null);

    const { message } = await run(["0.001", "native", "NOPE", "--from", "base", "--to", "arbitrum"]);

    expect(message).toMatch(/"NOPE" is not a token LI.FI knows on Arbitrum One/);
    expect(quote).not.toHaveBeenCalled();
  });

  it("sends the quoted transaction on confirm, with no approval for the native coin", async () => {
    sendTransaction.mockReset().mockResolvedValueOnce(HASH);

    const { result, title, actions } = await run([
      "0.001",
      "native",
      "USDC",
      "--from",
      "base",
      "--to",
      "arbitrum",
      "--confirm",
    ]);

    expect(result).toEqual({ type: "handled" });
    expect(walletClientFor).toHaveBeenCalledWith(expect.objectContaining({ address: me }), 8453);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ROUTER,
        data: "0x4c279d6b",
        value: 0x38d7ea4c68000n,
        gas: 0xfe204n,
        chain: null,
      }),
    );
    expect(title).toBe("Bridge started");
    expect(actions).toEqual([{ label: "Check status", command: `/trade --status ${HASH} --from base --to arbitrum` }]);
  });

  it("approves the route contract first when a token allowance is short", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );

    const { result, codes } = await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base", "--confirm"]);

    expect(result).toEqual({ type: "handled" });
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(sendTransaction.mock.calls[0][0]).toEqual(expect.objectContaining({ to: USDC_BASE, chain: null }));
    expect(sendTransaction.mock.calls[0][0].data).toMatch(/^0x095ea7b3/);
    expect(reads.waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: APPROVAL }));
    expect(sendTransaction.mock.calls[1][0]).toEqual(expect.objectContaining({ to: ROUTER }));
    expect(codes).toEqual([APPROVAL, HASH]);
  });

  it("says the approval is out while it waits, so the chat is not just a spinner", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );

    const { titles } = await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base", "--confirm"]);

    expect(titles).toEqual(["Approval sent", "Swapped"]);
  });

  it("does not claim a trade when the approval has not confirmed in time", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );
    reads.waitForTransactionReceipt.mockRejectedValueOnce(new Error("timed out"));

    const { result, message } = await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base", "--confirm"]);

    expect(result.type).toBe("error");
    expect(message).toMatch(/still waiting to confirm.*nothing was traded/i);
    // Only the approval went out.
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("signs the allowance away instead of sending one when Permit2 is ready", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );
    targets.mockResolvedValue({ permit2: PERMIT2, proxy: PROXY });
    plan.mockResolvedValue({ kind: "permit2" });
    permitted.mockResolvedValue({ to: PROXY, data: "0xfeed" });
    sendTransaction.mockReset().mockResolvedValueOnce(HASH);

    const { result, texts } = await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base", "--confirm"]);

    expect(result).toEqual({ type: "handled" });
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction.mock.calls[0][0]).toEqual(expect.objectContaining({ to: PROXY, data: "0xfeed" }));
    expect(permitted).toHaveBeenCalledWith(
      8453,
      expect.anything(),
      { permit2: PERMIT2, proxy: PROXY },
      { kind: "permit2" },
      expect.objectContaining({ token: USDC_BASE, diamondCalldata: "0x4c279d6b" }),
    );
    expect(texts.join(" ")).not.toMatch(/approval/i);
  });

  it("approves Permit2 once, not the router on every trade", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );
    targets.mockResolvedValue({ permit2: PERMIT2, proxy: PROXY });
    plan.mockResolvedValue({
      kind: "permit2",
      approve: { spender: PERMIT2, amount: 2n ** 256n - 1n },
    });
    permitted.mockResolvedValue({ to: PROXY, data: "0xfeed" });

    const { texts } = await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base"]);

    expect(texts.join(" ")).toMatch(/one approval first, to Permit2, and never again/i);
  });

  it("tells the router itself when there is no proxy to sign through", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );

    const { texts } = await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base"]);

    expect(texts.join(" ")).toMatch(/one-time approval first: a second transaction/i);
    expect(permitted).not.toHaveBeenCalled();
  });

  it("skips the approval when the allowance already covers the amount", async () => {
    quote.mockImplementation(usdcToEth);
    reads.readContract.mockResolvedValue(12_000_000n);
    sendTransaction.mockReset().mockResolvedValueOnce(HASH);

    await run(["5", USDC_BASE, "native", "--from", "base", "--to", "base", "--confirm"]);

    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction.mock.calls[0][0]).toEqual(expect.objectContaining({ to: ROUTER }));
  });

  it("warns against repeating a trade whose card could not be posted", async () => {
    sendTransaction.mockReset().mockResolvedValueOnce(HASH);
    const args = ["0.001", "native", "USDC", "--from", "base", "--to", "base", "--confirm"];
    const result = await tradeCommand.run({
      args,
      rest: args.join(" "),
      chatId: STATIM_LOCAL_ID,
      context,
      respond: async () => {
        throw new Error("Network request failed");
      },
    });

    const message = result.type === "error" ? result.message : "";
    expect(message).toMatch(/Your trade was sent on Base/);
    expect(message).toMatch(/Do not send it again/);
    expect(message).toContain(HASH);
  });

  it("asks LI.FI how a bridge is doing", async () => {
    status.mockResolvedValue({
      status: "DONE",
      substatusMessage: "The transfer is complete.",
      sending: { txHash: HASH, chainId: 8453, amount: "1000000000000000", token: eth(8453) },
      receiving: {
        txHash: HASH,
        txLink: `https://arbiscan.io/tx/${HASH}`,
        chainId: 42161,
        amount: "2716948",
        token: usdc(42161, USDC_ARB),
      },
      lifiExplorerLink: `https://scan.li.fi/tx/${HASH}`,
    });

    const { result, stat, rows, actions } = await run(["--status", HASH, "--from", "base", "--to", "arbitrum"]);

    expect(result).toEqual({ type: "handled" });
    expect(status).toHaveBeenCalledWith({ txHash: HASH, fromChain: 8453, toChain: 42161 }, null);
    expect(stat).toEqual(expect.objectContaining({ value: "Done", caption: "The transfer is complete." }));
    expect(rows).toEqual([
      { label: "Sent", value: "0.001 ETH on Base" },
      { label: "Received", value: "2.716948 USDC on Arbitrum One" },
    ]);
    expect(actions).toBeUndefined();
  });
});

describe("/trade with an LCX Liberty DEX key", () => {
  const LCX_ROUTER = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0" as const;
  const withAccount = {
    ...context,
    account: { ...context.account, accountId: "account-1" },
  } as unknown as PluginContext;
  const lcx = jest.mocked(lcxSwap);

  const lcxFor = (fromAmount: string, minAmountOut: string, tokenOut: `0x${string}` = USDC_BASE): LcxSwap => ({
    quote: {
      quoteId: "q_1",
      input: { amount: fromAmount, token: LIFI_NATIVE },
      output: { amount: minAmountOut, minimumAmount: minAmountOut, token: tokenOut },
      usdValueIn: 2.728,
      usdValueOut: 2.716,
      gasEstimateWei: "30000000000000",
      gasFeeUSD: 0.0082,
      spender: LCX_ROUTER,
    },
    build: {
      swap: { chainId: 8453, to: LCX_ROUTER, data: "0xfc54261d", value: "0" },
      minAmountOut,
      routerDeployed: true,
    },
  });

  beforeEach(() => {
    jest.mocked(loadLcxKey).mockResolvedValue("lbk_test");
  });

  afterEach(() => {
    jest.mocked(loadLcxKey).mockResolvedValue(null);
  });

  it("asks LCX Liberty DEX too on a same-chain swap and takes the better floor", async () => {
    lcx.mockResolvedValue(lcxFor("1000000000000000", "2710000"));

    const { rows, links } = await run(["0.001", "native", "usdc"], withAccount);

    expect(lcx).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 8453,
        tokenIn: LIFI_NATIVE,
        tokenOut: USDC_BASE,
        amountIn: 10n ** 15n,
        recipient: me,
        slippageBps: 50,
      }),
      "lbk_test",
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "Route", value: "LCX Liberty DEX" },
        { label: "LI.FI quote", value: "At least 2.703363 USDC" },
      ]),
    );
    expect(rows?.some((row) => row.label === "Takes about")).toBe(false);
    expect(links).toContainEqual(expect.objectContaining({ label: "Powered by LCX Liberty DEX" }));
  });

  it("keeps LI.FI when it guarantees more", async () => {
    lcx.mockResolvedValue(lcxFor("1000000000000000", "2700000"));

    const { rows, links } = await run(["0.001", "native", "usdc"], withAccount);

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "Route", value: "Layerswap" },
        { label: "LCX Liberty DEX quote", value: "At least 2.7 USDC" },
      ]),
    );
    expect(links).toContainEqual(expect.objectContaining({ label: "Powered by LI.FI" }));
  });

  it("keeps LI.FI when both guarantee the same", async () => {
    lcx.mockResolvedValue(lcxFor("1000000000000000", "2703363"));

    const { rows } = await run(["0.001", "native", "usdc"], withAccount);

    expect(rows).toEqual(expect.arrayContaining([{ label: "Route", value: "Layerswap" }]));
  });

  it("still quotes through LI.FI when LCX Liberty DEX has no route", async () => {
    lcx.mockRejectedValue(new LcxError(400, "LCX Liberty DEX found no route for this trade.", "no_route"));

    const { result, rows } = await run(["0.001", "native", "usdc"], withAccount);

    expect(result).toEqual({ type: "handled" });
    expect(rows).toEqual(expect.arrayContaining([{ label: "Route", value: "Layerswap" }]));
    expect(rows?.some((row) => row.label === "LCX Liberty DEX quote")).toBe(false);
  });

  it("uses LCX Liberty DEX when LI.FI has no route", async () => {
    quote.mockRejectedValue(new LifiError(404, "LI.FI found no route for this trade.", 1002));
    lcx.mockResolvedValue(lcxFor("1000000000000000", "2710000"));

    const { result, rows } = await run(["0.001", "native", "usdc"], withAccount);

    expect(result).toEqual({ type: "handled" });
    expect(rows).toEqual(expect.arrayContaining([{ label: "Route", value: "LCX Liberty DEX" }]));
  });

  it("leaves bridges to LI.FI", async () => {
    await run(["0.001", "native", "usdc", "--to", "arbitrum"], withAccount);

    expect(lcx).not.toHaveBeenCalled();
    expect(quote).toHaveBeenCalled();
  });

  it("approves the LCX Liberty DEX router for the exact amount, then sends its transaction", async () => {
    quote.mockImplementation(usdcToEth);
    lcx.mockResolvedValue(lcxFor("5000000", "2000000000000000", LIFI_NATIVE));
    reads.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "balanceOf" ? 12_000_000n : 0n,
    );

    const { result, links } = await run(["5", USDC_BASE, "native", "--confirm"], withAccount);

    expect(result).toEqual({ type: "handled" });
    expect(plan).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(sendTransaction.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        to: USDC_BASE,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [LCX_ROUTER, 5_000_000n] }),
      }),
    );
    expect(sendTransaction.mock.calls[1][0]).toEqual(
      expect.objectContaining({ to: LCX_ROUTER, data: "0xfc54261d", value: 0n }),
    );
    expect(links.some((link) => link.label === "Track on LI.FI")).toBe(false);
  });
});

describe("/trade on Solana", () => {
  const SOL_ME = "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN";
  const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const SIGNATURE = "5".repeat(88);
  const solanaContext = withAccount({
    deriveEd25519: () => ({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) }),
  });

  const answer = {
    inputMint: SOL_MINT,
    outputMint: USDC_SOL,
    inAmount: "100000000",
    outAmount: "7236079",
    otherAmountThreshold: "7199899",
    routePlan: [{ swapInfo: { label: "Raydium CLMM" } }, { swapInfo: { label: "Manifest" } }],
  };

  beforeEach(() => {
    disposers.push(registerChainStrategy(stubChain("solana", "Solana", SOL_ME, "https://solscan.io/tx/")));
    jest.mocked(getBalance).mockResolvedValue(10n ** 9n);
    jest.mocked(getTokenDecimals).mockResolvedValue(6);
    jest.mocked(jupiterQuote).mockResolvedValue(answer);
    jest.mocked(jupiterSwap).mockResolvedValue({ swapTransaction: btoa("unsigned") });
    jest.mocked(sendSolana).mockResolvedValue(SIGNATURE);
    jest.mocked(signatureStatus).mockResolvedValue({ err: null, confirmationStatus: "confirmed" });
  });

  const swap = (...extra: string[]) => run(["0.1", "SOL", "USDC", "--from", "solana", ...extra], solanaContext);

  it("quotes a swap through Jupiter without asking LI.FI", async () => {
    const { title, stat, rows, links } = await swap();

    expect(title).toBe("Swap on Solana");
    expect(stat?.value).toBe("≈ 7.236079 USDC");
    expect(stat?.caption).toMatch(/At least 7.199899 USDC/);
    expect(rows).toContainEqual({ label: "Route", value: "Jupiter: Raydium CLMM, Manifest" });
    expect(links.map((l) => l.label)).toContain("Powered by Jupiter");
    expect(jupiterQuote).toHaveBeenCalledWith({
      inputMint: SOL_MINT,
      outputMint: USDC_SOL,
      amount: 100_000_000n,
      slippageBps: 50,
    });
    expect(quote).not.toHaveBeenCalled();
    expect(jupiterSwap).not.toHaveBeenCalled();
  });

  it("refuses a trade that would leave too little SOL for its fees", async () => {
    jest.mocked(getBalance).mockResolvedValue(100_000_000n);
    expect((await swap("--confirm")).message).toMatch(/about 0.005 SOL left over/);
    expect(sendSolana).not.toHaveBeenCalled();
  });

  it("does not use an answer for another trade", async () => {
    jest.mocked(jupiterQuote).mockResolvedValue({ ...answer, inAmount: "1" });
    expect((await swap()).message).toMatch(/answered for a different trade/);
  });

  it("shows Jupiter's own words when it has no route", async () => {
    jest.mocked(jupiterQuote).mockRejectedValue(new JupiterError(400, "Jupiter found no route for this trade."));
    expect((await swap()).message).toMatch(/Jupiter found no route/);
  });

  it("signs the transaction Jupiter assembles on confirm, and calls it swapped once confirmed", async () => {
    const { title, links } = await swap("--confirm");

    expect(jupiterSwap).toHaveBeenCalledWith(answer, SOL_ME);
    expect(signPrepared).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.anything(),
      "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    );
    expect(sendSolana).toHaveBeenCalled();
    expect(title).toBe("Swapped");
    expect(links.map((l) => l.url)).toContain(`https://solscan.io/tx/${SIGNATURE}`);
  });

  it("says a swap that failed on chain traded nothing", async () => {
    jest
      .mocked(signatureStatus)
      .mockResolvedValue({ err: { InstructionError: [0, "Custom"] }, confirmationStatus: "confirmed" });
    expect((await swap("--confirm")).message).toMatch(/failed on Solana, so nothing was traded/);
  });

  it("keeps a Solana trade on Solana and in your own address", async () => {
    expect((await swap("--to", "base")).message).toMatch(/Nothing in the app trades from Solana to Base/);
    expect((await swap("--recipient", "11111111111111111111111111111112")).message).toMatch(
      /lands in your own address/,
    );
  });
});

describe("/trade between Bitcoin and Ethereum through THORChain", () => {
  const BTC_ME = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
  const BTC_VAULT = "bc1qdr0ssmsgglm66nx2k2sfhz8mxy7rmvzu6qr9s3";
  const ETH_VAULT = "0x7d715394d03c70675bc9309ca2d877479e6ae156";
  const THOR_ROUTER = "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146";
  const TXID = "cd".repeat(32);
  const inbound = (chain: string, address: string, router?: string) => ({
    chain,
    address,
    router,
    halted: false,
    chain_trading_paused: false,
    global_trading_paused: false,
  });

  const btcToEth: ThorQuote = {
    inbound_address: BTC_VAULT,
    memo: `=:e:${me}:34953867`,
    expected_amount_out: "35129515",
    fees: { total: "84698" },
    expiry: 1795167804,
    recommended_min_amount_in: "5907",
    recommended_gas_rate: "3",
    total_swap_seconds: 606,
  };
  const ethToBtc: ThorQuote = {
    inbound_address: ETH_VAULT,
    router: THOR_ROUTER,
    memo: `=:b:${BTC_ME}:160209`,
    expected_amount_out: "161015",
    fees: { total: "1293" },
    expiry: 1795167804,
    recommended_min_amount_in: "100000",
    total_swap_seconds: 606,
  };

  beforeEach(() => {
    disposers.push(registerChainStrategy(stubChain("bitcoin", "Bitcoin", BTC_ME, "https://mempool.space/tx/")));
    disposers.push(registerChainStrategy(evmStrategy(EVM_CHAINS.find((spec) => spec.id === "ethereum")!)));
    jest.mocked(fetchUtxos).mockResolvedValue([{ txid: "ab".repeat(32), vout: 0, value: 2_000_000n }]);
    jest.mocked(fetchFeeRates).mockResolvedValue({ fast: 9, medium: 5, slow: 2 });
    jest.mocked(broadcast).mockResolvedValue(TXID);
    jest
      .mocked(thorInbound)
      .mockImplementation(async (chain) =>
        chain === "BTC" ? inbound("BTC", BTC_VAULT) : inbound("ETH", ETH_VAULT, THOR_ROUTER),
      );
    jest.mocked(thorQuote).mockImplementation(async ({ fromAsset }) => (fromAsset === "BTC.BTC" ? btcToEth : ethToBtc));
  });

  const privateKey = new Uint8Array(32).fill(1);
  const bitcoinContext = withAccount({
    derive: () => ({ privateKey, publicKey: secp256k1.getPublicKey(privateKey, true) }),
  });

  const fromBitcoin = (...extra: string[]) =>
    run(["0.01", "BTC", "native", "--from", "bitcoin", "--to", "ethereum", ...extra], bitcoinContext);

  it("quotes Bitcoin to Ethereum with THORChain's own floor and fees", async () => {
    const { title, stat, rows } = await fromBitcoin();

    expect(title).toBe("Bridge Bitcoin → Ethereum");
    expect(stat?.value).toBe("≈ 0.351295 ETH");
    expect(stat?.caption).toMatch(/At least 0.349539 ETH/);
    expect(rows).toContainEqual({ label: "Route", value: "THORChain" });
    expect(rows?.find((r) => r.label === "Gas fee")?.value).toMatch(/BTC$/);
    expect(rows?.find((r) => r.label === "Route fees")?.value).toBe("0.000847 ETH");
    expect(thorQuote).toHaveBeenCalledWith({
      fromAsset: "BTC.BTC",
      toAsset: "ETH.ETH",
      amount: 1_000_000n,
      destination: me,
      toleranceBps: 50,
    });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("sends the deposit with its memo on confirm, and offers to check on it", async () => {
    const { title, actions } = await fromBitcoin("--confirm");

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(jest.mocked(broadcast).mock.calls[0][0]).toContain(Buffer.from(btcToEth.memo).toString("hex"));
    expect(title).toBe("Bridge started");
    expect(actions).toEqual([
      { label: "Check status", command: `/trade --status ${TXID} --from bitcoin --to ethereum` },
    ]);
  });

  it("does not deposit while THORChain has trading paused", async () => {
    jest.mocked(thorInbound).mockResolvedValue({ ...inbound("BTC", BTC_VAULT), chain_trading_paused: true });
    expect((await fromBitcoin("--confirm")).message).toMatch(/not taking deposits on Bitcoin/);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("does not use a quote whose vault, memo or limit it cannot vouch for", async () => {
    jest.mocked(thorQuote).mockResolvedValue({ ...btcToEth, inbound_address: "bc1qsomeoneelse" });
    expect((await fromBitcoin()).message).toMatch(/vault THORChain does not list/);

    jest.mocked(thorQuote).mockResolvedValue({ ...btcToEth, memo: "=:e:0x000000000000000000000000000000000000dEaD:1" });
    expect((await fromBitcoin()).message).toMatch(/somewhere else/);

    jest.mocked(thorQuote).mockResolvedValue({ ...btcToEth, memo: `=:e:${me}:0` });
    expect((await fromBitcoin()).message).toMatch(/no price limit/);
  });

  it("refuses an amount below what THORChain could refund", async () => {
    jest.mocked(thorQuote).mockResolvedValue({ ...btcToEth, recommended_min_amount_in: "2000000" });
    expect((await fromBitcoin()).message).toMatch(/needs at least 0.02 BTC/);
  });

  it("deposits ETH through THORChain's router, with the vault and memo it quoted", async () => {
    sendTransaction.mockReset().mockResolvedValueOnce(HASH);
    await run(["0.1", "native", "BTC", "--from", "ethereum", "--to", "bitcoin", "--confirm"]);

    const [{ to, value, data }] = sendTransaction.mock.calls[0];
    expect(to).toBe(THOR_ROUTER);
    expect(value).toBe(10n ** 17n);
    expect(decodeFunctionData({ abi: THORCHAIN_ROUTER_ABI, data }).args).toEqual([
      expect.stringMatching(/^0x7d71/i),
      "0x0000000000000000000000000000000000000000",
      10n ** 17n,
      ethToBtc.memo,
      BigInt(ethToBtc.expiry),
    ]);
  });

  it("asks THORChain how a deposit is doing", async () => {
    jest.mocked(thorStatus).mockResolvedValue({
      stages: { inbound_observed: { completed: true }, outbound_signed: { completed: true } },
      out_txs: [{ id: "AB".repeat(32), chain: "ETH", coins: [{ asset: "ETH.ETH", amount: "35000000" }] }],
    });
    const { title, stat, rows, links } = await run(["--status", TXID, "--from", "bitcoin", "--to", "ethereum"]);

    expect(title).toBe("Bridge status");
    expect(stat?.value).toBe("Done");
    expect(rows).toEqual([{ label: "Received", value: "0.35 ETH" }]);
    expect(links.map((l) => l.url)).toContain(`https://etherscan.io/tx/0x${"ab".repeat(32)}`);
  });
});

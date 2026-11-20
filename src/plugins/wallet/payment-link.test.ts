import { findPaymentLink, parsePaymentLink, paymentRequest } from "./payment-link";

const ALICE = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SEGWIT = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const SOL = "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN";

describe("ethereum: links (EIP-681)", () => {
  it("reads a coin payment, with the amount in wei and an exponent", () => {
    expect(parsePaymentLink(`ethereum:${ALICE}?value=2.014e18`)).toEqual({
      chain: "ethereum",
      to: ALICE,
      amount: "2.014",
    });
  });

  it("takes the chain after @ and the pay- prefix", () => {
    expect(parsePaymentLink(`ethereum:pay-${ALICE}@8453?value=1e15`)).toEqual({
      chain: "base",
      to: ALICE,
      amount: "0.001",
    });
  });

  it("reads a token transfer, with the recipient in its parameters", () => {
    expect(parsePaymentLink(`ethereum:${USDC}/transfer?address=${ALICE}&uint256=2.5e6`)).toEqual({
      chain: "ethereum",
      to: ALICE,
      token: USDC,
      units: 2_500_000n,
    });
  });

  it("leaves the amount to you when the link has none", () => {
    expect(parsePaymentLink("ethereum:vitalik.eth")).toEqual({ chain: "ethereum", to: "vitalik.eth" });
  });

  it("refuses a chain the wallet does not send on, a fraction of a wei, and any other call", () => {
    expect(parsePaymentLink(`ethereum:${ALICE}@56?value=1e18`)).toEqual({ error: expect.stringContaining("chain 56") });
    expect(parsePaymentLink(`ethereum:${ALICE}?value=1.5`)).toEqual({ error: expect.stringContaining("wei") });
    expect(parsePaymentLink(`ethereum:${USDC}/approve?address=${ALICE}`)).toEqual({
      error: expect.stringContaining("approve"),
    });
  });

  it("is not a payment link without an address or name", () => {
    expect(parsePaymentLink("ethereum:hello")).toBeNull();
    expect(parsePaymentLink(`ethereum:${USDC}/transfer?uint256=1`)).toBeNull();
  });
});

describe("bitcoin: links (BIP-21)", () => {
  it("reads the address, the amount in BTC and the message", () => {
    expect(parsePaymentLink(`bitcoin:${SEGWIT}?amount=0.0005&label=Luke&message=Donation%20for%20xyz`)).toEqual({
      chain: "bitcoin",
      to: SEGWIT,
      amount: "0.0005",
      note: "Donation for xyz",
    });
  });

  it("lowercases the upper-case form a QR code carries", () => {
    expect(parsePaymentLink(`BITCOIN:${SEGWIT.toUpperCase()}`)).toEqual({ chain: "bitcoin", to: SEGWIT });
  });

  it("refuses a requirement it does not know, and a Lightning-only link", () => {
    expect(parsePaymentLink(`bitcoin:${SEGWIT}?req-pop=x`)).toEqual({ error: expect.stringContaining("req-pop") });
    expect(parsePaymentLink("bitcoin:?lightning=lnbc1")).toEqual({ error: expect.stringContaining("Lightning") });
  });
});

describe("solana: links (Solana Pay)", () => {
  it("reads a SOL transfer", () => {
    expect(parsePaymentLink(`solana:${SOL}?amount=0.25&label=Michael`)).toEqual({
      chain: "solana",
      to: SOL,
      amount: "0.25",
      note: "Michael",
    });
  });

  it("refuses a token and a payment the shop tracks by reference", () => {
    expect(parsePaymentLink(`solana:${SOL}?amount=1&spl-token=EPjFWdd5`)).toEqual({ error: expect.any(String) });
    expect(parsePaymentLink(`solana:${SOL}?amount=1&reference=82ZJ7nb`)).toEqual({ error: expect.any(String) });
  });

  it("is not a transfer when it points at a transaction request", () => {
    expect(parsePaymentLink("solana:https%3A%2F%2Fexample.com%2Fpay")).toBeNull();
  });
});

describe("findPaymentLink", () => {
  it("finds a link inside a sentence and drops the punctuation after it", () => {
    expect(findPaymentLink(`Pay me here: bitcoin:${SEGWIT}?amount=0.01.`)).toBe(`bitcoin:${SEGWIT}?amount=0.01`);
  });

  it("ignores text that only looks like one", () => {
    expect(findPaymentLink("ethereum: the chain, not a link")).toBeNull();
  });

  it("leaves a link the wallet cannot pay to the message's other cards", () => {
    expect(findPaymentLink(`solana:${SOL}?amount=1&reference=82ZJ7nb`)).toBeNull();
    expect(findPaymentLink(`ethereum:${ALICE}@56?value=1e18`)).toBeNull();
  });
});

describe("paymentRequest", () => {
  it("turns a coin payment into the /send that reviews it", async () => {
    expect(await paymentRequest({ chain: "base", to: ALICE, amount: "0.001" })).toEqual({
      command: `/send 0.001 ${ALICE} --chain base`,
      amount: "0.001",
      symbol: "ETH",
      chainName: "Base",
    });
  });

  it("scales a token amount by its decimals and names the token", async () => {
    const request = await paymentRequest({ chain: "ethereum", to: ALICE, token: USDC, units: 2_500_000n });
    expect(request).toMatchObject({
      command: `/send 2.5 ${ALICE} --chain ethereum --token ${USDC}`,
      symbol: "USDC",
    });
  });

  it("opens the form when the link has no amount", async () => {
    expect((await paymentRequest({ chain: "solana", to: SOL })).command).toBe(`/send ${SOL} --chain solana`);
  });
});

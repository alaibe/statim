import { HttpError } from "@/core/errors";
import { fetchJson, type JsonApi } from "./json-api";
import { jupiterQuote } from "./jupiter";
import { thorQuote } from "./thorchain";

function answer(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => body }) as Response);
}

const api: JsonApi<{ reason?: string }> = {
  name: "Example",
  limited: "Example is busy.",
  keyRejected: "Your Example key was rejected.",
  explain: (_status, body) => body?.reason,
  error: (status, message) => new HttpError(status, message),
};

describe("fetchJson", () => {
  it("returns the body of a good answer", async () => {
    answer(200, { price: 1 });
    expect(await fetchJson("https://example.test", undefined, api)).toEqual({ price: 1 });
  });

  it("says the API is limiting requests, or that a key was rejected, in its own words", async () => {
    answer(429, null);
    await expect(fetchJson("https://example.test", undefined, api)).rejects.toThrow("Example is busy.");
    answer(403, { reason: "forbidden" });
    await expect(fetchJson("https://example.test", undefined, api)).rejects.toThrow("Your Example key was rejected.");
  });

  it("uses the API's explanation, else the status", async () => {
    answer(400, { reason: "No such pair." });
    await expect(fetchJson("https://example.test", undefined, api)).rejects.toThrow("No such pair.");
    answer(502, "<html>");
    await expect(fetchJson("https://example.test", undefined, api)).rejects.toThrow(
      "Example could not be reached (HTTP 502).",
    );
  });
});

describe("the trade APIs' refusals", () => {
  const thor = { fromAsset: "BTC.BTC", toAsset: "ARB.ETH", amount: 1n, destination: "0x", toleranceBps: 50 };

  it("names Jupiter's no-route answers", async () => {
    answer(400, { error: "No routes found", errorCode: "NO_ROUTES_FOUND" });
    await expect(jupiterQuote({ inputMint: "a", outputMint: "b", amount: 1n, slippageBps: 50 })).rejects.toThrow(
      /Jupiter found no route/,
    );
  });

  it("reads THORChain's halts and missing pools, and passes on anything else", async () => {
    answer(400, { code: 3, message: "failed to simulate swap: trading is halted, can't process swap" });
    await expect(thorQuote(thor)).rejects.toThrow(/paused trading/);
    answer(400, { code: 3, message: "fail to convert dest fee to src asset pool does not exist" });
    await expect(thorQuote(thor)).rejects.toThrow(/no pool/);
    answer(400, { code: 3, message: "memo too long" });
    await expect(thorQuote(thor)).rejects.toThrow("THORChain: memo too long");
  });
});

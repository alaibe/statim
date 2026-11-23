import { keccak256, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { PluginContext } from "@/core/plugins/types";

import { handleSessionRequest } from "./rpc";

it("signs a hex message's own bytes, even when they are not text", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const context = { account: { signer: () => account } } as unknown as PluginContext;
  const hash = keccak256("0x1234");

  const signature = await handleSessionRequest(
    {
      kind: "request",
      id: 1,
      topic: "topic",
      method: "personal_sign",
      params: [hash, account.address],
      chainId: "eip155:1",
      siteName: "Site",
    },
    context,
  );

  expect(await recoverMessageAddress({ message: { raw: hash }, signature: signature as `0x${string}` })).toBe(
    account.address,
  );
});

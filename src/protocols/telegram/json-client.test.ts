import type { TdObject } from "./api";
import { type TdDriver, TdJsonClient } from "./json-client";

function driver() {
  let fail!: (error: Error) => void;
  const sent: TdObject[] = [];
  const td: TdDriver = {
    create: async () => {},
    send: async (request) => {
      sent.push(request);
    },
    receive: () =>
      new Promise<TdObject[]>((_, reject) => {
        fail = reject;
      }),
    destroy: async () => {},
  };
  return { td, sent, fail: (error: Error) => fail(error) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("TdJsonClient", () => {
  it("reports a client whose receive fails while it is open as lost", async () => {
    const { td, fail } = driver();
    const client = await TdJsonClient.create(td);
    const lost = jest.fn();
    client.onLost(lost);

    fail(new Error("gone"));
    await settle();

    expect(lost).toHaveBeenCalledTimes(1);
    await expect(client.send({ "@type": "getMe" })).rejects.toThrow("TDLib client is closed");
  });

  it("does not report a client it was closing as lost", async () => {
    const { td, sent, fail } = driver();
    const client = await TdJsonClient.create(td);
    const lost = jest.fn();
    client.onLost(lost);

    const closing = client.close();
    expect(sent).toEqual([expect.objectContaining({ "@type": "close" })]);
    fail(new Error("closed"));
    await closing;

    expect(lost).not.toHaveBeenCalled();
  });
});

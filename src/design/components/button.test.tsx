import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";

import { Button } from "./button";

jest.mock("../lib/submit-key", () => jest.requireActual("../lib/submit-key.web"));

const keys = new EventTarget();
Object.assign(globalThis, {
  addEventListener: keys.addEventListener.bind(keys),
  removeEventListener: keys.removeEventListener.bind(keys),
});

const submit = async () => {
  const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Enter", metaKey: true });
  await act(async () => keys.dispatchEvent(event));
  return event.defaultPrevented;
};

const trees: ReactTestRenderer[] = [];
const mount = async (element: React.ReactElement) => {
  await act(async () => {
    trees.push(create(element));
  });
};

afterEach(async () => {
  await act(async () => {
    for (const tree of trees.splice(0)) tree.unmount();
  });
});

describe("⌘↵", () => {
  it("presses the button that shows it", async () => {
    const send = jest.fn();
    await mount(<Button label="Rename" variant="primary" keys={["mod", "enter"]} onPress={send} />);
    expect(await submit()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("leaves a disabled one alone", async () => {
    const send = jest.fn();
    await mount(<Button label="Erase" variant="danger" keys={["mod", "enter"]} disabled onPress={send} />);
    await submit();
    expect(send).not.toHaveBeenCalled();
  });

  it("reaches only the innermost dialog's, even while it waits to be enabled", async () => {
    const under = jest.fn();
    const over = jest.fn();
    await mount(<Button label="Start chat" variant="primary" keys={["mod", "enter"]} onPress={under} />);
    await mount(<Button label="Erase" variant="danger" keys={["mod", "enter"]} disabled onPress={over} />);
    await submit();
    expect(under).not.toHaveBeenCalled();
    expect(over).not.toHaveBeenCalled();
  });

  it("does nothing without such a button", async () => {
    await mount(<Button label="Cancel" onPress={jest.fn()} />);
    expect(await submit()).toBe(false);
  });
});

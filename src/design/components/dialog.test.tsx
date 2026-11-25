import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";

import { ConfirmDialog } from "./dialog";

jest.mock("./sheet", () => ({
  Sheet: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));
jest.mock("./button", () => ({ Button: "Button" }));
jest.mock("./input", () => ({ Input: "Input" }));
jest.mock("./text", () => ({ Text: "Text" }));
jest.mock("./chamfer", () => ({ Chamfer: "Chamfer" }));

let tree: ReactTestRenderer;
const onPress = jest.fn();
const action = () =>
  tree.root.findAllByType("Button" as never).find((node) => node.props.label === "Erase everything")!;

beforeEach(async () => {
  onPress.mockClear();
  await act(async () => {
    tree = create(
      createElement(ConfirmDialog, {
        visible: true,
        onClose: () => {},
        title: "Erase everything?",
        typedName: "erase",
        confirm: { label: "Erase everything", danger: true, onPress },
      }),
    );
  });
});

it("holds an irreversible action until its name is typed", async () => {
  expect(action().props.disabled).toBe(true);

  const input = tree.root.findByType("Input" as never);
  await act(async () => input.props.onChangeText("eras"));
  expect(action().props.disabled).toBe(true);

  await act(async () => input.props.onChangeText("erase"));
  expect(action().props.disabled).toBe(false);
  expect(action().props).toMatchObject({ variant: "danger", confirm: true });
});

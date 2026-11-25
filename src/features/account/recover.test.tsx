import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import RecoverScreen from "@/app/recover";
import { eraseEverything } from "@/core/app/erase-account";

jest.mock("@/design", () => ({
  Button: "Button",
  ConfirmDialog: "ConfirmDialog",
  Notice: "Notice",
  Screen: "Screen",
  Section: "Section",
  SettingsRow: "SettingsRow",
  Text: "Text",
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock("@/core/app/erase-account", () => ({ eraseEverything: jest.fn(async () => {}) }));

let tree: ReactTestRenderer;
const dialog = () => tree.root.findByType("ConfirmDialog" as never);

beforeEach(async () => {
  jest.mocked(eraseEverything).mockClear();
  await act(async () => {
    tree = create(createElement(RecoverScreen));
  });
});

it("asks before erasing everything, as a danger action typed to confirm", async () => {
  expect(dialog().props.visible).toBe(false);

  const erase = tree.root
    .findAllByType("Button" as never)
    .find((node) => String(node.props.label).startsWith("Erase everything"))!;
  await act(async () => erase.props.onPress());

  expect(eraseEverything).not.toHaveBeenCalled();
  expect(dialog().props).toMatchObject({ visible: true, typedName: "erase", confirm: { danger: true } });

  await act(async () => dialog().props.confirm.onPress());
  expect(eraseEverything).toHaveBeenCalledTimes(1);
});

it("erases nothing when the dialog is cancelled", async () => {
  const erase = tree.root
    .findAllByType("Button" as never)
    .find((node) => String(node.props.label).startsWith("Erase everything"))!;
  await act(async () => erase.props.onPress());
  await act(async () => dialog().props.onClose());

  expect(dialog().props.visible).toBe(false);
  expect(eraseEverything).not.toHaveBeenCalled();
});

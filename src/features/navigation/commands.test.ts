import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMANDS, hintsFor, menuCommand, toggleSidebar, useOverlays } from "./commands";
import { commandFor, keysOf } from "./keys";
import { openChat } from "./open";

jest.mock("./open", () => ({ openChat: jest.fn(), openTab: jest.fn() }));

const keyed = COMMANDS.filter((command) => command.keys && !command.sequence);
const bound = (keys: string[]) => keyed.some((command) => command.keys?.join("+") === keys.join("+"));

describe("the command registry", () => {
  it("binds every shared key of the design system's keyboard pattern", () => {
    const shared = [
      ["mod", "k"],
      ["mod", ","],
      ["mod", "f"],
      ["/"],
      ["mod", "n"],
      ["mod", "1"],
      ["mod", "\\"],
      ["f6"],
      ["shift", "f6"],
      ["mod", "["],
      ["mod", "]"],
      ["j"],
      ["k"],
      ["down"],
      ["up"],
      ["e"],
      ["n"],
      ["mod", "z"],
      ["?"],
    ];
    expect(shared.filter((keys) => !bound(keys))).toEqual([]);
    expect(COMMANDS.filter((command) => command.sequence).map((command) => command.keys?.[0])).toContain("g");
  });

  it("gives every key one command", () => {
    const combos = keyed.map((command) => command.keys?.join("+"));
    expect(combos.filter((combo, index) => combos.indexOf(combo) !== index)).toEqual([]);
  });

  it("runs every app menu item, with the menu's accelerator", () => {
    const menu = readFileSync(join(__dirname, "../../../src-tauri/src/app_menu.rs"), "utf8");
    const items = [...menu.matchAll(/page\(app, "([a-z-]+)", "[^"]+", (?:Some\("([^"]+)"\)|None)\)/g)]
      .map(([, id, accelerator]) => ({ id, accelerator }))
      .filter((item) => item.id !== "check-updates");
    expect(items.length).toBeGreaterThan(10);
    for (const { id, accelerator } of items) {
      const command = COMMANDS.find((entry) => entry.id === id);
      expect(command).toBeDefined();
      if (accelerator) expect(command?.keys?.join("+")).toBe(accelerator.replace("CmdOrCtrl", "mod").toLowerCase());
    }
  });

  it("opens a recent chat from the History menu", () => {
    const menu = readFileSync(join(__dirname, "../../../src-tauri/src/app_menu.rs"), "utf8");
    const prefix = /format!\("\{PAGE\}([a-z]+:)\{\}", chat\.id\)/.exec(menu)?.[1];
    expect(prefix).toBe("chat:");
    menuCommand(`${prefix}xmtp:abc`)?.run({ segments: [] });
    expect(openChat).toHaveBeenCalledWith("xmtp:abc");
  });

  it("collapses the sidebar at full width and opens it as a drawer below 1100", () => {
    toggleSidebar(1280);
    expect(useOverlays.getState()).toMatchObject({ sidebarCollapsed: true, sidebarDrawer: false });
    toggleSidebar(1280);
    toggleSidebar(900);
    expect(useOverlays.getState()).toMatchObject({ sidebarCollapsed: false, sidebarDrawer: true });
    toggleSidebar(900);
    expect(useOverlays.getState().sidebarDrawer).toBe(false);
  });

  it("shows at most five hints, the list's starting with J/K", () => {
    const hints = hintsFor("list", { segments: ["(tabs)", "(chats)", "chats"] });
    expect(hints.length).toBeLessThanOrEqual(5);
    expect(hints[0]).toMatchObject({ keys: ["j", "k"], action: "move" });
  });
});

describe("the keymap", () => {
  const scope = { segments: [] };
  const press = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    keysOf({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

  it("reads ⌘ and Ctrl alike", () => {
    expect(press("k", { metaKey: true })).toEqual(["mod", "k"]);
    expect(press("k", { ctrlKey: true })).toEqual(["mod", "k"]);
    expect(press("F6", { shiftKey: true })).toEqual(["shift", "f6"]);
    expect(press("?", { shiftKey: true })).toEqual(["?"]);
  });

  it("leaves single letters and ⌘Z to a text field", () => {
    expect(commandFor(["n"], true, scope)).toBeUndefined();
    expect(commandFor(["mod", "z"], true, scope)).toBeUndefined();
    expect(commandFor(["n"], false, scope)?.id).toBe("new");
    expect(commandFor(["mod", "k"], true, scope)?.id).toBe("palette");
  });

  it("doesn't archive when no chat is open", () => {
    expect(commandFor(["e"], false, scope)).toBeUndefined();
  });
});

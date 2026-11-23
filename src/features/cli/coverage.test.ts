import { COMMANDS } from "./commands";
import * as coverage from "./coverage";
import { HANDLERS } from "./handlers";

const paths = new Set<string>(COMMANDS.map((c) => c.path));

it("names a command or a reason for every store action", () => {
  const unnamed = Object.values(coverage).flatMap((map) =>
    Object.entries(map)
      .filter(([, where]) => !(paths.has(where) || where === "internal" || /^app: \S/.test(where)))
      .map(([action]) => action),
  );
  expect(unnamed).toEqual([]);
});

it("has a handler for every command but the one the app answers itself", () => {
  expect(Object.keys(HANDLERS).sort()).toEqual([...paths].filter((p) => p !== "quit").sort());
});

import { readFileSync } from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the generator is a plain Node script
const { generate, SOURCE, JSON_OUT, CSS_OUT } = require("../../scripts/tokens");

it("generates the tokens and global.css from the design system's tokens.css", () => {
  const { json, css } = generate(readFileSync(SOURCE, "utf8"));
  expect(readFileSync(JSON_OUT, "utf8")).toBe(json);
  expect(readFileSync(CSS_OUT, "utf8")).toBe(css);
});

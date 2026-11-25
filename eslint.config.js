const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

function boundary(layers, patterns) {
  return {
    files: layers.map((layer) => `src/${layer}/**/*.{ts,tsx}`),
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns }] },
  };
}

const FROM_SRC = "^(?:@/|(?:\\.\\./)+)";

const LOOK =
  "/(?:^|\\s)(?:[a-z-]+:)?(?:bg|text|border|rounded|font|tracking|leading|shadow|placeholder|tint)(?:-|\\s|$)|\\[/";
const RAW_COLOUR = "/^(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\\(.*)$/";

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "priv/*"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    // Screens take their look from the design system's components: className is for layout only.
    files: ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/plugins/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=${LOOK}]`,
          message: "Colour, radius, type and arbitrary values come from design components, not className.",
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${LOOK}]`,
          message: "Colour, radius, type and arbitrary values come from design components, not className.",
        },
        {
          selector: `Literal[value=${RAW_COLOUR}]`,
          message: "Use a token colour from useThemeColors(), not a raw one.",
        },
      ],
    },
  },
  boundary(
    ["core"],
    [
      {
        regex: "^(?:@/(?:features|app)|(?:\\.\\./)+features)(?:/|$)",
        message: "Core may not import the UI.",
      },
      {
        regex: `${FROM_SRC}design(?!/widgets(?:/|$))(?:/|$)`,
        message: "Core may import design types, and widgets, which are data.",
        allowTypeImports: true,
      },
    ],
  ),
  boundary(
    ["protocols", "storage"],
    [
      {
        regex: `${FROM_SRC}(?:features|design|app|plugins|core/app)(?:/|$)`,
        message: "Protocols and storage may not import the UI, plugins or app state.",
      },
    ],
  ),
]);

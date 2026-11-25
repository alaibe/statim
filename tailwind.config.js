const tokens = require("./src/design/laibe/tokens.json");

const px = (group) => Object.fromEntries(Object.entries(group).map(([name, value]) => [name, `${value}px`]));

/** The theme is the design system's and nothing else: a colour, radius or size it doesn't name doesn't exist. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    colors: {
      transparent: "transparent",
      ...Object.fromEntries(
        Object.keys(tokens.colors).map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
      ),
    },
    borderRadius: px(tokens.radius),
    fontSize: px(tokens.fontSize),
    // React Native's `fontFamily` takes one loaded family name; `Text` picks the weight's file.
    fontFamily: { sans: "Inter-400", mono: "JetBrainsMono-400" },
    letterSpacing: Object.fromEntries(Object.entries(tokens.tracking).map(([name, value]) => [name, `${value}em`])),
    boxShadow: { none: "none", ...tokens.shadow },
    extend: {
      spacing: { touch: `${tokens.control.touch}px` },
    },
  },
  plugins: [],
};

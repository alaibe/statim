const { platformSelect } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // `<alpha-value>` keeps opacity modifiers such as `bg-surface/60` working.
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          soft: 'rgb(var(--color-brand-soft) / <alpha-value>)',
          strong: 'rgb(var(--color-brand-strong) / <alpha-value>)',
          on: 'rgb(var(--color-brand-on) / <alpha-value>)',
        },
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--color-surface-sunken) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--color-content) / <alpha-value>)',
          muted: 'rgb(var(--color-content-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-content-subtle) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          strong: 'rgb(var(--color-line-strong) / <alpha-value>)',
        },
        bubble: {
          out: 'rgb(var(--color-bubble-out) / <alpha-value>)',
          'out-on': 'rgb(var(--color-bubble-out-on) / <alpha-value>)',
          in: 'rgb(var(--color-bubble-in) / <alpha-value>)',
          'in-on': 'rgb(var(--color-bubble-in-on) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
      borderRadius: {
        card: '18px',
        bubble: '15px',
        field: '14px',
        pill: '999px',
      },
      fontFamily: {
        // React Native's `fontFamily` takes one concrete family name and rejects
        // a CSS variable or a stack ("Value is an object, expected a String").
        sans: platformSelect({
          ios: 'System',
          android: 'sans-serif',
          default: 'var(--font-display)',
        }),
        mono: platformSelect({
          ios: 'Menlo',
          android: 'monospace',
          default: 'var(--font-mono)',
        }),
        rounded: platformSelect({
          // iOS exposes the rounded system face under this name.
          ios: 'ui-rounded',
          android: 'sans-serif-medium',
          default: 'var(--font-rounded)',
        }),
      },
      fontSize: {
        // Body is 16px, the minimum for readable body copy on a phone. Only
        // metadata (timestamps, counts, labels) sits below it.
        micro: ['11px', { lineHeight: '14px' }],
        caption: ['13px', { lineHeight: '17px' }],
        footnote: ['15px', { lineHeight: '20px' }],
        body: ['16px', { lineHeight: '22px' }],
        title: ['18px', { lineHeight: '24px' }],
        headline: ['24px', { lineHeight: '30px' }],
        display: ['34px', { lineHeight: '40px' }],
      },
      spacing: {
        gutter: '16px',
        tap: '44px', // Apple's minimum accessible hit target
      },
    },
  },
  plugins: [],
};

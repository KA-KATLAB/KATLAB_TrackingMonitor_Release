import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // A prose slice notation in momentum.tsx otherwise looks like an arbitrary
  // Tailwind property and emits invalid CSS during minification.
  blocklist: ["[-14:-7]"],
  theme: {
    extend: {
      // A.1/D3: real pairing with offline-safe fallbacks — preflight puts
      // `sans` on <html>, so the whole UI + every font-mono spot adopt it
      // with zero class churn.
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
        mono: ['"Azeret Mono"', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        ui: {
          canvas: "rgb(var(--ui-canvas) / <alpha-value>)",
          surface: "rgb(var(--ui-surface) / <alpha-value>)",
          raised: "rgb(var(--ui-surface-raised) / <alpha-value>)",
          border: "rgb(var(--ui-border) / <alpha-value>)",
          "control-border": "rgb(var(--ui-control-border) / <alpha-value>)",
          text: "rgb(var(--ui-text) / <alpha-value>)",
          muted: "rgb(var(--ui-text-muted) / <alpha-value>)",
          primary: "rgb(var(--ui-primary) / <alpha-value>)",
          "primary-hover": "rgb(var(--ui-primary-hover) / <alpha-value>)",
          focus: "rgb(var(--ui-focus) / <alpha-value>)",
          live: "rgb(var(--ui-live) / <alpha-value>)",
          success: "rgb(var(--ui-success) / <alpha-value>)",
          warning: "rgb(var(--ui-warning) / <alpha-value>)",
          danger: "rgb(var(--ui-danger) / <alpha-value>)",
        },
      },
      borderRadius: {
        control: "6px",
        panel: "8px",
      },
      zIndex: {
        "layer-content": "0",
        "layer-sticky": "20",
        "layer-popover": "30",
        "layer-release": "40",
        "layer-attract": "50",
        "layer-dialog": "100",
      },
      transitionDuration: {
        press: "120ms",
        ui: "180ms",
      },
    },
  },
  plugins: [],
};

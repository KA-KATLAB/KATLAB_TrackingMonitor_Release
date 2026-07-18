import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // A.1/D3: real pairing with offline-safe fallbacks — preflight puts
      // `sans` on <html>, so the whole UI + every font-mono spot adopt it
      // with zero class churn.
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
        mono: ['"Azeret Mono"', ...defaultTheme.fontFamily.mono],
      },
    },
  },
  plugins: [],
};

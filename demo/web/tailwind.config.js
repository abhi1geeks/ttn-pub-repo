/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gli: {
          surface: "rgb(var(--gli-surface) / <alpha-value>)",
          accent: "rgb(var(--gli-accent) / <alpha-value>)",
          muted: "rgb(var(--gli-muted) / <alpha-value>)",
          border: "rgb(var(--gli-border) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      colors: {
        brand: { 50: "#eff6ff", 100: "#dbeafe", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        blink: { "0%,80%,100%": { opacity: "0.3" }, "40%": { opacity: "1" } },
      },
      animation: { "fade-up": "fade-up 0.35s ease-out both", blink: "blink 1.4s infinite" },
    },
  },
  plugins: [],
};
export default config;

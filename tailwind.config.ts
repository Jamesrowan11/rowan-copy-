import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Navy brand palette
        navy: {
          DEFAULT: "#14233f",
          50: "#f3f5f9",
          100: "#e2e8f1",
          200: "#c4d0e1",
          300: "#9bb0cb",
          400: "#6b88ad",
          500: "#48648c",
          600: "#1b2c4f",
          700: "#14233f",
          800: "#101b30",
          900: "#0b1322",
        },
        accent: {
          // Warm copper/amber CTA accent that reads well on navy
          DEFAULT: "#e08a3c",
          hover: "#c9762c",
          soft: "#fbe9d6",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(20, 35, 63, 0.08), 0 8px 24px rgba(20, 35, 63, 0.06)",
        soft: "0 1px 2px rgba(20, 35, 63, 0.06)",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;

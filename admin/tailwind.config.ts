import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tis: {
          navy: "#163a5f",
          ink: "#0f2740",
          sky: "#4f8fcf",
          mist: "#e8f1fa",
          gold: "#c9a227",
          cream: "#f7f9fc",
          success: "#1f9d6a",
          danger: "#d64545",
          muted: "#6b7c8f",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 30px rgba(22, 58, 95, 0.08)",
        card: "0 4px 18px rgba(22, 58, 95, 0.06)",
      },
      backgroundImage: {
        fuji:
          "linear-gradient(180deg, rgba(247,249,252,0) 0%, rgba(232,241,250,0.9) 55%, rgba(79,143,207,0.18) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

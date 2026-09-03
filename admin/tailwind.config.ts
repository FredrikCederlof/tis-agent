import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tis: {
          // Ceeworks palette: Racing Green, Championship White, Off-Black, Acid Green
          navy: "#05513d",
          ink: "#1a191b",
          sky: "#05513d",
          mist: "#e7f3ec",
          gold: "#8ffe09",
          cream: "#f1f1ee",
          acid: "#8ffe09",
          success: "#05513d",
          danger: "#d64545",
          muted: "#5c635f",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 30px rgba(26, 25, 27, 0.08)",
        card: "0 4px 18px rgba(5, 81, 61, 0.08)",
      },
      backgroundImage: {
        fuji:
          "linear-gradient(180deg, rgba(241,241,238,0) 0%, rgba(231,243,236,0.9) 55%, rgba(5,81,61,0.10) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

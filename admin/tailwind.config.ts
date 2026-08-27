import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tis: {
          navy: "#1e3a5f",
          gold: "#c9a227",
        },
      },
    },
  },
  plugins: [],
};

export default config;

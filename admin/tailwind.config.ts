import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tis: {
          navy: "var(--tis-navy)",
          ink: "var(--tis-ink)",
          sky: "var(--tis-sky)",
          mist: "var(--tis-mist)",
          gold: "var(--tis-gold)",
          cream: "var(--tis-cream)",
          acid: "var(--tis-acid)",
          unread: "var(--tis-unread)",
          blue: "var(--tis-blue)",
          lilac: "var(--tis-lilac)",
          amber: "var(--tis-amber)",
          success: "var(--tis-success)",
          danger: "var(--tis-danger)",
          muted: "var(--tis-muted)",
          surface: "var(--tis-surface)",
          "surface-subtle": "var(--tis-surface-subtle)",
          border: "var(--tis-border)",
          active: "var(--tis-active)",
          "on-active": "var(--tis-on-active)",
          lime: "var(--tis-lime)",
          "on-lime": "var(--tis-on-lime)",
          "lime-soft": "var(--tis-lime-soft)",
          sidebar: "var(--tis-sidebar)",
        },
        tina: {
          workspace: "var(--tina-workspace)",
          surface: "var(--tina-surface)",
          subtle: "var(--tina-surface-subtle)",
          text: "var(--tina-text)",
          secondary: "var(--tina-text-secondary)",
          muted: "var(--tina-text-muted)",
          border: "var(--tina-border)",
          active: "var(--tina-active)",
          lime: "var(--tina-lime)",
          "on-lime": "var(--tina-on-lime)",
          "lime-soft": "var(--tina-lime-soft)",
        },
      },
      fontFamily: {
        sans: ["var(--tis-font)"],
        display: ["var(--tis-font)"],
      },
      boxShadow: {
        soft: "0 10px 30px rgba(26, 25, 27, 0.08)",
        card: "var(--tis-shadow-card)",
        float: "var(--tis-shadow-float, var(--tis-shadow-card))",
        tray: "var(--tis-shadow-tray, 0 0 0 1px rgb(11 13 21 / 4%))",
      },
      borderRadius: {
        pane: "var(--tis-radius-pane)",
      },
      transitionTimingFunction: {
        soft: "var(--tis-ease-out, cubic-bezier(0.32, 0.72, 0, 1))",
        spring: "var(--tis-ease-spring, cubic-bezier(0.22, 1, 0.36, 1))",
      },
      transitionDuration: {
        soft: "var(--tis-duration, 420ms)",
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

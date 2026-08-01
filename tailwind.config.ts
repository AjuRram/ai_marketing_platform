import type { Config } from "tailwindcss";

/**
 * Every colour is declared as three raw RGB channels in globals.css
 * (e.g. `--brand: 255 107 74`) rather than a finished `rgb()` string.
 *
 * That is what lets Tailwind's slash-opacity modifiers work on custom tokens:
 * `bg-brand/12` compiles to `rgb(var(--brand) / 0.12)`. If the variable held a
 * complete colour instead, the opacity modifier would be silently dropped and
 * every translucent surface in the app would render fully opaque.
 *
 * It also means the light theme is a pure token swap — no `dark:` variants
 * anywhere in the component tree.
 */
const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /**
       * Tailwind's slash modifier (`bg-brand/12`) only accepts values that
       * exist in the OPACITY SCALE — it is not arbitrary. The default scale
       * steps in fives, so `/8`, `/12` and `/14` generated no class at all and
       * the affected surfaces rendered with no background whatsoever: the
       * active sidebar item lost its highlight, every tinted badge went flat,
       * and the approval card lost its warning wash.
       *
       * It fails silently — no build error, no console warning, just a missing
       * rule — which is exactly the kind of thing that survives to production.
       * These three tints are what the design actually calls for, so the scale
       * is extended rather than the design rounded to fit it.
       */
      opacity: {
        8: "0.08",
        12: "0.12",
        14: "0.14",
      },
      colors: {
        canvas: channel("canvas"),
        surface: channel("surface"),
        raised: channel("raised"),
        hairline: channel("hairline"),

        ink: channel("ink"),
        muted: channel("muted"),
        faint: channel("faint"),

        brand: channel("brand"),
        "brand-ink": channel("brand-ink"),

        up: channel("up"),
        down: channel("down"),
        warn: channel("warn"),
        info: channel("info"),

        // Per-channel tints. Content cards, badges and flow steps are colour-coded
        // by delivery channel so the kanban is scannable without reading labels.
        email: channel("email"),
        social: channel("social"),
        blog: channel("blog"),
      },
      borderRadius: {
        soft: "10px",
        card: "14px",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.95rem" }],
      },
      maxWidth: {
        shell: "1440px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-ring": "pulseRing 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;

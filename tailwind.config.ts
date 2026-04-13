import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base dark palette
        background: "#07090f",
        surface: "#0d1117",
        "surface-2": "#161b22",
        "surface-3": "#1c2128",
        border: "#21262d",
        "border-2": "#30363d",
        muted: "#484f58",
        "text-muted": "#8b949e",
        "text-secondary": "#c9d1d9",
        foreground: "#f0f6fc",

        // Polymath accent — cyan for satellite/radar feel
        accent: "#06b6d4",
        "accent-2": "#0891b2",
        "accent-glow": "rgba(6,182,212,0.15)",

        // Risk color system
        stable: "#22c55e",
        "stable-bg": "rgba(34,197,94,0.12)",
        monitor: "#eab308",
        "monitor-bg": "rgba(234,179,8,0.12)",
        concerning: "#f97316",
        "concerning-bg": "rgba(249,115,22,0.12)",
        dangerous: "#ef4444",
        "dangerous-bg": "rgba(239,68,68,0.12)",
      },
      fontFamily: {
        sans: ["General Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

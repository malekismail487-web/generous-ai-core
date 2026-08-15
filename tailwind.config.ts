import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
        "typing": {
          "0%, 60%, 100%": { opacity: "0.3" },
          "30%": { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(var(--primary) / 0.3)" },
          "50%": { boxShadow: "0 0 40px hsl(var(--primary) / 0.5)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "orbit-spin": {
          from: { transform: "rotateZ(0deg)" },
          to: { transform: "rotateZ(360deg)" },
        },
        "breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.75" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
        "sheen": {
          from: { transform: "translateX(-120%) skewX(-12deg)" },
          to: { transform: "translateX(220%) skewX(-12deg)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translate3d(0, 18px, -40px)", filter: "blur(6px)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)", filter: "blur(0)" },
        },
        "tile-in": {
          from: { opacity: "0", transform: "perspective(1200px) translate3d(0, 28px, -80px) rotateX(8deg)" },
          to: { opacity: "1", transform: "perspective(1200px) translate3d(0, 0, 0) rotateX(0deg)" },
        },
        "aurora-drift": {
          "0%, 100%": { transform: "translate3d(-6%, -4%, 0) scale(1)" },
          "33%": { transform: "translate3d(8%, 6%, 0) scale(1.12)" },
          "66%": { transform: "translate3d(-4%, 9%, 0) scale(0.94)" },
        },
        "think-pulse": {
          "0%, 100%": { transform: "scaleY(0.35)", opacity: "0.4" },
          "50%": { transform: "scaleY(1)", opacity: "1" },
        },
        "marquee-line": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "ring-trace": {
          from: { strokeDashoffset: "260" },
          to: { strokeDashoffset: "0" },
        },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "typing": "typing 1.4s infinite",
        "float": "float 4s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "scale-in": "scale-in 0.3s ease-out forwards",
        "orbit-spin": "orbit-spin 18s linear infinite",
        "breathe": "breathe 5s ease-in-out infinite",
        "sheen": "sheen 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "rise-in": "rise-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },

    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

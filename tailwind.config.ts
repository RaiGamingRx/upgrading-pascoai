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
        sans: ['Inter', 'sans-serif'],
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
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
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
      // Motion duration tokens
      transitionDuration: {
        micro: "100ms",
        standard: "220ms",
        emphasis: "380ms",
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
        "reveal-up": {
          from: { opacity: "0", transform: "translateY(18px) scale(0.99)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "reveal-left": {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "reveal-scale": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-fast": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "shimmer-subtle": {
          "0%": { backgroundPosition: "-400% 0" },
          "100%": { backgroundPosition: "400% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.85)" },
        },
        scanline: {
          "0%": { top: "-2px", opacity: "0.8" },
          "100%": { top: "100%", opacity: "0" },
        },
        "border-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "gradient-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "nav-indicator": {
          from: { opacity: "0", scaleY: "0.5" },
          to: { opacity: "1", scaleY: "1" },
        },
        "press": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.96)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "reveal-up": "reveal-up 0.38s cubic-bezier(0.16, 1, 0.3, 1) both",
        "reveal-left": "reveal-left 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
        "reveal-scale": "reveal-scale 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.25s ease-out both",
        "fade-in-fast": "fade-in-fast 0.15s ease-out both",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-up": "slide-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 2s linear infinite",
        "shimmer-subtle": "shimmer-subtle 3s linear infinite",
        float: "float 4s ease-in-out infinite",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
        scanline: "scanline 2.5s linear infinite",
        "border-flow": "border-flow 4s ease infinite",
        "gradient-shift": "gradient-shift 6s ease infinite",
        "nav-indicator": "nav-indicator 0.2s ease-out both",
        press: "press 0.15s ease-out",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "cyber-grid": "linear-gradient(hsl(var(--border) / 0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.25) 1px, transparent 1px)",
        "gradient-shimmer": "linear-gradient(105deg, transparent 40%, hsl(var(--primary) / 0.08) 50%, transparent 60%)",
      },
      backgroundSize: {
        "grid-sm": "16px 16px",
        "grid-md": "24px 24px",
        "grid-lg": "40px 40px",
        "shimmer": "200% 100%",
        "shimmer-wide": "400% 100%",
      },
      boxShadow: {
        // Neon effects - restrained versions
        "neon-cyan": "0 0 16px hsl(186 85% 48% / 0.45), 0 0 32px hsl(186 85% 48% / 0.2)",
        "neon-cyan-sm": "0 0 8px hsl(186 85% 48% / 0.35), 0 0 16px hsl(186 85% 48% / 0.15)",
        "neon-cyan-subtle": "0 0 0 1px hsl(186 85% 48% / 0.2), 0 0 12px hsl(186 85% 48% / 0.1)",
        "neon-green": "0 0 16px hsl(150 80% 45% / 0.45), 0 0 32px hsl(150 80% 45% / 0.2)",
        "neon-green-sm": "0 0 8px hsl(150 80% 45% / 0.35)",
        "neon-purple": "0 0 16px hsl(270 80% 58% / 0.4), 0 0 32px hsl(270 80% 58% / 0.2)",
        "neon-red": "0 0 16px hsl(0 84% 60% / 0.4), 0 0 32px hsl(0 84% 60% / 0.2)",
        // Surface shadows
        "surface-sm": "0 1px 3px hsl(0 0% 0% / 0.3), 0 1px 2px hsl(0 0% 0% / 0.2)",
        "surface-md": "0 4px 12px hsl(0 0% 0% / 0.35), 0 2px 4px hsl(0 0% 0% / 0.25)",
        "surface-lg": "0 10px 30px hsl(0 0% 0% / 0.4), 0 4px 8px hsl(0 0% 0% / 0.3)",
        // Glass
        "glass": "0 4px 24px hsl(0 0% 0% / 0.25), inset 0 1px 0 hsl(255 100% 100% / 0.05)",
        "glass-lg": "0 8px 40px hsl(0 0% 0% / 0.35), inset 0 1px 0 hsl(255 100% 100% / 0.06)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

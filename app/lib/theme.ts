// LOCUS Explorer design tokens.
// Strict aesthetic: pitch-black background (#000), pure-white foreground (#FFF),
// with grays expressed as white at varying opacity.
export const theme = {
  colors: {
    bg: "#000000",
    fg: "#FFFFFF",
    // white-opacity gray ramp
    g04: "rgba(255,255,255,0.04)",
    g08: "rgba(255,255,255,0.08)",
    g12: "rgba(255,255,255,0.12)",
    g20: "rgba(255,255,255,0.20)",
    g32: "rgba(255,255,255,0.32)",
    g48: "rgba(255,255,255,0.48)",
    g64: "rgba(255,255,255,0.64)",
    g80: "rgba(255,255,255,0.80)",
  },
  // 4px base spacing scale
  space: (n: number) => `${n * 4}px`,
  radius: { sm: "4px", md: "8px", lg: "14px", pill: "999px" },
  font: {
    sans: "var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  fontSize: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "18px",
    xl: "24px",
    xxl: "40px",
  },
  // framer-motion durations (seconds)
  motion: {
    fast: 0.18,
    base: 0.28,
    slow: 0.5,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
  z: { map: 1, sidebar: 10, nav: 20, modal: 100 },
} as const;

export type Theme = typeof theme;

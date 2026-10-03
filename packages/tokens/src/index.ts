// Automatisch erzeugt aus packages/tokens/tokens.json – nicht von Hand ändern.
export const tokens = {
  "color": {
    "light": {
      "paper": "#F6F1E7",
      "paper-raised": "#FBF8F2",
      "paper-sunk": "#EDE5D6",
      "ink": "#1E1A2B",
      "ink-soft": "#4A4458",
      "ink-muted": "#625B70",
      "line": "#D8CDB9",
      "line-strong": "#B9AC94",
      "wine": "#7A2638",
      "wine-hover": "#621D2D",
      "on-wine": "#FBF8F2",
      "brass": "#7A5A24",
      "brass-decor": "#B08A4E",
      "night": "#1C1E33",
      "night-raised": "#26294A",
      "on-night": "#F1EADC",
      "on-night-muted": "#C9C0D6",
      "focus": "#1F4FA3",
      "success": "#2E6A4C",
      "danger": "#A12E28",
      "warning": "#7A5200"
    },
    "dark": {
      "paper": "#15172A",
      "paper-raised": "#1E2139",
      "paper-sunk": "#101222",
      "ink": "#F1EADC",
      "ink-soft": "#D9D0E2",
      "ink-muted": "#B4ABC4",
      "line": "#363A5C",
      "line-strong": "#4C5179",
      "wine": "#E7A3AF",
      "wine-hover": "#F1BCC5",
      "on-wine": "#1A0E14",
      "brass": "#D8B57A",
      "brass-decor": "#B08A4E",
      "night": "#0E1020",
      "night-raised": "#1A1D36",
      "on-night": "#F1EADC",
      "on-night-muted": "#C9C0D6",
      "focus": "#9DBAF5",
      "success": "#8FD1AE",
      "danger": "#F2A39D",
      "warning": "#F0C674"
    }
  },
  "font": {
    "display": "\"Fraunces Variable\", \"Fraunces\", Georgia, \"Times New Roman\", serif",
    "body": "\"Source Sans 3 Variable\", \"Source Sans 3\", system-ui, -apple-system, \"Segoe UI\", sans-serif",
    "mono": "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
  },
  "fontSize": {
    "xs": "0.8125rem",
    "sm": "0.9375rem",
    "md": "1.0625rem",
    "lg": "1.25rem",
    "xl": "1.5rem",
    "2xl": "clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem)",
    "3xl": "clamp(2.125rem, 1.6rem + 2.4vw, 3.25rem)",
    "4xl": "clamp(2.625rem, 1.8rem + 3.8vw, 4.75rem)"
  },
  "lineHeight": {
    "tight": "1.12",
    "snug": "1.3",
    "body": "1.6"
  },
  "space": {
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.5rem",
    "6": "2rem",
    "7": "3rem",
    "8": "4rem",
    "9": "6rem",
    "10": "8rem"
  },
  "radius": {
    "sm": "6px",
    "md": "12px",
    "lg": "20px",
    "pill": "999px"
  },
  "shadow": {
    "soft": "0 1px 2px rgb(30 26 43 / 0.06), 0 8px 24px rgb(30 26 43 / 0.06)",
    "lift": "0 2px 4px rgb(30 26 43 / 0.08), 0 16px 40px rgb(30 26 43 / 0.10)"
  },
  "motion": {
    "fast": "140ms",
    "base": "240ms",
    "slow": "480ms",
    "atem": "6400ms",
    "ease": "cubic-bezier(0.33, 0, 0.2, 1)",
    "ease-atem": "cubic-bezier(0.45, 0, 0.55, 1)"
  },
  "layout": {
    "content": "42rem",
    "wide": "72rem",
    "gutter": "clamp(1rem, 0.6rem + 2vw, 2rem)"
  }
} as const;

export type ColorName = keyof typeof tokens.color.light;
export type ColorScheme = keyof typeof tokens.color;

/** CSS-Variable für eine Farbe, z. B. cssVar('wine') → 'var(--color-wine)'. */
export function cssVar(name: ColorName): string {
  return `var(--color-${name})`;
}

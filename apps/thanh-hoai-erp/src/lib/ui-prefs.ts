/** UI preferences: density, brand letterhead, theme helpers */

export type Density = "comfortable" | "compact";

export type UiPrefs = {
  density: Density;
  /** role id → tour completed */
  tourDone: Record<string, boolean>;
  reducedMotion: boolean;
  /** In-app high contrast (runtime Batch 8 parity) */
  highContrast: boolean;
};

export const DEFAULT_UI_PREFS: UiPrefs = {
  density: "compact",
  tourDone: {},
  reducedMotion: false,
  highContrast: false,
};

/** Canonical brand — skill `thanh-hoai-erp-ui` / runtime web/app.css */
export const CANONICAL_BRAND = "#0B7285";

/** Parse #RRGGBB → soft / ink variants */
export function brandDerivatives(hex: string): {
  brand: string;
  soft: string;
  ink: string;
  onBrand: string;
} {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) {
    return {
      brand: CANONICAL_BRAND.toLowerCase(),
      soft: "#dff0f5",
      ink: "#075566",
      onBrand: "#ffffff",
    };
  }
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const soft = mixRgb(r, g, b, 255, 255, 255, 0.85);
  const ink = mixRgb(r, g, b, 0, 0, 0, 0.45);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    brand: `#${m[1].toLowerCase()}`,
    soft,
    ink,
    onBrand: lum > 0.55 ? "#0a1218" : "#ffffff",
  };
}

function mixRgb(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
  t: number,
): string {
  const r = Math.round(r1 * (1 - t) + r2 * t);
  const g = Math.round(g1 * (1 - t) + g2 * t);
  const b = Math.round(b1 * (1 - t) + b2 * t);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function applyBrandToDocument(brandHex?: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!brandHex) {
    root.style.removeProperty("--color-brand");
    root.style.removeProperty("--color-brand-soft");
    root.style.removeProperty("--color-brand-ink");
    root.style.removeProperty("--color-on-brand");
    return;
  }
  const d = brandDerivatives(brandHex);
  root.style.setProperty("--color-brand", d.brand);
  root.style.setProperty("--color-brand-soft", d.soft);
  root.style.setProperty("--color-brand-ink", d.ink);
  root.style.setProperty("--color-on-brand", d.onBrand);
}

export function applyDensityToDocument(density: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}

export function applyMotionPref(reduced: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.reducedMotion = reduced ? "1" : "0";
}

export function applyHighContrastToDocument(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.highContrast = enabled ? "true" : "false";
}

/**
 * Generates maximally-contrasting colors for map layers using
 * evenly-spaced hues in HSL space with perceptual adjustments.
 */

/** Returns true if the hex color is "light" (needs dark text for contrast). */
export function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = Number.parseInt(c.substring(0, 2), 16);
  const g = Number.parseInt(c.substring(2, 4), 16);
  const b = Number.parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l * 100];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;

  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Calculate perceptual color distance using weighted hue + lightness.
 * Returns 0-180 (max distance on hue circle).
 */
function colorDistance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const hueDiff = Math.abs(a[0] - b[0]);
  const hueDistance = Math.min(hueDiff, 360 - hueDiff);
  const lightDiff = Math.abs(a[2] - b[2]);
  const satDiff = Math.abs(a[1] - b[1]);
  // Weight hue most heavily, then lightness, then saturation
  return hueDistance * 0.7 + lightDiff * 0.2 + satDiff * 0.1;
}

/**
 * Country border + national colors reserved to avoid layer-color clashes.
 * These are always factored into color distance calculations.
 */
const RESERVED_BASE_COLORS = [
  "#2563eb", // DE country border blue
  "#dc2626", // AT country border red
  "#0d9488", // CH country border teal
];

/**
 * Generate the next high-contrast color given existing layer colors.
 * Uses a greedy approach: pick the hue that maximizes minimum distance
 * to all existing colors and reserved map border colors.
 */
export function generateNextColor(existingColors: string[]): string {
  // Always include reserved colors to avoid clashing with map borders
  const allColors = [...RESERVED_BASE_COLORS, ...existingColors];

  const existingHsl = allColors.map((c) => hexToHsl(c));

  // Sample candidate hues at fine granularity
  const CANDIDATES = 72; // Every 5 degrees
  let bestColor = "#3b82f6";
  let bestMinDist = -1;

  // Try multiple saturation/lightness combos — muted jewel tones: rich but not harsh
  const slCombos: [number, number][] = [
    [62, 58], // Core jewel
    [65, 60], // Slightly lighter
    [58, 57], // Deeper muted
    [67, 61], // Brighter jewel
    [60, 59], // Balanced
    [64, 62], // Light jewel
  ];

  for (const [s, l] of slCombos) {
    for (let i = 0; i < CANDIDATES; i++) {
      const h = (i * 360) / CANDIDATES;
      const candidate: [number, number, number] = [h, s, l];
      const minDist = Math.min(
        ...existingHsl.map((e) => colorDistance(candidate, e))
      );

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestColor = hslToHex(h, s, l);
      }
    }
  }

  return bestColor;
}

/**
 * Generate N maximally-spaced colors using golden angle distribution.
 * This produces a well-distributed palette for any count.
 */
export function generatePalette(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  const GOLDEN_ANGLE = 137.508; // degrees
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const hue = (i * GOLDEN_ANGLE) % 360;
    // Muted jewel tones: L=56-62%, S=58-66% — rich contrast without harshness
    const saturation = 58 + (i % 4) * 3; // 58, 61, 64, 67
    const lightness = 56 + (i % 3) * 3; // 56, 59, 62
    colors.push(hslToHex(hue, saturation, lightness));
  }

  return colors;
}

/**
 * Reassign colors to all layers for maximum mutual contrast.
 * Returns a Map of layerId → newColor.
 */
export function reassignAllColors(
  layers: { id: number; color: string }[],
  theme?: string
): Map<number, string> {
  const count = layers.length;
  const palette = theme
    ? generateThemePalette(theme, count)
    : generatePalette(count);
  const result = new Map<number, string>();

  for (let i = 0; i < count; i++) {
    result.set(layers[i].id, palette[i]);
  }

  return result;
}

/**
 * Named color themes for layer palettes.
 */
export const COLOR_THEMES: { id: string; label: string; sample: string[] }[] = [
  {
    id: "jewel",
    label: "Juwel",
    sample: ["#3b82f6", "#22c55e", "#f59e0b", "#e11d48", "#8b5cf6"],
  },
  {
    id: "pastel",
    label: "Pastell",
    sample: ["#93c5fd", "#86efac", "#fde68a", "#fca5a5", "#d8b4fe"],
  },
  {
    id: "vivid",
    label: "Kräftig",
    sample: ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed"],
  },
  {
    id: "earthy",
    label: "Erdtöne",
    sample: ["#78716c", "#a3785c", "#6b7c55", "#8b6f47", "#7a7a5c"],
  },
  {
    id: "ocean",
    label: "Ozean",
    sample: ["#0ea5e9", "#06b6d4", "#0891b2", "#0369a1", "#0284c7"],
  },
  {
    id: "autumn",
    label: "Herbst",
    sample: ["#ea580c", "#d97706", "#ca8a04", "#b45309", "#92400e"],
  },
];

function generateThemePalette(theme: string, count: number): string[] {
  const GOLDEN_ANGLE = 137.508;
  const themeParams: Record<
    string,
    { s: number; l: number; hueOffset: number }
  > = {
    jewel: { s: 62, l: 58, hueOffset: 0 },
    pastel: { s: 60, l: 78, hueOffset: 20 },
    vivid: { s: 80, l: 48, hueOffset: 0 },
    earthy: { s: 22, l: 52, hueOffset: 30 },
    ocean: { s: 75, l: 48, hueOffset: 190 },
    autumn: { s: 78, l: 50, hueOffset: 20 },
  };

  const params = themeParams[theme] ?? themeParams.jewel;
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const hue = (params.hueOffset + i * GOLDEN_ANGLE) % 360;
    const saturation = params.s + (i % 3) * 3;
    const lightness = params.l + (i % 2) * 4;
    colors.push(hslToHex(hue, saturation, lightness));
  }

  return colors;
}

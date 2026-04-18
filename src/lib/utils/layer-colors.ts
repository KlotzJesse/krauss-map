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

  // Try multiple saturation/lightness combos — muted satin tones: high contrast, elegant
  const slCombos: [number, number][] = [
    [50, 63], // Core satin
    [52, 65], // Slightly lighter
    [47, 61], // Deeper muted
    [54, 66], // Airy
    [49, 64], // Balanced
    [53, 67], // Pale satin
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
    // Muted satin tones: L=60-68%, S=48-56% — elegant contrast without harshness
    const saturation = 48 + (i % 4) * 2; // 48, 50, 52, 54
    const lightness = 60 + (i % 3) * 3; // 60, 63, 66
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
    sample: ["#c26b6b", "#6fc97d", "#ac80d4", "#d4c46d", "#7dc9d9"],
  },
  {
    id: "pastel",
    label: "Pastell",
    sample: ["#d4a0a0", "#9fd4a9", "#c9b0e0", "#e0d4a0", "#a9cfe0"],
  },
  {
    id: "vivid",
    label: "Kräftig",
    sample: ["#e63946", "#2a9d5c", "#e76f1b", "#7b2de8", "#1b9de7"],
  },
  {
    id: "earthy",
    label: "Erdtöne",
    sample: ["#8d7a6b", "#6b8d7a", "#7a6b8d", "#8d876b", "#6b7a8d"],
  },
  {
    id: "ocean",
    label: "Ozean",
    sample: ["#4ab5d9", "#3a9dc2", "#5bcce0", "#3a7ec2", "#50b0d4"],
  },
  {
    id: "autumn",
    label: "Herbst",
    sample: ["#d4743a", "#c2903a", "#d4b83a", "#c27a3a", "#d4963a"],
  },
];

function generateThemePalette(theme: string, count: number): string[] {
  const GOLDEN_ANGLE = 137.508;
  const themeParams: Record<
    string,
    { s: number; l: number; hueOffset: number }
  > = {
    jewel: { s: 50, l: 63, hueOffset: 0 },
    pastel: { s: 45, l: 78, hueOffset: 20 },
    vivid: { s: 78, l: 50, hueOffset: 0 },
    earthy: { s: 22, l: 54, hueOffset: 30 },
    ocean: { s: 72, l: 50, hueOffset: 190 },
    autumn: { s: 75, l: 52, hueOffset: 20 },
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

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
 * Generate the next high-contrast color given existing layer colors.
 * Uses a greedy approach: pick the hue that maximizes minimum distance
 * to all existing colors.
 */
export function generateNextColor(existingColors: string[]): string {
  if (existingColors.length === 0) {
    return "#3b82f6"; // Default blue
  }

  const existingHsl = existingColors.map((c) => hexToHsl(c));

  // Sample candidate hues at fine granularity
  const CANDIDATES = 72; // Every 5 degrees
  let bestColor = "#3b82f6";
  let bestMinDist = -1;

  // Try multiple saturation/lightness combos for variety
  const slCombos: [number, number][] = [
    [75, 50], // Vibrant mid
    [65, 42], // Slightly darker
    [80, 58], // Slightly lighter
    [55, 45], // Muted
    [70, 35], // Dark vibrant
    [85, 62], // Light vibrant
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
    // Alternate saturation and lightness for more variety
    const saturation = 65 + (i % 3) * 10; // 65, 75, 85
    const lightness = 45 + (i % 4) * 5; // 45, 50, 55, 60
    colors.push(hslToHex(hue, saturation, lightness));
  }

  return colors;
}

/**
 * Reassign colors to all layers for maximum mutual contrast.
 * Returns a Map of layerId → newColor.
 */
export function reassignAllColors(
  layers: { id: number; color: string }[]
): Map<number, string> {
  const count = layers.length;
  const palette = generatePalette(count);
  const result = new Map<number, string>();

  for (let i = 0; i < count; i++) {
    result.set(layers[i].id, palette[i]);
  }

  return result;
}

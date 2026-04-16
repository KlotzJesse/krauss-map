/**
 * Stripe pattern texture atlas for deck.gl FillStyleExtension.
 * Creates a canvas-based texture with diagonal stripe + crosshatch patterns.
 * Browser-only — guard all calls with typeof document !== 'undefined'.
 */

export interface PatternMapping {
  [key: string]: {
    x: number;
    y: number;
    width: number;
    height: number;
    mask: boolean;
  };
}

export interface StripePatternAtlas {
  canvas: HTMLCanvasElement;
  mapping: PatternMapping;
}

/** Size of each individual pattern tile in the atlas (pixels). */
const TILE = 64;
/** Width of each stripe in pixels. */
const STRIPE_WIDTH = 8;
/** Full period (stripe + gap) in pixels. */
const PERIOD = STRIPE_WIDTH * 2;

function drawDiagonalStripes(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  angle: "fwd" | "back"
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(offsetX, 0, TILE, TILE);
  ctx.clip();

  ctx.strokeStyle = "white";
  ctx.lineWidth = STRIPE_WIDTH;

  // Draw diagonal stripes across 3× tile width to cover all edges
  for (let i = -(TILE * 2); i < TILE * 3; i += PERIOD) {
    ctx.beginPath();
    if (angle === "fwd") {
      ctx.moveTo(offsetX + i, 0);
      ctx.lineTo(offsetX + i + TILE, TILE);
    } else {
      ctx.moveTo(offsetX + TILE - i, 0);
      ctx.lineTo(offsetX + -i, TILE);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Creates a WebGL-ready canvas texture atlas with:
 * - `stripe`: 45° diagonal stripes (for codes shared across different-color layers)
 * - `cross`: crosshatch (for codes shared across same/similar-color layers)
 */
export function createStripePatternAtlas(): StripePatternAtlas | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = TILE * 2;
  canvas.height = TILE;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Transparent base
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pattern 1 (x=0): forward diagonal stripes (45°)
  drawDiagonalStripes(ctx, 0, "fwd");

  // Pattern 2 (x=TILE): crosshatch (both diagonals)
  drawDiagonalStripes(ctx, TILE, "fwd");
  drawDiagonalStripes(ctx, TILE, "back");

  return {
    canvas,
    mapping: {
      stripe: { x: 0, y: 0, width: TILE, height: TILE, mask: true },
      cross: { x: TILE, y: 0, width: TILE, height: TILE, mask: true },
    },
  };
}

/**
 * Returns true when two hex colors are perceptually very similar
 * (Euclidean RGB distance < threshold).
 */
export function hexColorsAreSimilar(
  hex1: string,
  hex2: string,
  threshold = 50
): boolean {
  const parse = (h: string): [number, number, number] => {
    const clean = h.replace("#", "");
    const n = Number.parseInt(
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean,
      16
    );
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  return (
    Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < threshold
  );
}

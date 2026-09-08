/**
 * Diagonal stripe and crosshatch fill patterns, used for postal codes that
 * belong to more than one layer.
 *
 * Browser-only — guard all calls with typeof document !== "undefined".
 */

/** Size of each individual pattern tile in the atlas (pixels). */
const TILE = 128;
/** Width of each stripe in pixels. */
const STRIPE_WIDTH = 16;
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

/**
 * A single stripe or crosshatch tile in one colour, ready for
 * `map.addImage()`.
 *
 * MapLibre paints `fill-pattern` as-is and has nothing to tint it with, so the
 * colour is baked into the image and one is registered per colour — at most two
 * per visible layer, a handful in practice.
 */
export function createColoredPatternImage(
  shape: "stripe" | "cross",
  color: [number, number, number, number]
): ImageData | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.clearRect(0, 0, TILE, TILE);
  drawDiagonalStripes(ctx, 0, "fwd");
  if (shape === "cross") {
    drawDiagonalStripes(ctx, 0, "back");
  }

  // The strokes above are white; recolour them, keeping the coverage the
  // rasterizer produced so the diagonals stay antialiased.
  const image = ctx.getImageData(0, 0, TILE, TILE);
  const data = image.data;
  const alpha = color[3] / 255;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      continue;
    }
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = Math.round(data[i + 3] * alpha);
  }
  return image;
}

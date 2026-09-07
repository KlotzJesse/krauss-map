/**
 * Copy MapLibre's worker bundle into public/maplibre/.
 *
 * maplibre-gl v6 derives its worker URL from `import.meta.url`:
 *
 *   let e = import.meta.url;
 *   if (!/^https?:/.test(e)) return ``;
 *
 * Under Turbopack `import.meta.url` is not an http(s) URL, so that returns an
 * empty string and MapLibre does `new Worker("")`. An empty URL resolves to the
 * current document, so the browser fetches the page's own HTML as a module
 * script ("Failed to load module script: non-JavaScript MIME type text/html"),
 * the worker dies, and no vector tiles are ever decoded — the basemap stays
 * blank while deck.gl, which does not use that worker, keeps drawing.
 *
 * Shipping the worker ourselves and pointing `setWorkerUrl` at it fixes both.
 * The copy runs from the build script rather than being committed so the file
 * can never drift from the installed maplibre-gl version.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

// The worker imports "./maplibre-gl-shared.mjs" relatively, so both files have
// to land in the same directory.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(to, { recursive: true });
for (const file of files) {
  copyFileSync(join(from, file), join(to, file));
}

const version = (
  await import(join(root, "node_modules", "maplibre-gl", "package.json"), {
    with: { type: "json" },
  })
).default.version;

console.log(
  `copied maplibre-gl@${version} worker (${files.length} files) -> public/maplibre/`
);

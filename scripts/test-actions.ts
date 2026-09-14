export {};

/**
 * Exercises every mutating action on a test area and asserts three things about
 * each one:
 *
 *  - the view never remounts and the map never blanks;
 *  - the change is visible immediately, without a reload — a mutation the user
 *    cannot see happened is as bad as one that did not happen;
 *  - what the screen shows still matches the database afterwards.
 *
 * Reuses a long-lived Chrome (see scripts/lib/browser.ts) so runs are fast and
 * start warm.
 */

import { mkdirSync } from "node:fs";

import { Cdp, sleep } from "./lib/browser";

const AREA = process.env.TEST_AREA ?? "57";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = `${process.cwd()}\\.action-shots`;
const URL_TO_OPEN = `${BASE}/postal-codes/${AREA}`;

mkdirSync(SHOT_DIR, { recursive: true });

const cdp = await Cdp.attach(URL_TO_OPEN);

// One run at a time. Two runs share the long-lived browser and would drive the
// same tab, which produces failures that look like real bugs and are not.
const RUN_ID = `${process.pid}-${Date.now()}`;
const claimed = await cdp.evaluate<string>(`(() => {
  const held = window.__actionRun;
  if (held && Date.now() - held.at < 10 * 60 * 1000) return held.id;
  window.__actionRun = { id: ${JSON.stringify(RUN_ID)}, at: Date.now() };
  return ${JSON.stringify(RUN_ID)};
})()`);
if (claimed !== RUN_ID) {
  console.log(`another run (${claimed}) is already driving this tab — aborting`);
  // Leave the lock alone: it belongs to the other run.
  cdp.detach();
  process.exit(1);
}

const ready = await cdp.waitFor(
  "Boolean(document.querySelector('canvas') && document.querySelector('[aria-label=\"Kartentools-Panel\"]'))",
  120000
);
console.log("attached, map ready:", ready);
if (!ready) {
  console.log("map/panel never appeared — is the server running?");
  await cdp.evaluate("delete window.__actionRun");
  cdp.detach();
  process.exit(1);
}
await sleep(4000);

/** Instrumentation that survives a remount, installed once per page load. */
await cdp.evaluate(`(() => {
  if (window.__probe) { window.__probe.reset(); return 'already'; }

  const probe = {
    viewGeneration: 0,
    styleLoads: 0,
    samples: [],
    baselineColors: 0,
    reset() {
      this.samples = [];
      this.styleLoads = 0;
      this.baselineColors = this.colorCount();
      this.baselineView = this.stampView();
    },
    colorCount() {
      const c = document.querySelector('canvas');
      if (!c) return 0;
      try {
        const off = document.createElement('canvas');
        off.width = 80; off.height = 60;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(c, 0, 0, 80, 60);
        const d = ctx.getImageData(0, 0, 80, 60).data;
        const set = new Set();
        for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) + ',' + (d[i+1] >> 3) + ',' + (d[i+2] >> 3));
        return set.size;
      } catch (e) { return -1; }
    },
    viewRoot() {
      return document.querySelector('[data-layout="fullscreen"] > div');
    },
    stampView() {
      const el = this.viewRoot();
      if (!el) return null;
      if (!el.__stamp) {
        el.__stamp = 'v' + (++this.viewGeneration);
      }
      return el.__stamp;
    },
    snapshot() {
      return {
        canvas: Boolean(document.querySelector('canvas')),
        // A selector, not innerText: reading innerText forces a full-page
        // reflow, and at 8 samples a second that alone made the app crawl.
        panel: Boolean(document.querySelector('[aria-label="Kartentools-Panel"]')),
        view: this.stampView(),
        colors: this.colorCount(),
      };
    },
  };
  window.__probe = probe;


  const of = window.fetch;
  window.fetch = function (...a) {
    const u = String(typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || a[0]);
    if (u.indexOf('versatilescolorful.json') !== -1) probe.styleLoads++;
    return of.apply(this, a);
  };

  // Cheap checks often; the colour count is a WebGL readback that forces a
  // GPU sync, so it only runs once a second.
  let lastColors = -1;
  let sinceColor = 0;
  setInterval(() => {
    if (probe.samples.length > 4000) return;
    sinceColor += 200;
    if (sinceColor >= 1000) {
      sinceColor = 0;
      lastColors = probe.colorCount();
    }
    probe.samples.push({
      t: Math.round(performance.now()),
      canvas: Boolean(document.querySelector('canvas')),
      panel: Boolean(document.querySelector('[aria-label="Kartentools-Panel"]')),
      view: probe.stampView(),
      colors: lastColors,
    });
  }, 200);

  probe.reset();
  return 'installed';
})()`);

interface ActionResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: ActionResult[] = [];

/** Run one action and watch for a blank or a map rebuild while it settles. */
interface LayerRow {
  id: number;
  name: string;
  color: string;
  opacity: number;
  active: boolean;
  visible: boolean;
  codes: number;
}

/** Returns a complaint, or null when the UI reflected the action. */
type Expectation = (
  before: LayerRow[],
  after: LayerRow[],
  outcome: Record<string, unknown>
) => string | null;

/**
 * The panel's own view of the layers, read from data- attributes.
 *
 * Deliberately self-contained rather than calling an injected helper: it has to
 * keep working after a reload, which wipes anything the probe put on `window`.
 */
const READ_LAYERS = `[...document.querySelectorAll('[data-layer-row]')].map((r) => ({
  id: Number(r.getAttribute('data-layer-row')),
  name: r.getAttribute('data-layer-name') || '',
  color: r.getAttribute('data-layer-color') || '',
  opacity: Number(r.getAttribute('data-layer-opacity')),
  active: r.getAttribute('data-layer-active') === 'true',
  visible: r.getAttribute('data-layer-visible') === 'true',
  codes: Number(r.getAttribute('data-layer-codes')),
}))`;
const readLayers = () => cdp.evaluate<LayerRow[]>(READ_LAYERS);

async function runAction(
  name: string,
  script: string,
  expect?: Expectation,
  settleMs = 3000
): Promise<void> {
  process.stdout.write(`  running ${name} ... `);
  const tStart = Date.now();
  const mark = (label: string) =>
    process.stdout.write(`${label}=${Date.now() - tStart}ms `);
  await cdp.evaluate("window.__probe.reset(); window.__t = performance.now();");
  const baseline = await cdp.evaluate<number>("window.__probe.baselineColors");
  const layersBefore = await readLayers();

  let outcome: Record<string, unknown>;
  try {
    outcome = (await Promise.race([
      cdp.evaluate<Record<string, unknown>>(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        ${script}
      })()`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("action timed out")), 25000)
      ),
    ])) as Record<string, unknown>;
  } catch (error) {
    results.push({ name, ok: false, detail: `threw: ${String(error).slice(0, 120)}` });
    return;
  }

  mark("act");
  await sleep(settleMs);
  mark("settle");

  const verdict = await cdp.evaluate<Record<string, unknown>>(`(() => {
    const p = window.__probe;
    const base = ${baseline};
    const since = p.samples.filter((s) => s.t >= window.__t);
    const blankCanvas = since.filter((s) => !s.canvas).length;
    const blankPanel = since.filter((s) => !s.panel).length;
    // A collapse in distinct colours means the postal layers stopped drawing.
    const blankMap = since.filter((s) => s.colors >= 0 && base > 40 && s.colors < base * 0.5).length;
    const last = since[since.length - 1] || p.snapshot();
    // The view root carries a stamp; a different one means React threw the
    // component away and built a new one.
    const views = [...new Set(since.map((s) => s.view).filter(Boolean))];
    const remounted = views.length > 1 || (views.length === 1 && views[0] !== p.baselineView);
    return {
      samples: since.length,
      remounted, views,
      blankCanvas, blankPanel, blankMap,
      styleLoads: p.styleLoads,
      endColors: last.colors,
      baseline: base,
      endPanel: last.panel,
    };
  })()`);

  // The two concerns are separate: whether the UI held still, and whether the
  // harness managed to drive the action at all.
  const stable =
    verdict.remounted !== true &&
    Number(verdict.blankCanvas) === 0 &&
    Number(verdict.blankPanel) === 0 &&
    Number(verdict.blankMap) === 0 &&
    Number(verdict.styleLoads) === 0;
  const driven = (outcome as { ok?: boolean }).ok !== false;

  const layersAfter = await readLayers();
  const complaint = expect ? expect(layersBefore, layersAfter, outcome) : null;

  results.push({
    name,
    ok: stable && driven && complaint === null,
    detail:
      `${stable ? "stable" : "UNSTABLE"} ${driven ? "driven" : "NOT-DRIVEN"} ` +
      `${complaint === null ? "updated" : "STALE-UI"} ` +
      `remount=${verdict.remounted} canvasGone=${verdict.blankCanvas} panelGone=${verdict.blankPanel} ` +
      `mapBlank=${verdict.blankMap} styleReloads=${verdict.styleLoads} ` +
      `layers ${layersBefore.length}->${layersAfter.length} ` +
      (complaint === null ? "" : `— ${complaint} `) +
      `${JSON.stringify(outcome).slice(0, 90)}`,
  });

  mark("verdict");
  console.log(results[results.length - 1].ok ? "PASS" : "FAIL");
  await cdp.screenshot(`${SHOT_DIR}\\${name.replace(/[^a-z0-9]+/gi, "-")}.jpg`);
}

const byLabel = (t: string) =>
  `[...document.querySelectorAll('button')].find((b) => ((b.getAttribute('aria-label')||b.title||'')).indexOf(${JSON.stringify(t)}) === 0)`;

const dismissDialogs = `
  for (let i = 0; i < 3 && document.querySelector('[role="dialog"],[role="alertdialog"]'); i++) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(400);
  }
`;

const openPalette = `
  // Ctrl+K toggles, so close anything open first or we shut it again.
  if (document.querySelector('[role="dialog"]')) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(600);
  }
  for (let attempt = 0; attempt < 3 && !document.querySelector('[cmdk-input]'); attempt++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await sleep(700);
  }
`;
const paletteRun = (label: string) => `
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => e.textContent.indexOf(${JSON.stringify(label)}) !== -1);
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'command not found: ' + ${JSON.stringify(label)} }; }
  item.click();
  await sleep(1500);
  return { ok: true };
`;

// ---- the actions ----
//
// Each action carries an expectation about the panel afterwards. The point is
// not that the server accepted the call — it is that the person looking at the
// screen can see the result without reloading.

let createdLayerId = 0;

const activeOf = (rows: LayerRow[]) => rows.find((r) => r.active);
/** +1 or -1: what the change just before undo/redo did to the code count. */
let undoDirection = 1;
const byId = (rows: LayerRow[], id: number) => rows.find((r) => r.id === id);

await runAction(
  "create-layer",
  `
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
  await sleep(900);
  const input = document.activeElement && document.activeElement.tagName === 'INPUT'
    ? document.activeElement
    : [...document.querySelectorAll('input')].find((i) => /Neues Gebiet/i.test(i.placeholder || ''));
  if (!input) return { ok: false, reason: 'no new-layer input' };
  const name = 'ACT ' + Date.now().toString().slice(-5);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, name);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(250);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const form = input.closest('form');
  if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return { ok: true, name };
`,
  (before, after, outcome) => {
    if (after.length !== before.length + 1) {
      return `expected ${before.length + 1} layers, panel shows ${after.length}`;
    }
    const fresh = after.find((r) => !before.some((b) => b.id === r.id));
    if (!fresh) return "no new layer row appeared";
    // A timestamp-shaped id means the client invented one instead of using the
    // row the server created, so every later action on it would miss.
    if (fresh.id > 1e11) return `new layer has a fabricated id (${fresh.id})`;
    if (fresh.name !== outcome.name) {
      return `new layer is named "${fresh.name}", expected "${String(outcome.name)}"`;
    }
    createdLayerId = fresh.id;
    return null;
  }
);

await runAction(
  "rename-active-layer",
  `
  const active = document.querySelector('[data-layer-active="true"]');
  if (!active) return { ok: false, reason: 'no active layer row' };
  const span = [...active.querySelectorAll('span')].find((e) => /Doppelklick/.test(e.getAttribute('title') || ''));
  if (!span) return { ok: false, reason: 'no name element' };
  span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await sleep(600);
  const input = active.querySelector('input') || (document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement : null);
  if (!input) return { ok: false, reason: 'rename input never opened' };
  const name = 'REN ' + Date.now().toString().slice(-5);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, name);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(200);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const form = input.closest('form');
  if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return { ok: true, name };
`,
  (_before, after, outcome) => {
    const row = byId(after, createdLayerId);
    if (!row) return `layer ${createdLayerId} is gone from the panel`;
    if (row.name !== outcome.name) {
      return `panel still shows "${row.name}", expected "${String(outcome.name)}"`;
    }
    return null;
  }
);

await runAction(
  "toggle-postal-code",
  `
  ${openPalette}
  const dlg = document.querySelector('[role="dialog"]');
  const input = dlg && dlg.querySelector('[cmdk-input]');
  if (!input) return { ok: false, reason: 'no palette input' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '86899');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1200);
  const item = [...document.querySelectorAll('[cmdk-item]')]
    .find((e) => /hinzuf|entfernen/i.test(e.textContent));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'no add/remove command' }; }
  const was = /entfernen/i.test(item.textContent) ? 'remove' : 'add';
  item.click();
  await sleep(2000);
  return { ok: true, did: was };
`,
  (before, after, outcome) => {
    // The command acts on whichever layer holds the code, which is not always
    // the active one, so this counts across the whole area.
    const total = (rows: LayerRow[]) =>
      rows.reduce((sum, r) => sum + r.codes, 0);
    const delta = total(after) - total(before);
    const want = outcome.did === "add" ? 1 : -1;
    if (delta !== want) {
      return `area code count moved by ${delta} on a "${String(outcome.did)}"`;
    }
    return null;
  }
);

const toggleFirstLayerVisibility = `
  ${openPalette}
  // "ein-/ausblenden" also matches "Nicht zugeordnete PLZ ein-/ausblenden",
  // which toggles an overlay rather than a layer. Match on the command value.
  const item = [...document.querySelectorAll('[cmdk-item]')]
    .find((e) => (e.getAttribute('data-value') || '').indexOf('ebene sichtbarkeit') === 0);
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'no layer visibility command' }; }
  const label = (item.textContent || '').trim().slice(0, 40);
  item.click();
  await sleep(2000);
  return { ok: true, label };
`;

await runAction(
  "toggle-layer-visibility",
  toggleFirstLayerVisibility,
  (before, after) => {
    // The palette offers one visibility command per layer and the suite clicks
    // the first, which is not necessarily the active layer — so assert that
    // exactly one row flipped rather than guessing which.
    const changed = after.filter((a) => {
      const b = before.find((x) => x.id === a.id);
      return b && b.visible !== a.visible;
    });
    if (changed.length !== 1) {
      return `${changed.length} rows changed visibility, expected exactly 1`;
    }
    return null;
  }
);

// Put it back, so the rest of the run sees an ordinary layer.
await runAction(
  "restore-layer-visibility",
  toggleFirstLayerVisibility,
  (before, after) => {
    // The palette offers one visibility command per layer and the suite clicks
    // the first, which is not necessarily the active layer — so assert that
    // exactly one row flipped rather than guessing which.
    const changed = after.filter((a) => {
      const b = before.find((x) => x.id === a.id);
      return b && b.visible !== a.visible;
    });
    if (changed.length !== 1) {
      return `${changed.length} rows changed visibility, expected exactly 1`;
    }
    return null;
  }
);

await runAction(
  "change-layer-opacity",
  `
  ${dismissDialogs}
  const active = document.querySelector('[data-layer-active="true"]');
  if (!active) return { ok: false, reason: 'no active layer row' };
  // Opacity lives in the colour popover, behind the colour dot.
  const dot = active.querySelector('button[title="Farbe ändern"]');
  if (!dot) return { ok: false, reason: 'no colour dot' };
  dot.click();
  await sleep(900);
  // The base-ui slider keeps its value on a hidden range input; the only
  // element with role="slider" here is the colour picker's hue control.
  const thumb = document.querySelector('[data-slot="slider-thumb"]');
  const input = thumb && thumb.querySelector('input[type="range"]');
  if (!input) return { ok: false, reason: 'no opacity slider in the popover' };
  const sliderBefore = input.value;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const target = String(Math.max(10, Number(sliderBefore) - 20));
  setter.call(input, target);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(2000);
  const sliderAfter = input.value;
  ${dismissDialogs}
  await sleep(800);
  if (sliderBefore === sliderAfter) return { ok: false, reason: 'slider did not move (' + sliderBefore + ')' };
  return { ok: true, sliderBefore, sliderAfter };
`,
  (before, after) => {
    const b = activeOf(before);
    const a = b ? byId(after, b.id) : undefined;
    if (!(a && b)) return "no active layer to compare";
    return a.opacity === b.opacity ? `opacity is still ${a.opacity}` : null;
  }
);

await runAction(
  "change-layer-color",
  `
  ${dismissDialogs}
  const active = document.querySelector('[data-layer-active="true"]');
  if (!active) return { ok: false, reason: 'no active layer row' };
  const was = active.getAttribute('data-layer-color');
  const dot = active.querySelector('button[title="Farbe ändern"]');
  if (!dot) return { ok: false, reason: 'no colour dot' };
  dot.click();
  await sleep(900);
  // Palette swatches carry the hex as their title.
  const swatch = [...document.querySelectorAll('button[title]')]
    .filter((b) => /^#[0-9a-f]{6}/i.test(b.getAttribute('title') || ''))
    .find((b) => (b.getAttribute('title') || '').slice(0, 7).toLowerCase() !== (was || '').toLowerCase());
  if (!swatch) { ${dismissDialogs} return { ok: false, reason: 'no other colour to pick' }; }
  const picked = swatch.getAttribute('title').slice(0, 7);
  swatch.click();
  await sleep(1800);
  ${dismissDialogs}
  return { ok: true, picked, was };
`,
  (before, after, outcome) => {
    const b = activeOf(before);
    const a = b ? byId(after, b.id) : undefined;
    if (!(a && b)) return "no active layer to compare";
    if (a.color.toLowerCase() !== String(outcome.picked).toLowerCase()) {
      return `colour is ${a.color}, expected ${String(outcome.picked)}`;
    }
    return null;
  }
);

await runAction(
  "duplicate-active-layer",
  paletteRun("Aktive Ebene duplizieren"),
  (before, after) =>
    after.length === before.length + 1
      ? null
      : `expected ${before.length + 1} layers, panel shows ${after.length}`
);

await runAction(
  "delete-duplicate",
  `
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Aktive Ebene l(ö|o)schen/i.test(e.textContent));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'command missing' }; }
  item.click();
  await sleep(1500);
  // The confirmation is an AlertDialog, so role="dialog" alone does not find it.
  const sheet = [...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].pop();
  const confirm = sheet && [...sheet.querySelectorAll('button')]
    .find((b) => /l(ö|o)schen|entfernen|best(ä|a)tigen/i.test(b.textContent || '') && !/abbrechen/i.test(b.textContent || ''));
  if (!confirm) { ${dismissDialogs} return { ok: false, reason: 'delete confirmation never appeared' }; }
  confirm.click();
  await sleep(2000);
  return { ok: true };
`,
  (before, after) =>
    after.length === before.length - 1
      ? null
      : `expected ${before.length - 1} layers, panel shows ${after.length}`
);

await runAction(
  "radius-search",
  `
  ${openPalette}
  // The bare "Umkreissuche…" entry has no point to search around and only
  // shows a hint; the one that opens the dialog comes from a typed code.
  const dlg = document.querySelector('[role="dialog"]');
  const input = dlg && dlg.querySelector('[cmdk-input]');
  if (!input) return { ok: false, reason: 'no palette input' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '86899');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1400);
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Umkreis um PLZ/i.test(e.textContent || ''));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'no "Umkreis um PLZ" command' }; }
  item.click();
  let sheet = null;
  for (let i = 0; i < 30 && !sheet; i++) {
    await sleep(400);
    sheet = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Umkreis|Radius|Fahrzeit/i.test(d.textContent || ''));
  }
  if (!sheet) return { ok: false, reason: 'radius dialog never opened' };
  // The confirm button names the chosen radius, e.g. "5km Fahrstrecke auswählen".
  const submit = [...sheet.querySelectorAll('button')].find((b) => /ausw(ä|a)hlen|suchen|hinzuf|anwenden/i.test(b.textContent || '') && !b.disabled);
  if (!submit) { ${dismissDialogs} return { ok: false, reason: 'no enabled submit button' }; }
  submit.click();
  await sleep(5000);
  ${dismissDialogs}
  return { ok: true };
`,
  (before, after) => {
    const total = (rows: LayerRow[]) => rows.reduce((sum, r) => sum + r.codes, 0);
    return total(after) > total(before)
      ? null
      : `area code count did not grow (${total(before)}->${total(after)})`;
  },
  9000
);

if (process.env.HEAVY === "1") {
  // Writes every unassigned code in the country, thousands of rows per run.
  await runAction(
    "select-all-unassigned",
    `
    ${openPalette}
    const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /nicht zugeordneten PLZ hinzuf/i.test(e.textContent));
    if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'command missing' }; }
    item.click();
    await sleep(2500);
    return { ok: true };
  `,
    (before, after) => {
      const b = activeOf(before);
      const a = b ? byId(after, b.id) : undefined;
      if (!(a && b)) return "no active layer to compare";
      return a.codes > b.codes
        ? null
        : `code count did not grow (${b.codes}->${a.codes})`;
    },
    9000
  );
}

// Undo and redo only mean something against a change that just happened, so
// make one here rather than depending on whatever ran last.
await runAction(
  "postal-code-change-for-undo",
  `
  ${openPalette}
  const dlg = document.querySelector('[role="dialog"]');
  const input = dlg && dlg.querySelector('[cmdk-input]');
  if (!input) return { ok: false, reason: 'no palette input' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '86899');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1400);
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /hinzuf|entfernen/i.test(e.textContent));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'no add/remove command' }; }
  const did = /entfernen/i.test(item.textContent) ? 'remove' : 'add';
  item.click();
  await sleep(2400);
  return { ok: true, did };
`,
  (before, after, outcome) => {
    const total = (rows: LayerRow[]) => rows.reduce((sum, r) => sum + r.codes, 0);
    const delta = total(after) - total(before);
    // Adding puts the code in exactly one layer. Removing takes it out of every
    // layer that held it, which can be more than one, so only the sign is fixed.
    if (outcome.did === "add") {
      undoDirection = 1;
      return delta === 1 ? null : `area code count moved by ${delta}, expected 1`;
    }
    undoDirection = -1;
    return delta < 0
      ? null
      : `area code count moved by ${delta}, expected it to drop`;
  }
);

await runAction(
  "undo",
  `
  ${dismissDialogs}
  const b = [...document.querySelectorAll('button')].find((x) => /^R(ü|u)ckg(ä|a)ngig/.test((x.getAttribute('aria-label')||x.title||'')));
  if (!b) return { ok: false, reason: 'no undo button' };
  if (b.disabled) return { ok: false, reason: 'undo is disabled' };
  b.click();
  await sleep(2500);
  return { ok: true };
`,
  (before, after) => {
    const total = (rows: LayerRow[]) => rows.reduce((sum, r) => sum + r.codes, 0);
    const delta = total(after) - total(before);
    // One undo pops one recorded change, and a removal that spanned several
    // layers recorded one per layer — so only the direction is predictable.
    return Math.sign(delta) === -undoDirection
      ? null
      : `area code count moved by ${delta}, expected it to go ${undoDirection > 0 ? "down" : "up"}`;
  },
  8000
);

await runAction(
  "redo",
  `
  ${dismissDialogs}
  const b = [...document.querySelectorAll('button')].find((x) => /^Wiederholen/.test((x.getAttribute('aria-label')||x.title||'')));
  if (!b) return { ok: false, reason: 'no redo button' };
  if (b.disabled) return { ok: false, reason: 'redo is disabled' };
  b.click();
  await sleep(2500);
  return { ok: true };
`,
  (before, after) => {
    const total = (rows: LayerRow[]) => rows.reduce((sum, r) => sum + r.codes, 0);
    const delta = total(after) - total(before);
    return Math.sign(delta) === undoDirection
      ? null
      : `area code count moved by ${delta}, expected it to go ${undoDirection > 0 ? "up" : "down"}`;
  },
  8000
);

await runAction("create-version", paletteRun("Version erstellen"));

await runAction(
  "delete-active-layer",
  `
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Aktive Ebene l(ö|o)schen/i.test(e.textContent));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'command missing' }; }
  item.click();
  await sleep(1500);
  // The confirmation is an AlertDialog, so role="dialog" alone does not find it.
  const sheet = [...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].pop();
  const confirm = sheet && [...sheet.querySelectorAll('button')]
    .find((b) => /l(ö|o)schen|entfernen|best(ä|a)tigen/i.test(b.textContent || '') && !/abbrechen/i.test(b.textContent || ''));
  if (!confirm) { ${dismissDialogs} return { ok: false, reason: 'delete confirmation never appeared' }; }
  confirm.click();
  await sleep(2000);
  return { ok: true };
`,
  (before, after) => {
    if (after.length !== before.length - 1) {
      const gone = before.filter((b) => !after.some((a) => a.id === b.id));
      return `expected ${before.length - 1} layers, panel shows ${after.length} (removed: ${gone.map((g) => g.id).join(",") || "none"})`;
    }
    return null;
  }
);

// ---- leave the test area as we found it ----
//
// Without this the area grows by a few layers every run, and after a dozen runs
// the fixture no longer resembles anything a person would have.
const TEST_NAME = /^(ACT|REN|PROBE|Kopie von (ACT|REN))/;
let removed = 0;
for (let pass = 0; pass < 15; pass++) {
  const rows = await readLayers();
  const junk = rows.find((r) => TEST_NAME.test(r.name));
  if (!junk) break;
  const done = await cdp.evaluate<boolean>(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ${dismissDialogs}
    const row = document.querySelector('[data-layer-row="${junk.id}"]');
    if (!row) return false;
    const hit = row.querySelector('[role="button"]');
    (hit || row).click();
    await sleep(700);
    ${openPalette}
    const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Aktive Ebene l(ö|o)schen/i.test(e.textContent));
    if (!item) return false;
    item.click();
    await sleep(1400);
    const sheet = [...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].pop();
    const confirm = sheet && [...sheet.querySelectorAll('button')]
      .find((b) => /l(ö|o)schen|entfernen|best(ä|a)tigen/i.test(b.textContent || '') && !/abbrechen/i.test(b.textContent || ''));
    if (!confirm) return false;
    confirm.click();
    await sleep(1800);
    return true;
  })()`);
  if (!done) break;
  removed++;
}
console.log(`  cleanup ... removed ${removed} test layer(s)`);

// ---- does the screen still agree with the database? ----
//
// Everything above reads client state. This reloads and compares, which is the
// only way to catch a UI that updated itself into a lie.
const fingerprint = (rows: LayerRow[]) =>
  rows
    .map((r) => `${r.id}:${r.name}:${r.color}:${r.visible}:${r.codes}`)
    .sort()
    .join("|");

try {
  const beforeReload = await readLayers();
  await cdp.send("Page.reload", {});
  await cdp.waitFor(
    "document.querySelectorAll('[data-layer-row]').length > 0",
    180000
  );
  await sleep(2500);
  const afterReload = await readLayers();
  const consistent = fingerprint(beforeReload) === fingerprint(afterReload);
  results.push({
    name: "ui-matches-server",
    ok: consistent,
    detail: consistent
      ? `stable driven updated — ${afterReload.length} layers identical after reload`
      : `STALE-UI — screen had ${beforeReload.length} layers, server has ${afterReload.length}` +
        `
      screen: ${fingerprint(beforeReload).slice(0, 220)}` +
        `
      server: ${fingerprint(afterReload).slice(0, 220)}`,
  });
  console.log(`  ui-matches-server ... ${consistent ? "PASS" : "FAIL"}`);
} catch (error) {
  results.push({
    name: "ui-matches-server",
    ok: false,
    detail: `check threw: ${String(error).slice(0, 160)}`,
  });
  console.log("  ui-matches-server ... FAIL");
}

// ---- report ----
console.log("\\n=== action results ===");
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(24)} ${r.detail}`);
}
console.log(`\\n${results.length - failed}/${results.length} passed`);

const errors = Cdp.consoleEvents.slice(-8).map((e) => e.text);
if (errors.length > 0) {
  console.log("\\nconsole:");
  for (const e of errors) console.log("  " + e);
}

await cdp.evaluate("delete window.__actionRun");
cdp.detach();

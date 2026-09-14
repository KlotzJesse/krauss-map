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
const PROBE_SCRIPT = `(() => {
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
})()`;
await cdp.evaluate(PROBE_SCRIPT);

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
  // A reload or navigation earlier in the run wipes the probe; put it back.
  if (!(await cdp.evaluate<boolean>("Boolean(window.__probe)"))) {
    await cdp.evaluate(PROBE_SCRIPT);
  }
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
    console.log(`FAIL
      threw: ${String(error).slice(0, 120)}`);
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
  const last = results[results.length - 1];
  console.log(last.ok ? "PASS" : `FAIL
      ${last.detail}`);
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

/** Delete every test-named layer. Runs before the actions and after them. */
async function cleanupTestLayers(): Promise<number> {
  // "Gebiet N" is what adding a code to a layerless area creates.
const TEST_NAME = /^(ACT|REN|PROBE|Kopie von (ACT|REN))|^Gebiet \d+$/;
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
  return removed;
}

console.log(`  pre-clean ... removed ${await cleanupTestLayers()} leftover test layer(s)`);

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

// ---- actions that rewrite layers on the server ----
//
// Split, merge, conflict resolution, import and version restore all change the
// layer set in ways the client cannot predict, so each one has to re-read it.
// These are the paths that quietly relied on a route refresh before.

const TEST_LAYER = /^(ACT|REN|PROBE)/;
const totalCodes = (rows: LayerRow[]) =>
  rows.reduce((sum, r) => sum + r.codes, 0);
const fixtureCodes = (rows: LayerRow[]) =>
  rows
    .filter((r) => !TEST_LAYER.test(r.name))
    .map((r) => `${r.id}:${r.codes}`)
    .join("|");

/** Make a test layer the active one, so nothing below touches fixture layers. */
const activateTestLayer = `
  ${dismissDialogs}
  {
    // The test layer holding the most codes — split needs at least four, and a
    // leftover empty copy must not be picked just because it is active.
    const best = [...document.querySelectorAll('[data-layer-row]')]
      .filter((r) => /^(ACT|REN|PROBE)/.test(r.getAttribute('data-layer-name') || ''))
      .sort((a, b) => Number(b.getAttribute('data-layer-codes')) - Number(a.getAttribute('data-layer-codes')))[0];
    if (best && best.getAttribute('data-layer-active') !== 'true') {
      (best.querySelector('[role="button"]') || best).click();
      await sleep(900);
    }
  }
`;

/** Open a layer row's "…" menu and click an entry by its text. */
const layerMenu = (rowExpression: string, entry: string) => `
  const row = ${rowExpression};
  if (!row) return { ok: false, reason: 'layer row not found' };
  row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(300);
  const trigger = row.querySelector('button[aria-label^="Aktionen für"]');
  if (!trigger) return { ok: false, reason: 'no layer menu button' };
  trigger.click();
  await sleep(700);
  const item = [...document.querySelectorAll('[role="menuitem"]')]
    .find((e) => (e.textContent || '').trim().indexOf(${JSON.stringify(entry)}) === 0);
  if (!item) { ${dismissDialogs} return { ok: false, reason: 'menu entry missing: ' + ${JSON.stringify(entry)} }; }
`;

await runAction(
  "paste-import",
  `
  ${activateTestLayer}
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /PLZ importieren/.test(e.textContent || ''));
  if (!item) { ${dismissDialogs} return { ok: false, reason: 'no import command' }; }
  item.click();
  let dlg = null;
  for (let i = 0; i < 25 && !dlg; i++) {
    await sleep(300);
    dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('textarea'));
  }
  if (!dlg) return { ok: false, reason: 'import dialog never opened' };
  const area = dlg.querySelector('textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  // Berlin codes: nowhere near the Bavarian codes the rest of the run uses,
  // and enough of them that the split below has something to divide.
  setter.call(area, '10115, 10117, 10119, 10178, 10179');
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1500);
  const go = [...dlg.querySelectorAll('button')].find((b) => /PLZ importieren$/.test((b.textContent || '').trim()) && !b.disabled);
  if (!go) { ${dismissDialogs} return { ok: false, reason: 'import button disabled — code not recognised?' }; }
  go.click();
  await sleep(3000);
  ${dismissDialogs}
  return { ok: true };
`,
  (before, after) => {
    const b = activeOf(before);
    const a = b ? byId(after, b.id) : undefined;
    if (!(a && b)) return "no active layer to compare";
    return a.codes === b.codes + 5
      ? null
      : `active layer went ${b.codes}->${a.codes}, expected +5`;
  }
);

await runAction(
  "split-active-layer",
  `
  ${activateTestLayer}
  const active = document.querySelector('[data-layer-active="true"]');
  if (!active) return { ok: false, reason: 'no active layer' };
  if (Number(active.getAttribute('data-layer-codes')) < 4) return { ok: false, reason: 'active layer has fewer than 4 codes' };
  ${layerMenu(`document.querySelector('[data-layer-active="true"]')`, "Aufteilen")}
  item.click();
  item.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(700);
  const two = [...document.querySelectorAll('[role="menuitem"]')].find((e) => /^2×/.test((e.textContent || '').trim()));
  if (!two) { ${dismissDialogs} return { ok: false, reason: 'no "2×" split option' }; }
  two.click();
  await sleep(4000);
  return { ok: true };
`,
  (before, after) => {
    if (after.length !== before.length + 1) {
      return `expected ${before.length + 1} layers, panel shows ${after.length}`;
    }
    if (totalCodes(after) !== totalCodes(before)) {
      return `splitting changed the area's code count (${totalCodes(before)}->${totalCodes(after)})`;
    }
    return null;
  },
  6000
);

await runAction(
  "merge-layer-back",
  `
  ${dismissDialogs}
  const active = document.querySelector('[data-layer-active="true"]');
  if (!active) return { ok: false, reason: 'no active layer' };
  const target = active.getAttribute('data-layer-name');
  // The split produced "<name> 2"; merge it back into the layer it came from.
  const source = [...document.querySelectorAll('[data-layer-row]')]
    .find((r) => r.getAttribute('data-layer-name') === target + ' 2');
  if (!source) return { ok: false, reason: 'no split-off layer named "' + target + ' 2"' };
  ${layerMenu("source", "Zusammenführen")}
  item.click();
  let dlg = null;
  for (let i = 0; i < 20 && !dlg; i++) {
    await sleep(300);
    dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => /zusammenführen/i.test(d.textContent || ''));
  }
  if (!dlg) return { ok: false, reason: 'merge dialog never opened' };
  const selectTrigger = dlg.querySelector('#merge-target');
  if (!selectTrigger) return { ok: false, reason: 'no target select' };
  selectTrigger.click();
  await sleep(700);
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent || '').trim() === target);
  if (!option) { ${dismissDialogs} return { ok: false, reason: 'target option missing' }; }
  option.click();
  await sleep(500);
  const go = [...dlg.querySelectorAll('button')].find((b) => /^Zusammenführen$/.test((b.textContent || '').trim()) && !b.disabled);
  if (!go) { ${dismissDialogs} return { ok: false, reason: 'merge button disabled' }; }
  go.click();
  await sleep(4000);
  return { ok: true };
`,
  (before, after) => {
    if (after.length !== before.length - 1) {
      return `expected ${before.length - 1} layers, panel shows ${after.length}`;
    }
    if (totalCodes(after) !== totalCodes(before)) {
      return `merging changed the area's code count (${totalCodes(before)}->${totalCodes(after)})`;
    }
    return null;
  },
  6000
);

// Duplicating a layer makes every one of its codes a conflict; resolving in
// favour of the active layer should empty the copy, on screen, immediately.
await runAction(
  "duplicate-for-conflict",
  `${activateTestLayer}${paletteRun("Aktive Ebene duplizieren")}`,
  (before, after) =>
    after.length === before.length + 1
      ? null
      : `expected ${before.length + 1} layers, panel shows ${after.length}`
);


// A code held by two layers is drawn as stripes. The stripe layers are
// constant-pattern MapLibre layers filtered by key, so assert one exists and
// actually lists keys. The map instance is not exposed, so find it through the
// React fibers above the map container.
await runAction(
  "stripes-for-shared-codes",
  `
  const isMap = (v) => v && typeof v === 'object' && typeof v.getStyle === 'function' && typeof v.queryRenderedFeatures === 'function';
  const unwrap = (v) => {
    if (!v || typeof v !== 'object') return null;
    if (isMap(v)) return v;
    if (typeof v.getMap === 'function') { try { const m = v.getMap(); if (isMap(m)) return m; } catch (e) {} }
    if (v.current) return unwrap(v.current);
    if (v.map) return unwrap(v.map);
    return null;
  };
  let map = null;
  const start = document.querySelector('.maplibregl-map') || document.querySelector('canvas');
  for (let el = start; el && !map; el = el.parentElement) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    for (let f = key ? el[key] : null, i = 0; f && i < 120 && !map; f = f.return, i++) {
      // Walk the whole hook list, not a fixed depth: the map sits in a useState
      // or useRef somewhere along it, or in a context value's props.
      for (let h = f.memoizedState, n = 0; h && n < 80 && !map; h = h.next, n++) {
        map = unwrap(h.memoizedState) || unwrap(h.memoizedState && h.memoizedState.current);
      }
      map = map || unwrap(f.memoizedProps && f.memoizedProps.value) || unwrap(f.stateNode);
    }
    if (map) break;
  }
  if (!map) return { ok: false, reason: 'could not reach the MapLibre instance' };
  await sleep(1500);
  const stripes = map.getStyle().layers
    .filter((l) => l.id.indexOf('pc-stripe:') === 0)
    .map((l) => ({ id: l.id, keys: Array.isArray(l.filter) && Array.isArray(l.filter[2]) ? (l.filter[2][1] || []).length : -1 }));
  return { ok: true, stripes };
`,
  (_before, _after, outcome) => {
    const stripes = (outcome.stripes ?? []) as { id: string; keys: number }[];
    if (stripes.length === 0) return "no pc-stripe: layer although every code of the copy is shared";
    if (!stripes.some((s) => s.keys > 0)) return `stripe layers list no keys: ${JSON.stringify(stripes)}`;
    return null;
  },
  500
);

let fixtureBeforeConflicts = "";
await runAction(
  "resolve-conflicts",
  `
  ${activateTestLayer}
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Konflikte lösen/.test(e.textContent || ''));
  if (!item) { ${dismissDialogs} return { ok: false, reason: 'no conflicts command' }; }
  item.click();
  let button = null;
  for (let i = 0; i < 30 && !button; i++) {
    await sleep(400);
    button = [...document.querySelectorAll('button[aria-label^="Alle Konflikte auflösen"]')]
      .find((b) => !b.disabled && b.offsetParent !== null);
  }
  if (!button) return { ok: false, reason: 'no enabled "Aktives Gebiet" resolve button' };
  button.click();
  await sleep(5000);
  return { ok: true };
`,
  (before, after) => {
    fixtureBeforeConflicts = fixtureCodes(before);
    // Resolving keeps codes in the active layer, so only the other copies must
    // end up empty.
    const copies = after.filter(
      (r) =>
        / \(Kopie\)$|^Kopie von /.test(r.name) &&
        TEST_LAYER.test(r.name) &&
        !r.active
    );
    if (copies.length === 0) return "the duplicated layer is gone";
    if (copies.some((c) => c.codes !== 0)) {
      return `copy still holds codes: ${copies.map((c) => `${c.name}=${c.codes}`).join(", ")}`;
    }
    return null;
  },
  6000
);

// Resolving is area-wide, so it may also have taken codes out of fixture
// layers. Undo until the fixture is back where it started.
for (let i = 0; i < 6; i++) {
  const rows = await readLayers();
  if (fixtureCodes(rows) === fixtureBeforeConflicts) break;
  await cdp.evaluate(`(async () => {
    const b = [...document.querySelectorAll('button')].find((x) => /^R(ü|u)ckg(ä|a)ngig/.test((x.getAttribute('aria-label')||x.title||'')));
    if (b && !b.disabled) b.click();
    await new Promise((r) => setTimeout(r, 3000));
  })()`);
}
{
  const restored = fixtureCodes(await readLayers()) === fixtureBeforeConflicts;
  results.push({
    name: "fixture-restored-after-conflicts",
    ok: restored,
    detail: restored
      ? "stable driven updated — fixture layers back to their starting codes"
      : `STALE-UI — fixture layers differ: ${fixtureCodes(await readLayers())} vs ${fixtureBeforeConflicts}`,
  });
  console.log(`  fixture-restored-after-conflicts ... ${restored ? "PASS" : "FAIL"}`);
}


// ---- area metadata ----

let descriptionText = "";
await runAction(
  "edit-area-description",
  `
  ${dismissDialogs}
  const trigger = document.querySelector('[title="Beschreibung bearbeiten"]');
  if (!trigger) return { ok: false, reason: 'no description control' };
  trigger.click();
  await sleep(500);
  const area = document.querySelector('textarea[placeholder="Beschreibung hinzufügen…"]');
  if (!area) return { ok: false, reason: 'description editor never opened' };
  const text = 'DESC ' + Date.now().toString().slice(-5);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(area, text);
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(200);
  area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await sleep(2500);
  const shown = (document.querySelector('[title="Beschreibung bearbeiten"]')?.textContent || '').indexOf(text) !== -1;
  return { ok: true, text, shown };
`,
  (_before, _after, outcome) => {
    descriptionText = String(outcome.text ?? "");
    return outcome.shown === true
      ? null
      : `description "${descriptionText}" not shown after saving`;
  }
);

// ---- versions ----

/** Open the history dialog, wait for its fresh read, report what it lists. */
const readHistory = `
  ${openPalette}
  const open = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Versionsverlauf/.test(e.textContent || ''));
  if (!open) { ${dismissDialogs} return { ok: false, reason: 'no history command' }; }
  open.click();
  let dlg = null;
  for (let i = 0; i < 25 && !dlg; i++) {
    await sleep(300);
    dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Versionen \\(\\d+\\)/.test(d.textContent || ''));
  }
  if (!dlg) return { ok: false, reason: 'history dialog never opened' };
  // The dialog re-reads on open; give that read time to land.
  await sleep(3000);
  const count = Number(((dlg.textContent || '').match(/Versionen \\((\\d+)\\)/) || [])[1]);
  const text = dlg.textContent || '';
`;

let versionName = "";
const createVersionScript = `  const badgeBefore = document.querySelector('[data-version-badge]')?.getAttribute('data-version-badge') ?? null;
  ${readHistory}
  const before = count;
  ${dismissDialogs}
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Version erstellen/.test(e.textContent || ''));
  if (!item) { ${dismissDialogs} return { ok: false, reason: 'no create-version command' }; }
  item.click();
  let form = null;
  for (let i = 0; i < 25 && !form; i++) {
    await sleep(300);
    form = [...document.querySelectorAll('[role="dialog"] form')].find((f) => f.querySelector('input[placeholder^="z.B."]'));
  }
  if (!form) return { ok: false, reason: 'create-version form never opened' };
  const name = 'VER ' + Date.now().toString().slice(-5);
  const input = form.querySelector('input[placeholder^="z.B."]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, name);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  form.requestSubmit();
  await sleep(4000);
  ${dismissDialogs}
  {
    ${readHistory}
    const listed = text.indexOf(name) !== -1;
    ${dismissDialogs}
    const badgeAfter = document.querySelector('[data-version-badge]')?.getAttribute('data-version-badge') ?? null;
    return { ok: true, name, before, after: count, listed, badgeBefore, badgeAfter };
  }
`;

await runAction(
  "create-version",
  createVersionScript,
  (_before, _after, outcome) => {
    versionName = String(outcome.name ?? "");
    if (Number(outcome.after) !== Number(outcome.before) + 1) {
      return `history lists ${String(outcome.after)} versions, expected ${Number(outcome.before) + 1}`;
    }
    if (outcome.listed !== true) {
      return `new version "${versionName}" is not in the history without a reload`;
    }
    if (outcome.badgeBefore === null || outcome.badgeAfter === null) {
      return "no [data-version-badge] in the header";
    }
    if (outcome.badgeAfter === outcome.badgeBefore) {
      return `header version badge still shows ${String(outcome.badgeAfter)}`;
    }
    return null;
  },
  2000
);

let markerName = "";
await runAction(
  "create-layer-after-version",
  `
  ${dismissDialogs}
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
  await sleep(900);
  const input = document.activeElement && document.activeElement.tagName === 'INPUT'
    ? document.activeElement
    : [...document.querySelectorAll('input')].find((i) => /Neues Gebiet/i.test(i.placeholder || ''));
  if (!input) return { ok: false, reason: 'no new-layer input' };
  const name = 'ACT M' + Date.now().toString().slice(-4);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, name);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(250);
  const form = input.closest('form');
  if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await sleep(1500);
  return { ok: true, name };
`,
  (before, after, outcome) => {
    markerName = String(outcome.name ?? "");
    return after.some((r) => r.name === markerName) && after.length === before.length + 1
      ? null
      : `marker layer "${markerName}" did not appear`;
  }
);

// The version just created is the active one, and restoring the active
// version is (rightly) disabled. Create a second version on top of the marker,
// then restore the first: the marker must disappear.
let restoreTarget = "";
{
  const first = versionName;
  await runAction(
    "create-second-version",
    createVersionScript,
    (_b, _a, outcome) =>
      outcome.listed === true ? null : "second version not listed"
  );
  restoreTarget = first;
  versionName = first;
}

await runAction(
  "restore-version",
  `
  ${readHistory}
  const wanted = ${JSON.stringify(restoreTarget)};
  const card = [...dlg.querySelectorAll('[role="button"]')].find((c) => (c.textContent || '').indexOf(wanted) !== -1);
  if (!card) { ${dismissDialogs} return { ok: false, reason: 'version card not found: ' + wanted }; }
  card.click();
  await sleep(600);
  const restore = [...dlg.querySelectorAll('button')].find((b) => /wiederherstellen$/.test((b.textContent || '').trim()) && !b.disabled);
  if (!restore) { ${dismissDialogs} return { ok: false, reason: 'restore button disabled (version already active?)' }; }
  restore.click();
  let confirm = null;
  for (let i = 0; i < 15 && !confirm; i++) {
    await sleep(300);
    const sheet = [...document.querySelectorAll('[role="alertdialog"]')].pop();
    confirm = sheet && [...sheet.querySelectorAll('button')].find((b) => /^Wiederherstellen$/.test((b.textContent || '').trim()));
  }
  if (!confirm) { ${dismissDialogs} return { ok: false, reason: 'restore confirmation never appeared' }; }
  confirm.click();
  await sleep(6000);
  ${dismissDialogs}
  return { ok: true };
`,
  (before, after) => {
    if (after.some((r) => r.name === markerName)) {
      return `layer "${markerName}" created after the version is still shown`;
    }
    if (after.length !== before.length - 1) {
      return `expected ${before.length - 1} layers after restore, panel shows ${after.length}`;
    }
    if (!after.some((r) => r.active)) {
      return "no layer is active after the restore";
    }
    return null;
  },
  4000
);


await runAction(
  "delete-active-layer",
  `
  ${activateTestLayer}
  const current = document.querySelector('[data-layer-active="true"]');
  if (!current || !/^(ACT|REN|PROBE)/.test(current.getAttribute('data-layer-name') || '')) {
    return { ok: false, reason: 'refusing to delete a non-test layer' };
  }
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
// Without this the area grows by a few layers every run.
console.log(`  cleanup ... removed ${await cleanupTestLayers()} test layer(s)`);

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
  if (descriptionText) {
    const persisted = await cdp.evaluate<boolean>(
      `(document.querySelector('[title="Beschreibung bearbeiten"]')?.textContent || '').indexOf(${JSON.stringify(descriptionText)}) !== -1`
    );
    results.push({
      name: "description-persisted",
      ok: persisted,
      detail: persisted
        ? "stable driven updated — description survives a reload"
        : `STALE-UI — after reload the description is not "${descriptionText}"`,
    });
  }
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

// ---- a throwaway area: create, switch granularity in place, delete ----
//
// Granularity changes are lossy on an area with codes, so this never touches
// the fixture. A brand-new area has no codes, so any direction skips the
// data-loss confirmation and only the setting changes.

const TMP_AREA = `TMP ${Date.now().toString().slice(-5)}`;
const sidebarHas = (name: string) =>
  `[...document.querySelectorAll('[data-sidebar="sidebar"] *, aside *')].some((e) => e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(name)})`;

const created = await cdp.evaluate<Record<string, unknown>>(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ${dismissDialogs}
  const plus = document.querySelector('[title="Neues Gebiet erstellen"]');
  if (!plus) return { ok: false, reason: 'no create-area button' };
  plus.click();
  let form = null;
  for (let i = 0; i < 20 && !form; i++) {
    await sleep(300);
    form = [...document.querySelectorAll('[role="dialog"] form')].find((f) => f.querySelector('#name'));
  }
  if (!form) return { ok: false, reason: 'create-area dialog never opened' };
  const input = form.querySelector('#name');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(TMP_AREA)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  const from = location.pathname;
  form.requestSubmit();
  for (let i = 0; i < 60 && location.pathname === from; i++) await sleep(300);
  if (location.pathname === from) return { ok: false, reason: 'did not navigate to the new area' };
  const id = Number((location.pathname.match(/postal-codes\\/(\\d+)/) || [])[1]);
  for (let i = 0; i < 60 && !document.querySelector('[aria-label="Kartentools-Panel"]'); i++) await sleep(500);
  await sleep(2500);
  return { ok: true, id, inSidebar: ${sidebarHas(TMP_AREA)} };
})()`);
const tmpAreaId = Number(created.id ?? 0);
let granularityWanted = "";
results.push({
  name: "create-area-listed-live",
  ok: created.ok === true && created.inSidebar === true,
  detail:
    created.ok !== true
      ? `NOT-DRIVEN — ${String(created.reason)}`
      : created.inSidebar === true
        ? `stable driven updated — area ${tmpAreaId} in the sidebar without a reload`
        : `STALE-UI — area ${tmpAreaId} created but not listed in the sidebar`,
});
console.log(`  create-area-listed-live ... ${results[results.length - 1].ok ? "PASS" : "FAIL"}`);

if (tmpAreaId > 0) {
  await cdp.evaluate("window.__probe && window.__probe.reset()");
  await runAction(
    "granularity-in-place",
    `
    ${dismissDialogs}
    const trigger = [...document.querySelectorAll('[data-slot="select-trigger"], button[role="combobox"]')]
      .find((b) => /\\d-stellig/.test(b.textContent || ''));
    if (!trigger) return { ok: false, reason: 'no granularity select' };
    const from = (trigger.textContent || '').trim();
    const want = /3-stellig/.test(from) ? '2-stellig' : '3-stellig';
    trigger.click();
    await sleep(700);
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent || '').indexOf(want) !== -1);
    if (!option) { ${dismissDialogs} return { ok: false, reason: 'option missing: ' + want }; }
    option.click();
    await sleep(1200);
    // An empty area should not ask; if it does, confirm — there is nothing to lose.
    const sheet = [...document.querySelectorAll('[role="alertdialog"]')].pop();
    const confirm = sheet && [...sheet.querySelectorAll('button')].find((b) => !/abbrechen/i.test(b.textContent || ''));
    const asked = Boolean(confirm);
    if (confirm) { confirm.click(); await sleep(1500); }
    await sleep(3500);
    const now = ([...document.querySelectorAll('[data-slot="select-trigger"], button[role="combobox"]')]
      .find((b) => /\\d-stellig/.test(b.textContent || '')) || {}).textContent || '';
    return { ok: true, from, want, now: now.trim(), asked };
  `,
    (_before, _after, outcome) => {
      granularityWanted = String(outcome.want ?? "");
      return String(outcome.now).indexOf(granularityWanted) !== -1
        ? null
        : `selector shows "${String(outcome.now)}", expected "${granularityWanted}"`;
    },
    3000
  );

  const wanted = granularityWanted;
  await cdp.send("Page.reload", {});
  await cdp.waitFor("Boolean(document.querySelector('[aria-label=\"Kartentools-Panel\"]'))", 180000);
  await sleep(3000);
  const afterReload = await cdp.evaluate<string>(
    `(([...document.querySelectorAll('[data-slot="select-trigger"], button[role="combobox"]')].find((b) => /\\d-stellig/.test(b.textContent || '')) || {}).textContent || '').trim()`
  );
  const persisted = wanted !== "" && afterReload.indexOf(wanted) !== -1;
  results.push({
    name: "granularity-persisted",
    ok: persisted,
    detail: persisted
      ? `stable driven updated — still ${wanted} after reload`
      : `STALE-UI — after reload the selector shows "${afterReload}", expected "${wanted}"`,
  });
  console.log(`  granularity-persisted ... ${persisted ? "PASS" : "FAIL"}`);

  // Delete it again from the sidebar's context menu.
  const deleted = await cdp.evaluate<Record<string, unknown>>(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ${dismissDialogs}
    const label = [...document.querySelectorAll('aside *, [data-sidebar="sidebar"] *')]
      .find((e) => e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(TMP_AREA)});
    if (!label) return { ok: false, reason: 'area not in sidebar' };
    const item = label.closest('a, button, li') || label;
    const box = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.x + 5, clientY: box.y + 5 }));
    await sleep(600);
    const del = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Löschen' && b.offsetParent !== null && !b.closest('[role="alertdialog"]'));
    if (!del) return { ok: false, reason: 'no "Löschen" in the context menu' };
    del.click();
    let confirm = null;
    for (let i = 0; i < 15 && !confirm; i++) {
      await sleep(300);
      const sheet = [...document.querySelectorAll('[role="alertdialog"]')].pop();
      confirm = sheet && [...sheet.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Löschen');
    }
    if (!confirm) return { ok: false, reason: 'delete confirmation never appeared' };
    confirm.click();
    await sleep(4000);
    return { ok: true, stillListed: ${sidebarHas(TMP_AREA)} };
  })()`);
  results.push({
    name: "delete-area-unlisted-live",
    ok: deleted.ok === true && deleted.stillListed === false,
    detail:
      deleted.ok !== true
        ? `NOT-DRIVEN — ${String(deleted.reason)} (area ${tmpAreaId} may need manual cleanup)`
        : deleted.stillListed === false
          ? "stable driven updated — gone from the sidebar without a reload"
          : "STALE-UI — deleted but still listed in the sidebar",
  });
  console.log(`  delete-area-unlisted-live ... ${results[results.length - 1].ok ? "PASS" : "FAIL"}`);
}

// Coming back to an area you edited must show the edit, not a cached copy of
// the page from before it.
await cdp.send("Page.navigate", { url: URL_TO_OPEN });
await cdp.waitFor("document.querySelectorAll('[data-layer-row]').length > 0", 180000);
await sleep(2500);
if (descriptionText) {
  const fresh = await cdp.evaluate<boolean>(
    `(document.querySelector('[title="Beschreibung bearbeiten"]')?.textContent || '').indexOf(${JSON.stringify(descriptionText)}) !== -1`
  );
  results.push({
    name: "edit-visible-after-navigating-back",
    ok: fresh,
    detail: fresh
      ? "stable driven updated — area shows its latest description"
      : "STALE-UI — returning to the area showed the old description",
  });
}

// MapLibre style warnings mean something on the map is not drawing.
{
  const warnings = Cdp.consoleEvents.filter((e) =>
    /could not be loaded|Image ".*" /i.test(e.text)
  );
  results.push({
    name: "no-map-style-warnings",
    ok: warnings.length === 0,
    detail:
      warnings.length === 0
        ? "stable driven updated — no missing-image warnings"
        : `STALE-UI — ${warnings.length} warning(s): ${warnings[0].text.slice(0, 120)}`,
  });
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

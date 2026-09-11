export {};

/**
 * Exercises every mutating action on a test area and asserts that none of them
 * remount the view or blank the map.
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

const ready = await cdp.waitFor(
  "Boolean(document.querySelector('canvas') && document.querySelector('[aria-label=\"Kartentools-Panel\"]'))",
  120000
);
console.log("attached, map ready:", ready);
if (!ready) {
  console.log("map/panel never appeared — is the server running?");
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
async function runAction(
  name: string,
  script: string,
  settleMs = 3000
): Promise<void> {
  process.stdout.write(`  running ${name} ... `);
  const tStart = Date.now();
  const mark = (label: string) =>
    process.stdout.write(`${label}=${Date.now() - tStart}ms `);
  await cdp.evaluate("window.__probe.reset(); window.__t = performance.now();");
  const baseline = await cdp.evaluate<number>("window.__probe.baselineColors");

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

  results.push({
    name,
    ok: stable && driven,
    detail:
      `${stable ? "stable" : "UNSTABLE"} ${driven ? "driven" : "NOT-DRIVEN"} ` +
      `remount=${verdict.remounted} canvasGone=${verdict.blankCanvas} panelGone=${verdict.blankPanel} ` +
      `mapBlank=${verdict.blankMap} styleReloads=${verdict.styleLoads} ` +
      `colors ${verdict.baseline}->${verdict.endColors} ` +
      `${JSON.stringify(outcome).slice(0, 110)}`,
  });

  mark("verdict");
  console.log(results[results.length - 1].ok ? "PASS" : "FAIL");
  await cdp.screenshot(`${SHOT_DIR}\\${name.replace(/[^a-z0-9]+/gi, "-")}.jpg`);
}

const byLabel = (t: string) =>
  `[...document.querySelectorAll('button')].find((b) => ((b.getAttribute('aria-label')||b.title||'')).indexOf(${JSON.stringify(t)}) === 0)`;

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
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'ACT ' + Date.now().toString().slice(-5));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(250);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const form = input.closest('form');
  if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return { ok: true };
`
);

await runAction("toggle-postal-code", `
  ${openPalette}
  const dlg = document.querySelector('[role="dialog"]');
  const input = dlg && dlg.querySelector('[cmdk-input]');
  if (!input) return { ok: false, reason: 'no palette input' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '86899');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1200);
  // Whichever direction the code is currently in — this must not depend on
  // whatever a previous run left behind.
  const item = [...document.querySelectorAll('[cmdk-item]')]
    .find((e) => /hinzuf|entfernen/i.test(e.textContent));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'no add/remove command' }; }
  const was = /entfernen/i.test(item.textContent) ? 'remove' : 'add';
  item.click();
  await sleep(2000);
  return { ok: true, did: was };
`);

await runAction("toggle-layer-visibility", paletteRun("ein-/ausblenden"));
await runAction("duplicate-active-layer", paletteRun("Aktive Ebene duplizieren"));
// select-all-unassigned is not in the default set: on a small test area it
// writes every unassigned code in the country, which is thousands of rows per
// run. Enable it deliberately with HEAVY=1.
if (process.env.HEAVY === "1") {
  await runAction("select-all-unassigned", `
    ${openPalette}
    const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /nicht zugeordneten PLZ hinzuf/i.test(e.textContent));
    if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'command missing' }; }
    item.click();
    await sleep(2500);
    return { ok: true };
  `, 9000);
}

await runAction("undo", `
  const b = [...document.querySelectorAll('button')].find((x) => /^R(ü|u)ckg(ä|a)ngig/.test((x.getAttribute('aria-label')||x.title||'')));
  if (!b) return { ok: false, reason: 'no undo button' };
  b.click();
  await sleep(2000);
  return { ok: true };
`, 8000);
await runAction("redo", `
  const b = [...document.querySelectorAll('button')].find((x) => /^Wiederholen/.test((x.getAttribute('aria-label')||x.title||'')));
  if (!b) return { ok: false, reason: 'no redo button' };
  b.click();
  await sleep(2000);
  return { ok: true };
`, 8000);
await runAction("create-version", paletteRun("Version erstellen"));
await runAction("delete-active-layer", `
  ${openPalette}
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Aktive Ebene l(ö|o)schen/i.test(e.textContent));
  if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'command missing' }; }
  item.click();
  await sleep(1200);
  const confirm = [...document.querySelectorAll('[role="dialog"] button')].find((b) => /l(ö|o)schen|entfernen|best(ä|a)tigen/i.test(b.textContent || ''));
  if (confirm) { confirm.click(); await sleep(1500); }
  return { ok: true };
`);

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

cdp.detach();

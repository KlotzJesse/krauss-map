/**
 * Checks that what the rest of the page shows follows an edit without a reload:
 * the sidebar area list, its code counts, the header's area name and version
 * badge, and an area revisited shortly after editing it.
 *
 * Edits deliberately do not re-render the route (that remounts the map), so
 * each of these has its own way of staying current, and each one silently
 * breaks if that path is missed. Runs in its own browser tab and on a throwaway
 * area it creates and deletes, so it can run next to scripts/test-actions.ts.
 */

import { Cdp, sleep } from "./lib/browser";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const cdp = await Cdp.attach(`${BASE}/postal-codes`, { tab: "live-sync" });

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} ${detail}`);
};
const js = <T>(body: string) =>
  cdp.evaluate<T>(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ${body}
  })()`);
const until = async (expr: string, ms = 20_000) => await cdp.waitFor(expr, ms, 250);

const dismiss = `
  for (let i = 0; i < 3 && document.querySelector('[role="dialog"],[role="alertdialog"]'); i++) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
  }`;
const setValue = `
  const setValue = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };`;
const sidebarCount = (areaId: number) => `(() => {
  const link = document.querySelector('a[href="/postal-codes/${areaId}"]');
  if (!link) return null;
  const count = link.parentElement && link.parentElement.querySelector('span[title$=" PLZ"]');
  return count ? Number(count.textContent) : 0;
})()`;

/** Delete an area through the sidebar's context menu; true once it is gone. */
async function deleteArea(id: number): Promise<boolean> {
  await js<string>(`
    ${dismiss}
    const link = document.querySelector('a[href="/postal-codes/${id}"]');
    if (!link) return 'no link';
    // The handler sits on the item's wrapper div, so fire from inside it and let
    // the event bubble; the menu it opens is plain buttons, not menuitems.
    const box = link.getBoundingClientRect();
    link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 5 }));
    await sleep(700);
    const item = [...document.querySelectorAll('.fixed button')].find((e) => /L(ö|o)schen/.test(e.textContent || ''));
    if (!item) return 'no delete item';
    item.click();
    await sleep(900);
    const sheet = [...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].pop();
    const confirm = sheet && [...sheet.querySelectorAll('button')].find((b) => /l(ö|o)schen/i.test(b.textContent || '') && !/abbrechen/i.test(b.textContent || ''));
    if (!confirm) return 'no confirm';
    confirm.click();
    return 'ok';
  `);
  return await until(`!document.querySelector('a[href="/postal-codes/${id}"]')`, 20_000);
}

await until("document.readyState === 'complete'", 60_000);
await until("Boolean([...document.querySelectorAll('button')].find((b) => /Neues Gebiet erstellen/.test(b.textContent || '')))", 60_000);

// Leftovers from an interrupted run.
await until(`document.querySelectorAll('a[href^="/postal-codes/"]').length > 0`, 30_000);
const leftovers = await cdp.evaluate<number[]>(
  `[...document.querySelectorAll('a[href^="/postal-codes/"]')]
    .filter((a) => a.textContent.trim().startsWith('SYNC '))
    .map((a) => Number(a.getAttribute('href').split('/').pop()))
    .filter((id, i, all) => all.indexOf(id) === i)`
);
// The sidebar mounts its list once the browser goes idle, and its item handlers
// are not wired until then, so give it a moment and one retry.
await sleep(2500);
for (const id of leftovers) {
  const ok = (await deleteArea(id)) || (await deleteArea(id));
  console.log(`  removing leftover area ${id}: ${ok ? "ok" : "failed"}`);
}

// ---- create an area: it must appear in the sidebar without a reload ----
const areaName = `SYNC ${Date.now().toString().slice(-6)}`;
await js(`
  ${dismiss}
  ${setValue}
  [...document.querySelectorAll('button')].find((b) => /Neues Gebiet erstellen/.test(b.textContent || '')).click();
  await sleep(900);
  setValue(document.querySelector('input#name'), ${JSON.stringify(areaName)});
  setValue(document.querySelector('textarea#description'), 'initial description');
  await sleep(200);
  document.querySelector('[role="dialog"] button[type="submit"]').click();
  return true;
`);
const navigated = await until("/\\/postal-codes\\/\\d+/.test(location.pathname)", 60_000);
const areaId = navigated
  ? Number((await cdp.evaluate<string>("location.pathname")).split("/").pop())
  : 0;
check("create-area navigates", navigated && areaId > 0, `area ${areaId}`);
if (!areaId) {
  cdp.detach();
  process.exit(1);
}
await until("Boolean(document.querySelector('canvas'))", 120_000);

const listed = await until(
  `Boolean([...document.querySelectorAll('a[href="/postal-codes/${areaId}"]')].find((a) => a.textContent.indexOf(${JSON.stringify(areaName)}) !== -1))`,
  15_000
);
check("new area in sidebar", listed, listed ? "listed without reload" : "missing until reload");

// Timestamps come out of the database without an offset; read as local time
// they were two hours off in Germany, so a brand-new area said "vor 2 Std.".
const age = await cdp.evaluate<string | null>(`(() => {
  const link = document.querySelector('a[href="/postal-codes/${areaId}"]');
  const row = link && link.closest('li');
  const label = row && [...row.querySelectorAll('[title^="Geändert"], title')]
    .map((e) => e.getAttribute('title') || e.textContent)
    .find((t) => /Geändert/.test(t || ''));
  return label || null;
})()`);
check("new area age is now", /gerade eben|vor 1 Min\./.test(age ?? ""), age ?? "no label");
const titled = await until(
  `Boolean([...document.querySelectorAll('header h1')].find((h) => h.textContent.includes(${JSON.stringify(areaName)})))`,
  10_000
);
check("header shows new area", titled, "");

// ---- add a code: the sidebar count must follow ----
await until("document.querySelectorAll('[data-layer-row]').length > 0", 30_000);
const before = (await cdp.evaluate<number | null>(sidebarCount(areaId))) ?? 0;
const added = await js<string>(`
  ${dismiss}
  for (let a = 0; a < 3 && !document.querySelector('[cmdk-input]'); a++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await sleep(700);
  }
  ${setValue}
  setValue(document.querySelector('[cmdk-input]'), '86899');
  await sleep(1_500);
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /hinzuf/i.test(e.textContent || ''));
  if (!item) return 'no add command';
  item.click();
  return 'ok';
`);
const counted = await until(`(${sidebarCount(areaId)}) === ${before + 1}`, 15_000);
check(
  "sidebar count follows add",
  added === "ok" && counted,
  `${before} -> ${await cdp.evaluate<number | null>(sidebarCount(areaId))} (${added})`
);

// ---- add by prefix (Ctrl+Shift+P): server-side insert must show up now ----
const READ_CODES =
  "[...document.querySelectorAll('[data-layer-row]')].reduce((s, r) => s + Number(r.getAttribute('data-layer-codes')), 0)";
const panelCodes = () =>
  cdp.evaluate<number>(
    "[...document.querySelectorAll('[data-layer-row]')].reduce((s, r) => s + Number(r.getAttribute('data-layer-codes')), 0)"
  );
const codesBeforePrefix = await panelCodes();
await js(`
  ${dismiss}
  // The shortcut asks for the prefix with window.prompt.
  // "803" covers several Munich codes; "8689" matched only 86899, which the
  // previous step had already added, so nothing new was inserted.
  window.prompt = () => '803';
  const down = { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true };
  document.body.dispatchEvent(new KeyboardEvent('keydown', down));
  return true;
`);
const prefixShown = await until(
  `[...document.querySelectorAll('[data-layer-row]')].reduce((s, r) => s + Number(r.getAttribute('data-layer-codes')), 0) > ${codesBeforePrefix}`,
  20_000
);
const prefixToasts = await cdp.evaluate<string>(
  "[...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent.trim().slice(0, 80)).join(' | ')"
);
const prefixFocus = await cdp.evaluate<string>(
  "document.activeElement ? document.activeElement.tagName + '#' + (document.activeElement.id || '') : 'none'"
);
check(
  "add by prefix shows codes",
  prefixShown,
  `${codesBeforePrefix} -> ${await panelCodes()} codes; toasts: ${prefixToasts || "none"}; focus: ${prefixFocus}`
);

// ---- copy keeps prefixes; pasting it back works ----
const copied = await js<string>(`
  ${dismiss}
  window.__copied = null;
  navigator.clipboard.writeText = (text) => { window.__copied = text; return Promise.resolve(); };
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
  for (let i = 0; i < 20 && window.__copied === null; i++) await sleep(150);
  return window.__copied || '';
`);
const copiedTokens = copied.split(/[,\s]+/).filter(Boolean);
check(
  "copy keeps country prefix",
  copiedTokens.length > 0 && copiedTokens.every((t) => /^(D|A|CH)-\d{1,5}$/.test(t)) && copied.includes("D-86899"),
  copied.slice(0, 80) || "nothing copied"
);

const codesBeforePaste = await panelCodes();
await js(`
  ${dismiss}
  // One prefixed and one bare code, as "PLZ kopieren" and a spreadsheet give them.
  const data = new DataTransfer();
  data.setData('text/plain', 'D-80469, 80538');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return true;
`);
const pasted = await until(`${READ_CODES} === ${codesBeforePaste + 2}`, 20_000);
check("paste accepts prefixed codes", pasted, `${codesBeforePaste} -> ${await panelCodes()} codes`);

const codesBeforePalette = await panelCodes();
const paletteDriven = await js<string>(`
  ${dismiss}
  for (let a = 0; a < 3 && !document.querySelector('[cmdk-input]'); a++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await sleep(700);
  }
  ${setValue}
  setValue(document.querySelector('[cmdk-input]'), 'D-80539');
  await sleep(1_500);
  const heading = [...document.querySelectorAll('[cmdk-group-heading]')].map((h) => h.textContent || '').find((t) => t.includes('80539')) || '';
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /hinzuf/i.test(e.textContent || ''));
  if (!item) return 'no add command; heading: ' + heading;
  item.click();
  return 'ok; heading: ' + heading;
`);
const paletteAdded = await until(`${READ_CODES} === ${codesBeforePalette + 1}`, 15_000);
check(
  "palette takes prefixed code",
  paletteDriven.startsWith("ok") && paletteAdded,
  `${codesBeforePalette} -> ${await panelCodes()} (${paletteDriven})`
);

// ---- a locked layer refuses writes, even from paths outside the panel ----
const lockToggle = (label: string) => js<string>(`
  ${dismiss}
  const row = document.querySelector('[data-layer-active="true"]');
  if (!row) return 'no active row';
  const box = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 30, clientY: box.top + 8 }));
  await sleep(700);
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) => (e.textContent || '').trim() === ${JSON.stringify("__LABEL__")});
  if (!item) { ${dismiss} return 'no menu item'; }
  item.click();
  await sleep(500);
  return 'ok';
`.replace("__LABEL__", label));
const locked = await lockToggle("Sperren");
const codesBeforeLockedPaste = await panelCodes();
await js(`
  ${dismiss}
  const data = new DataTransfer();
  data.setData('text/plain', 'D-80637');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return true;
`);
await sleep(3000);
const lockedWarned = await cdp.evaluate<boolean>(
  "[...document.querySelectorAll('[data-sonner-toast]')].some((t) => /gesperrt/.test(t.textContent || ''))"
);
const codesAfterLockedPaste = await panelCodes();
check(
  "lock blocks paste",
  locked === "ok" && lockedWarned && codesAfterLockedPaste === codesBeforeLockedPaste,
  `${locked}; warned=${lockedWarned}; ${codesBeforeLockedPaste} -> ${codesAfterLockedPaste}`
);
await lockToggle("Entsperren");

// ---- a code from another country draws without a reload ----
const findMapInstance = `
  const isMap = (v) => v && typeof v === 'object' && typeof v.getStyle === 'function' && typeof v.getFeatureState === 'function';
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
      for (let h = f.memoizedState, n = 0; h && n < 80 && !map; h = h.next, n++) {
        map = unwrap(h.memoizedState) || unwrap(h.memoizedState && h.memoizedState.current);
      }
      map = map || unwrap(f.memoizedProps && f.memoizedProps.value) || unwrap(f.stateNode);
    }
  }`;
const codesBeforeForeign = await panelCodes();
await js(`
  ${dismiss}
  const data = new DataTransfer();
  data.setData('text/plain', 'A-1010');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return true;
`);
const foreignAdded = await until(`${READ_CODES} === ${codesBeforeForeign + 1}`, 15_000);
let foreignDrawn = false;
for (let attempt = 0; attempt < 20 && !foreignDrawn; attempt++) {
  await sleep(1500);
  foreignDrawn = await js<boolean>(`
    ${findMapInstance}
    if (!map) return false;
    const state = map.getFeatureState({ source: 'postal-codes', sourceLayer: 'plz', id: 'AT:1010' });
    return Boolean(state && state.fill);
  `);
}
check(
  "foreign code draws live",
  foreignAdded && foreignDrawn,
  `added=${foreignAdded}; AT:1010 styled on the map=${foreignDrawn}`
);

// ---- someone else's edit shows up without a reload ----
// Written straight to the database, the way another person's session would
// land: nothing in this tab knows about it.
const activeLayerId = await cdp.evaluate<number>(
  "Number((document.querySelector('[data-layer-active=\"true\"]') || {}).getAttribute ? document.querySelector('[data-layer-active=\"true\"]').getAttribute('data-layer-row') : 0)"
);
const codesBeforeRemote = await panelCodes();
const { db } = await import("../src/lib/db");
const { sql } = await import("drizzle-orm");
await db.execute(
  sql`insert into area_layer_postal_codes (layer_id, postal_code) values (${activeLayerId}, 'D-80995') on conflict do nothing`
);
const remoteShown = await until(`${READ_CODES} === ${codesBeforeRemote + 1}`, 30_000);
check(
  "other user's edit shows",
  activeLayerId > 0 && remoteShown,
  `layer ${activeLayerId}: ${codesBeforeRemote} -> ${await panelCodes()} codes within 30s`
);

// ---- an edit in another tab shows up here ----
const second = await Cdp.attach(`${BASE}/postal-codes/${areaId}`, { tab: "live-sync-second" });
await second.waitFor("document.querySelectorAll('[data-layer-row]').length > 0", 120_000);
await sleep(2500);
// A tab behind another one reports itself hidden and skips checks until it is
// looked at again; pretend the first tab is still in view.
await cdp.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }), true");
const codesBeforeOtherTab = await panelCodes();
await second.evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const data = new DataTransfer();
  data.setData('text/plain', 'D-80997');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await sleep(500);
  return true;
})()`);
const otherTabShown = await until(`${READ_CODES} === ${codesBeforeOtherTab + 1}`, 15_000);
check(
  "other tab's edit shows",
  otherTabShown,
  `${codesBeforeOtherTab} -> ${await panelCodes()} codes`
);
await second.send("Page.close", {}).catch(() => undefined);
second.detach();

// ---- create a version: the header badge must follow ----
const badge = () =>
  cdp.evaluate<number>(
    "Number((document.querySelector('[data-version-badge]') || {}).getAttribute ? document.querySelector('[data-version-badge]').getAttribute('data-version-badge') : 0)"
  );
const badgeBefore = await badge();
const versioned = await js<string>(`
  ${dismiss}
  for (let a = 0; a < 3 && !document.querySelector('[cmdk-input]'); a++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await sleep(700);
  }
  const item = [...document.querySelectorAll('[cmdk-item]')].find((e) => /Version erstellen/.test(e.textContent || ''));
  if (!item) return 'no command';
  item.click();
  await sleep(1_500);
  const sheet = [...document.querySelectorAll('[role="dialog"]')].pop();
  if (!sheet) return 'no dialog';
  ${setValue}
  const name = sheet.querySelector('input');
  if (name) setValue(name, 'sync check');
  await sleep(200);
  const submit = [...sheet.querySelectorAll('button')].find((b) => /erstellen|speichern/i.test(b.textContent || '') && !b.disabled);
  if (!submit) return 'no submit';
  submit.click();
  return 'ok';
`);
const badged = await until(
  `Number((document.querySelector('[data-version-badge]') || { getAttribute: () => 0 }).getAttribute('data-version-badge')) > ${badgeBefore}`,
  15_000
);
check("version badge follows create", versioned === "ok" && badged, `v${badgeBefore} -> v${await badge()} (${versioned})`);

// ---- leave and come back quickly: the edit must still be there ----
const codesHere = () =>
  cdp.evaluate<number>(
    "[...document.querySelectorAll('[data-layer-row]')].reduce((s, r) => s + Number(r.getAttribute('data-layer-codes')), 0)"
  );
const codesBeforeLeaving = await codesHere();
await js(`
  ${dismiss}
  const other = [...document.querySelectorAll('a[href^="/postal-codes/"]')].find((a) => !['/postal-codes/${areaId}', '/postal-codes/57'].includes(a.getAttribute('href')));
  other.click();
  return true;
`);
await until(`!location.pathname.endsWith('/${areaId}')`, 30_000);
await sleep(2500);
await js(`document.querySelector('a[href="/postal-codes/${areaId}"]').click(); return true;`);
await until(`location.pathname.endsWith('/${areaId}')`, 30_000);
await until("document.querySelectorAll('[data-layer-row]').length > 0", 60_000);
await sleep(1500);
const codesOnReturn = await codesHere();
check(
  "revisit shows the edit",
  codesOnReturn === codesBeforeLeaving,
  `${codesBeforeLeaving} codes before leaving, ${codesOnReturn} on return`
);

// ---- rename in the sidebar, then undo: header follows both ways ----
const renamed = `${areaName} R`;
const renameDriven = await js<string>(`
  ${dismiss}
  const link = document.querySelector('a[href="/postal-codes/${areaId}"]');
  if (!link) return 'no link';
  const box = link.getBoundingClientRect();
  link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 5 }));
  await sleep(700);
  const item = [...document.querySelectorAll('.fixed button')].find((e) => /Umbenennen/.test(e.textContent || ''));
  if (!item) return 'no rename item';
  item.click();
  await sleep(700);
  const input = document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement : null;
  if (!input) return 'no rename input';
  ${setValue}
  setValue(input, ${JSON.stringify(renamed)});
  await sleep(200);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  return 'ok';
`);
const headerRenamed = await until(
  `[...document.querySelectorAll('header h1')].some((h) => h.textContent.trim() === ${JSON.stringify(renamed)})`,
  15_000
);
check("header follows rename", renameDriven === "ok" && headerRenamed, renameDriven);

const undoDriven = await js<string>(`
  ${dismiss}
  const b = [...document.querySelectorAll('button')].find((x) => /^R(ü|u)ckg(ä|a)ngig/.test((x.getAttribute('aria-label') || x.title || '')));
  if (!b) return 'no undo button';
  if (b.disabled) return 'undo disabled';
  b.click();
  return 'ok';
`);
const headerRestored = await until(
  `[...document.querySelectorAll('header h1')].some((h) => h.textContent.trim() === ${JSON.stringify(areaName)})`,
  15_000
);
check(
  "undo restores area name",
  undoDriven === "ok" && headerRestored,
  `${undoDriven}; header: ${await cdp.evaluate<string>("(document.querySelector('header h1') || {}).textContent")}`
);

// ---- clear the description: it must stay cleared after a reload ----
const cleared = await js<string>(`
  ${dismiss}
  const button = document.querySelector('[data-area-description]');
  if (!button) return 'no description shown';
  button.click();
  await sleep(500);
  const area = document.querySelector('textarea');
  if (!area) return 'no editor';
  ${setValue}
  setValue(area, '');
  await sleep(200);
  area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  return 'ok';
`);
await until("!document.querySelector('[data-area-description]')", 8000);
await sleep(2000);
await cdp.send("Page.reload", {});
await until("document.querySelectorAll('[aria-label=\"Kartentools-Panel\"]').length > 0", 120_000);
await sleep(3000);
const stillThere = await cdp.evaluate<string | null>(
  "(document.querySelector('[data-area-description]') || {}).textContent || null"
);
check("cleared description persists", cleared === "ok" && !stillThere, `${cleared}; after reload: ${stillThere ?? "empty"}`);

// ---- granularity upgrade migrates codes (3-stellig -> 5-stellig) ----
const pickGranularity = (want: string) => js<string>(`
  ${dismiss}
  const trigger = [...document.querySelectorAll('[data-slot="select-trigger"], button[role="combobox"]')]
    .find((b) => /\\d-stellig/.test(b.textContent || ''));
  if (!trigger) return 'no select';
  trigger.click();
  await sleep(700);
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent || '').includes(${JSON.stringify("__WANT__")}));
  if (!option) { ${dismiss} return 'no option'; }
  option.click();
  await sleep(1_200);
  // Going coarser drops codes and asks first; this area is throwaway.
  const sheet = [...document.querySelectorAll('[role="alertdialog"]')].pop();
  const confirm = sheet && [...sheet.querySelectorAll('button')].find((b) => !/abbrechen/i.test(b.textContent || ''));
  if (confirm) { confirm.click(); await sleep(1_500); }
  return 'ok';
`.replace("__WANT__", want));

const toCoarse = await pickGranularity("3-stellig");
// The 3-digit index loads after the switch; paste only resolves codes the map
// has, so retry until it takes.
let coarseAdded = false;
for (let attempt = 0; attempt < 8 && !coarseAdded; attempt++) {
  await sleep(2500);
  await js(`
    ${dismiss}
    const data = new DataTransfer();
    data.setData('text/plain', 'D-803');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return true;
  `);
  coarseAdded = await until(`${READ_CODES} >= 1`, 2500);
}
const coarseCodes = await panelCodes();
check("3-digit code added", toCoarse === "ok" && coarseAdded, `${toCoarse}; ${coarseCodes} codes after pasting D-803`);

const toFine = await pickGranularity("5-stellig");
const migrated = await until(`${READ_CODES} > ${coarseCodes}`, 30_000);
check(
  "upgrade migrates codes",
  toFine === "ok" && migrated,
  `${toFine}; ${coarseCodes} -> ${await panelCodes()} codes (D-803 should expand to its 5-digit codes)`
);

// ---- clean up: delete the throwaway area from the sidebar ----
const deleted = await deleteArea(areaId);
check("cleanup deletes area", deleted, deleted ? "" : "area still listed");

const warnings = Cdp.consoleEvents.filter((e) =>
  /Image .* could not be loaded|Maximum update depth|Minified React error/.test(e.text)
);
check("no console errors", warnings.length === 0, warnings.map((w) => w.text.slice(0, 80)).join(" | "));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
cdp.detach();
process.exit(failed ? 1 : 0);

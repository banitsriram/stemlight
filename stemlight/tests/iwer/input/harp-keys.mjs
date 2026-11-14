// F12 harp and F13 keyboard with real gestures in IWER (biyon-26, 27): on Dvořák, summon the flutes, two-hand
// cut their lane -> a harp take starts and 8 string targets appear; after the count-in, the right index tip
// jumps to the row (no pluck) and sweeps across all 8 strings at 0.5 m/s, up and back -> 8 plucks each way,
// every pitch in key, recorded into the part and kept after the take ends. Then the same with the reeds and
// the keyboard: one press down through each of the 8 keys. Screenshots of the harp and keyboard in use.
// The hand moves run inside the page in real time (one call each), because a CLI call per move takes seconds
// on a loaded machine and the music does not wait.
// Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/harp-keys.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { devHands, enterXR, evalInPage, iw, setHand, sleep } from './harness.mjs';

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
let failed = 0;
const check = (ok, msg) => { log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const shot = (name) => {
  const r = iw('browser', 'screenshot', { format: 'png' });
  writeFileSync(new URL(`${DATE}-${name}.png`, OUT), Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
  log(`shot: results/${DATE}-${name}.png`);
};
const step = (n) => { for (; n > 0; n -= 120) iw('ecs', 'step', { count: Math.min(120, n) }); };
const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (v, k) => v.map((x) => x * k);
const byKind = (kind) => evalInPage((k) => window.__stemlight.ctx.registry.all().filter((t) => t.kind === k), kind);
const dir = (t) => [t.extra?.dx ?? 1, t.extra?.dy ?? 0, t.extra?.dz ?? 0];
const look = (p) => iw('xr', 'look-at', { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } });
const SCALE = { tonic: 64, steps: [0, 2, 3, 5, 7, 8, 10] }; // Dvořák, E minor
const inKey = (p) => SCALE.steps.includes((((p - SCALE.tonic) % 12) + 12) % 12);

const START = Date.now();
try { iw('xr', 'exit'); } catch { /* not in a session */ }
// A fresh page every run: a unique query, so a page left over from an earlier run (whose music played on into
// the next piece) can never pass for this one.
const RUN = `hk=${START}`;
let loaded = false;
for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
  try { evalInPage((q) => { indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99'); location.href = `/?piece=dvorak9&${q}`; return true; }, RUN); } catch { /* navigation */ }
  await sleep(6000);
  for (let i = 0; i < 60 && !loaded; i++) {
    try { loaded = evalInPage((q) => !!window.__stemlight && window.__stemlight.engine.stems().length > 0 && location.search.includes(q), RUN); } catch { /* loading */ }
    if (!loaded) await sleep(500);
  }
}
if (!loaded) throw new Error('fresh page did not load');
log(`fresh page: /?piece=dvorak9&${RUN}`);
await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
evalInPage(() => {
  window.__hk = [];
  window.__ev = [];
  const { bus, transport } = window.__stemlight.ctx;
  bus.on('part:hit', (e) => window.__hk.push(e));
  for (const k of ['piece:load', 'piece:ready', 'piece:end', 'cut:add', 'cut:remove'])
    bus.on(k, (e) => window.__ev.push(`${(performance.now() / 1000).toFixed(1)}s ${k} ${e.id ?? e.cut?.id ?? ''} @${transport.time().toFixed(2)}`));
  return true;
});
const hands = devHands();
const REST = { left: [-0.3, 0.9, -0.15], right: [0.3, 0.9, -0.15] };
for (const side of ['left', 'right']) setHand(hands, side, { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, anchor: 'grasp', position: REST[side] });
const hand = (side, p, pinched) => setHand(hands, side, { position: p, poseId: pinched ? 'pinch' : 'open' });

/** Summons a stem by looking at it, then two-hand cuts a wide span of its lane at piece time T. Returns the cut. */
async function summonAndCut(stem, T) {
  const c = byKind('creature').find((t) => t.stem === stem);
  look(c.center);
  await sleep(2500);
  evalInPage((T) => { const t = window.__stemlight.ctx.transport; t.seek(T); if (!t.playing()) t.play(); return true; }, T);
  await sleep(600);
  iw('ecs', 'pause');
  step(3);
  const lane = byKind('lane')[0];
  if (!lane || lane.stem !== stem) { iw('ecs', 'resume'); return null; }
  const ld = dir(lane);
  hand('left', add(lane.center, scale(ld, -0.12)), true); step(1);
  hand('right', add(lane.center, scale(ld, 0.12)), true); step(12);
  hand('left', REST.left, false); step(4);
  hand('right', REST.right, false); step(8);
  // The take has started: frames must run from here on, or its loop cannot wrap.
  iw('ecs', 'resume');
  return evalInPage((s) => window.__stemlight.parts.cuts().filter((c) => c.stem === s).at(-1) ?? null, stem);
}

/**
 * In the page, in real time: waits until the take's loop is inside the region with `need` seconds to spare
 * (re-arming the same region over the bus if the take ran out of empty passes first), then moves the right
 * index tip along `path`: [{ p }, { p, ms, hold? }, ...], the first a jump, the rest straight lines.
 */
const play = (cut, path, need) => evalInPage(async ({ cut, path, need }) => {
  const s = window.__stemlight, dev = window.IWER_DEVICE, tr = s.ctx.transport;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let cur = cut, rearmed = 0;
  const began = performance.now();
  for (;;) {
    const take = s.parts.taking(), t = tr.time();
    if (take && t >= cur.t0 + 0.05 && t < cur.t1 - need) break;
    if (!take && rearmed < 2) {
      rearmed++;
      s.ctx.bus.emit('cut:remove', { id: cur.id });
      cur = { ...cut, id: `${cut.id}-r${rearmed}` };
      s.ctx.bus.emit('cut:add', { cut: cur });
    }
    if (performance.now() - began > 40000) return { error: `never inside the region (t = ${t.toFixed(2)}, take ${JSON.stringify(take)})` };
    await wait(20);
  }
  const from = window.__hk.length, t0 = tr.time();
  dev.hands.right.poseId = 'point';
  let moves = 0;
  const put = (p) => { moves++; return dev.remote.dispatch('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, anchor: 'index-tip', orientation: 'auto' }); };
  await put(path[0].p);
  await wait(150);
  const jumped = window.__hk.length - from;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1].p, b = path[i].p, at = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - at) / path[i].ms);
      await put(a.map((x, j) => x + (b[j] - x) * k));
      if (k >= 1) break;
      await wait(8);
    }
    if (path[i].hold) await wait(path[i].hold);
  }
  await wait(120);
  return {
    rearmed, cutId: cur.id, t0, t1: tr.time(), moves, jumped, pass: s.engine.pass(), take: s.parts.taking(),
    hits: window.__hk.slice(from), part: s.parts.parts().find((p) => p.cutId === cur.id) ?? null,
  };
}, { cut, path, need }, { timeout: 90000 });

/** In the page: the hand goes back to rest (a jump: no notes), then waits for the take to end by itself. */
const restAndFinish = (cutId) => evalInPage(async ({ cutId, rest }) => {
  const s = window.__stemlight, dev = window.IWER_DEVICE;
  const from = window.__hk.length;
  dev.hands.right.poseId = 'open';
  await dev.remote.dispatch('set_transform', { device: 'hand-right', position: { x: rest[0], y: rest[1], z: rest[2] }, anchor: 'grasp', orientation: 'auto' });
  const began = performance.now();
  while (s.parts.taking() && performance.now() - began < 45000) await new Promise((r) => setTimeout(r, 50));
  return {
    extra: window.__hk.length - from, take: s.parts.taking(), pass: s.engine.pass(), t: s.ctx.transport.time(),
    part: s.parts.parts().find((p) => p.cutId === cutId) ?? null,
  };
}, { cutId, rest: REST.right }, { timeout: 90000 });

const takeOf = () => evalInPage(() => window.__stemlight.parts.taking());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- harp on the flutes ----
const hc = await summonAndCut('fl', 30);
check(!!hc, `two-hand cut on the flute lane -> cut:add (${hc ? `${hc.t0.toFixed(2)}-${hc.t1.toFixed(2)} s, ${(hc.t1 - hc.t0).toFixed(2)} s` : 'none'})`);
if (hc) {
  check(takeOf()?.instrument === 'harp', 'a harp take starts');
  const strings = byKind('string').sort((a, b) => a.extra.pitch - b.extra.pitch);
  const want = strings.map((s) => s.extra.pitch);
  check(strings.length === 8, `8 string targets registered (${strings.length}): pitches ${want.join(' ')}`);
  look(strings[3].center);
  const right = [strings[0].extra.nx, strings[0].extra.ny, strings[0].extra.nz];
  const at = (k) => add(strings[0].center, scale(right, -0.025 + 0.05 * k)); // between strings k-1 and k
  // 0.4 m each way in 0.8 s: 0.5 m/s.
  const r = play(hc, [{ p: at(0) }, { p: at(8), ms: 800, hold: 200 }, { p: at(0), ms: 800 }], 2.6);
  check(!r.error, r.error ?? `count-in over, loop inside the region (t = ${r.t0.toFixed(2)}, re-armed ${r.rearmed}x); sweep done by t = ${r.t1.toFixed(2)}, ${r.moves} hand moves`);
  if (!r.error) {
    shot('harp-pluck'); // the pointing hand at the harp, after the sweep
    const up = r.hits.filter((h) => h.instrument === 'harp').map((h) => h.pitch);
    check(r.jumped === 0, `the jump from rest to the row plucks nothing (${r.jumped})`);
    check(up.length === 16, `up and back at 0.5 m/s -> 16 plucks (${up.length}): ${up.join(' ')}`);
    check(same(up.slice(0, 8), want) && same(up.slice(8), [...want].reverse()), 'in string order, low to high, then back');
    check(up.every(inKey), 'every plucked note in E minor');
    const pitches = new Set(r.part?.hits.map((h) => h.pitch));
    check(r.part?.instrument === 'harp' && pitches.size === 8, `recorded into the harp part: ${r.part?.hits.length} hits, ${pitches.size} distinct pitches (same-pitch hits on one 1/8 slot merge)`);
    const f = restAndFinish(r.cutId);
    check(f.extra === 0, `the hand jumping back to rest plucks nothing (${f.extra})`);
    check(f.take === null && f.pass > r.pass && f.part?.hits.length === r.part?.hits.length, `the loop goes round (pass ${r.pass} -> ${f.pass}), the take ends by itself and the part keeps its ${f.part?.hits.length} hits`);
  }
}

// ---- keyboard on the reeds ----
const kc = await summonAndCut('reeds', 60);
check(!!kc, `two-hand cut on the reed lane -> cut:add (${kc ? `${kc.t0.toFixed(2)}-${kc.t1.toFixed(2)} s` : 'none'})`);
if (kc) {
  check(takeOf()?.instrument === 'keys', 'a keyboard take starts');
  const keys = byKind('key').sort((a, b) => a.extra.pitch - b.extra.pitch);
  const want = keys.map((k) => k.extra.pitch);
  const nStrings = byKind('string').length;
  check(keys.length === 8 && nStrings === 0, `8 key targets, the harp gone (${keys.length} keys, ${nStrings} strings): pitches ${want.join(' ')}`);
  look(keys[3].center);
  // Each key: across to 3 cm above it, down 5 cm through its top in 0.1 s (0.5 m/s), back up.
  const path = [{ p: add(keys[0].center, [0, 0.03, 0]) }];
  keys.forEach((k, i) => {
    if (i) path.push({ p: add(k.center, [0, 0.03, 0]), ms: 100 });
    path.push({ p: add(k.center, [0, -0.02, 0]), ms: 100 }, { p: add(k.center, [0, 0.03, 0]), ms: 100, hold: 40 });
  });
  const r = play(kc, path, 4);
  check(!r.error, r.error ?? `count-in over, loop inside the region (t = ${r.t0.toFixed(2)}, re-armed ${r.rearmed}x); presses done by t = ${r.t1.toFixed(2)}, ${r.moves} hand moves`);
  if (!r.error) {
    shot('keys-press');
    const ks = r.hits.filter((h) => h.instrument === 'keys').map((h) => h.pitch);
    check(r.jumped === 0, `the jump from rest to the keyboard plays nothing (${r.jumped})`);
    check(ks.length === 8 && same(ks, want), `8 presses, one per key, in order (${ks.length}): ${ks.join(' ')}`);
    check(ks.every(inKey), 'every key in E minor');
    check(r.part?.instrument === 'keys' && r.part.hits.length === 8, `recorded into the keyboard part: ${r.part?.hits.length} hits`);
    const f = restAndFinish(r.cutId);
    check(f.extra === 0, `the hand jumping back to rest plays nothing (${f.extra})`);
    check(f.take === null && f.pass > r.pass && f.part?.hits.length === r.part?.hits.length, `the loop goes round (pass ${r.pass} -> ${f.pass}), the take ends by itself and the part keeps its ${f.part?.hits.length} hits`);
  }
}
iw('ecs', 'resume');
setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });
evalInPage(() => { window.__stemlight.ctx.transport.pause(); return true; }); // leave nothing playing for the next run
const events = evalInPage(() => window.__ev);
log('events: ' + events.join(' | '));
check(!events.some((e) => /piece:(load|ready|end)/.test(e)), 'the piece never changed or ended during the run');
const errs = iw('browser', 'logs', { level: 'error', count: 50, since: START });
const allErr = (Array.isArray(errs) ? errs : errs.logs ?? []).map((l) => l.message ?? l.text ?? '').filter(Boolean);
// The emulator's hand and controller models come from a public CDN; a dropped download there isn't the app's.
const cdn = (m) => /webxr-input-profiles|Failed to load resource: net::ERR_CONNECTION_RESET/.test(m);
const errList = allErr.filter((m) => !cdn(m));
if (allErr.length > errList.length) log(`note: ${allErr.length - errList.length} console error(s) from the emulator's hand-model CDN download, not counted`);
check(errList.length === 0, `no console errors${errList.length ? ': ' + errList.slice(0, 3).join(' | ') : ''}`);
log('');
log(failed ? `${failed} FAILED` : 'ALL PASS');
writeFileSync(new URL(`${DATE}-harp-keys.txt`, OUT), lines.join('\n') + '\n');
process.exitCode = failed ? 1 : 0;

// F10 with real gestures (biyon-23 A side, the scripted half of "20 trims, 10 undos"): on Dvořák, summon the
// violins (not a replaceable stem, so a cut is a plain trim with no take or guide), then 20 times: seek to a new
// spot, two-hand pinch the real lane and release -> cut:add + a hollow region target, and the violins' trim gain
// reads 0 inside the region on playback and 1 outside it. Every second cut is undone straight away by pulling
// the region 13 cm off -> cut:remove, region gone, gain back to 1 there. Ends with 10 cuts kept.
// Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/trim-20.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { devHands, enterXR, evalInPage, inputLog, iw, setHand, sleep } from './harness.mjs';

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const tally = {};
const check = (name, ok, detail = '') => {
  tally[name] ??= { pass: 0, fail: 0 };
  tally[name][ok ? 'pass' : 'fail']++;
  if (!ok) log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
};
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const since = () => Date.now() - 1;
const events = (from, kind) => inputLog(from).filter((e) => e.event === kind).map((e) => e.data);
const step = (n) => { for (; n > 0; n -= 120) iw('ecs', 'step', { count: Math.min(120, n) }); };
const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (v, k) => v.map((x) => x * k);
const byKind = (kind) => evalInPage((k) => window.__stemlight.ctx.registry.all().filter((t) => t.kind === k), kind);
const dir = (t) => [t.extra?.dx ?? 1, t.extra?.dy ?? 0, t.extra?.dz ?? 0];
const STEM = 'vln';
/** Plays from piece time x for a moment and reads the violins' trim gain (cut regions) together with the piece
 *  time it was read at, then pauses. Each harness call takes about a second while the music runs, so the
 *  reading is judged by that time, not by x. */
const gainAt = async (x) => {
  evalInPage((x) => { const t = window.__stemlight.ctx.transport; t.seek(x); t.play(); }, x);
  await sleep(250);
  return evalInPage((s) => { const tr = window.__stemlight.ctx.transport; const g = window.__stemlight.engine.stems().find((c) => c.id === s).trim.gain.value; const t = tr.time(); tr.pause(); return { g, t }; }, STEM);
};
const EDGE = 0.05; // stay clear of the short ramps at region edges

// Fresh page on Dvořák, saved state cleared, tutorial skipped.
try { iw('xr', 'exit'); } catch { /* not in a session */ }
try { evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99'); location.href = '/?piece=dvorak9'; return true; }); } catch { /* navigation */ }
await sleep(6000);
for (let i = 0; i < 40; i++) {
  try { if (evalInPage(() => !!window.__stemlight && window.__stemlight.engine.stems().length > 0 && location.search.includes('dvorak9'))) break; } catch { /* loading */ }
  await sleep(500);
}
await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
const hands = devHands();
const REST = { left: [-0.3, 0.9, -0.15], right: [0.3, 0.9, -0.15] };
for (const side of ['left', 'right']) setHand(hands, side, { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, anchor: 'grasp', position: REST[side] });
const hand = (side, p, pinched) => setHand(hands, side, { position: p, poseId: pinched ? 'pinch' : 'open' });

const vln = byKind('creature').find((t) => t.stem === STEM);
let from = since();
iw('xr', 'look-at', { device: 'headset', target: { x: vln.center[0], y: vln.center[1], z: vln.center[2] } });
await sleep(2500); // summon dwell + the ribbon glides to the summon pose
log(`summon ${STEM}: ${events(from, 'gaze:summon').some((e) => e.stem === STEM) ? 'yes' : 'NO'}`);
evalInPage(() => { const t = window.__stemlight.ctx.transport; if (!t.playing()) t.play(); });
await sleep(800);
evalInPage(() => window.__stemlight.ctx.transport.pause());

iw('ecs', 'pause');
const kept = [];
for (let i = 0; i < 20; i++) {
  const T = 12 + 6.5 * i; // 12 .. 135.5 s, regions never overlap
  evalInPage((T) => window.__stemlight.ctx.transport.seek(T), T);
  step(3); // the lane's tCenter follows the seek
  const lane = byKind('lane')[0];
  if (!lane || lane.stem !== STEM) { check('lane for the summoned stem', false, JSON.stringify(lane?.stem)); continue; }
  const ld = dir(lane);
  const A = add(lane.center, scale(ld, -0.06)), B = add(lane.center, scale(ld, 0.06));
  from = since();
  hand('left', A, true); step(1);
  hand('right', B, true); step(12);
  check('cut:preview while both hands pinch', events(from, 'cut:preview').some((p) => p?.stem === STEM));
  hand('left', A, false); step(4);
  hand('right', REST.right, false); hand('left', REST.left, false); step(8);
  const cut = events(from, 'cut:add')[0]?.cut ?? null;
  check(`release -> cut:add on ${STEM}`, cut?.stem === STEM, JSON.stringify(cut));
  if (!cut) continue;
  step(2);
  const region = byKind('region').find((r) => r.id === `region:${cut.id}`);
  check('hollow region target registered', !!region);
  const isIn = (r) => r.t > cut.t0 + EDGE && r.t < cut.t1 - EDGE;
  const isOut = (r) => r.t < cut.t0 - EDGE || r.t > cut.t1 + EDGE;
  // A slow harness call can land a reading past the region (seen once: 9.5 s late on the first call); retry.
  let inside = await gainAt(cut.t0);
  for (let k = 0; k < 2 && !isIn(inside); k++) inside = await gainAt(cut.t0);
  const outside = await gainAt(cut.t0 - 3);
  check('a reading landed inside the region', isIn(inside), `cut ${i + 1} read at ${inside.t.toFixed(2)}`);
  check('a reading landed outside the region', isOut(outside), `cut ${i + 1} read at ${outside.t.toFixed(2)}`);
  if (isIn(inside)) check('region silent on playback (trim gain 0 inside)', inside.g < 0.001, `cut ${i + 1}: ${inside.g}`);
  if (isOut(outside)) check('outside the region stays full (trim gain 1)', Math.abs(outside.g - 1) < 0.001, `cut ${i + 1}: ${outside.g}`);
  log(`cut ${i + 1}: ${cut.t0.toFixed(3)}-${cut.t1.toFixed(3)} s; gain ${inside.g.toFixed(4)} at ${inside.t.toFixed(2)} s, ${outside.g.toFixed(4)} at ${outside.t.toFixed(2)} s`);

  if (i % 2 === 1) {
    // Undo straight away: back to where the cut was made, pull the region 13 cm off.
    evalInPage((T) => window.__stemlight.ctx.transport.seek(T), T);
    step(3);
    const r = byKind('region').find((x) => x.id === `region:${cut.id}`);
    if (!r) { check('pull the region away -> cut:remove', false, 'region not in view'); kept.push(cut); continue; }
    from = since();
    hand('right', r.center, true); step(3);
    hand('right', add(r.center, [0, 0.07, 0]), true); step(3);
    hand('right', add(r.center, [0, 0.13, 0]), true); step(3);
    hand('right', REST.right, false); step(6);
    const removed = events(from, 'cut:remove').some((e) => e.id === cut.id);
    check('pull the region away -> cut:remove', removed);
    check('region target gone after undo', !byKind('region').some((x) => x.id === `region:${cut.id}`));
    const back = await gainAt(cut.t0);
    check('undone region plays again (trim gain 1)', Math.abs(back.g - 1) < 0.001 && back.t > cut.t0 && back.t < cut.t1, `cut ${i + 1}: ${back.g} at ${back.t.toFixed(2)}`);
    log(`  undo ${(i + 1) / 2}: cut:remove ${removed ? 'yes' : 'NO'}, gain ${back.g.toFixed(4)} at ${back.t.toFixed(2)} s`);
    if (!removed) kept.push(cut);
  } else kept.push(cut);
}
iw('ecs', 'resume');
const cuts = evalInPage(() => window.__stemlight.parts.cuts().map((c) => c.id));
check('10 cuts kept at the end', cuts.length === 10 && kept.every((c) => cuts.includes(c.id)), `${cuts.length} kept`);
setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });

log('');
let failed = 0;
for (const [name, { pass, fail }] of Object.entries(tally)) { log(`${fail ? 'FAIL' : 'PASS'}  ${name}: ${pass}/${pass + fail}`); failed += fail; }
writeFileSync(new URL(`${DATE}-trim-20.txt`, OUT), lines.join('\n') + '\n');
process.exitCode = failed ? 1 : 0;

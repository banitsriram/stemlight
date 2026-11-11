// IWER scenario on the REAL remake surfaces (src/ui/remake): summon perc, two-hand cut on its lane,
// pads appear and a strike lands, pull the hollow region away to undo, pinch-drag the playhead, hold
// the reset shell. Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/remake-real.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { devHands, enterXR, evalInPage, inputLog, iw, setHand, sleep } from './harness.mjs';

const results = [];
const lines = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`;
  lines.push(line);
  console.log(line);
};
const since = () => Date.now() - 1;
const events = (from, kind) => inputLog(from).filter((e) => e.event === kind).map((e) => e.data);
const step = (frames) => { for (let n = frames; n > 0; n -= 120) iw('ecs', 'step', { count: Math.min(120, n) }); };
const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (v, k) => v.map((x) => x * k);
const targets = () => evalInPage(() => window.__stemlight.ctx.registry.all());
const byKind = (kind) => targets().filter((t) => t.kind === kind);
const dir = (t) => [t.extra?.dx ?? 1, t.extra?.dy ?? 0, t.extra?.dz ?? 0];
const transportNow = () => evalInPage(() => ({ t: window.__stemlight.ctx.transport.time(), playing: window.__stemlight.ctx.transport.playing() }));
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const shot = (name) => {
  try {
    const r = iw('browser', 'screenshot', { format: 'png' });
    const file = new URL(`${DATE}-remake-${name}.png`, OUT);
    writeFileSync(file, Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
    return `results/${DATE}-remake-${name}.png`;
  } catch (e) { return `screenshot failed: ${String(e.message).slice(0, 80)}`; }
};
/** Lets the app run for real for a moment (the music clock never pauses), then pauses the ECS again. */
const live = async (ms) => { iw('ecs', 'resume'); await sleep(ms); iw('ecs', 'pause'); };

// Clean start: no saved mix, a fresh page, nothing summoned yet.
try { iw('xr', 'end-session'); } catch { /* not in a session */ }
try { evalInPage(() => { indexedDB.deleteDatabase('stemlight'); setTimeout(() => location.reload(), 50); return true; }); } catch { /* the reload cuts the call */ }
await sleep(6000);
for (let i = 0; i < 40; i++) {
  try { if (evalInPage(() => !!document.querySelector('#landing button') && !!window.__stemlight)) break; } catch { /* page still loading */ }
  await sleep(500);
}
await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
const hands = devHands();
const REST = { left: [-0.3, 0.9, -0.15], right: [0.3, 0.9, -0.15] };
for (const side of ['left', 'right']) {
  setHand(hands, side, { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, anchor: 'grasp', position: REST[side] });
}
const hand = (side, p, pinched) => setHand(hands, side, { position: p, poseId: pinched ? 'pinch' : 'open' });
await sleep(500);
const statsBefore = evalInPage(() => window.__stemlight.stats());

// ---- summon perc: the lane follows the summoned stem ----
const perc = byKind('creature').find((t) => t.stem === 'perc');
let t = since();
iw('xr', 'look-at', { device: 'headset', target: { x: perc.center[0], y: perc.center[1], z: perc.center[2] } });
await sleep(1800);
check('summon perc', events(t, 'gaze:summon').some((e) => e.stem === 'perc'));
let lane = byKind('lane')[0];
check('a lane is registered for the summoned stem', !!lane && lane.stem === 'perc', JSON.stringify(lane && { id: lane.id, stem: lane.stem, extra: lane.extra }));
const playhead = byKind('playhead')[0];
check('a playhead is registered (about 6 cm)', !!playhead && Math.abs(playhead.radius - 0.06) < 0.02, JSON.stringify(playhead && { center: playhead.center, radius: playhead.radius }));
const shell = byKind('reset')[0];
check('the reset shell is registered', !!shell, JSON.stringify(shell?.center));
if (!transportNow().playing) evalInPage(() => window.__stemlight.ctx.transport.play());
await sleep(300);

await sleep(1500); // the ribbon glides to the summon pose; let it settle before reading the lane
iw('ecs', 'pause');
let cut = null;
try {
  // ---- two-hand cut on the real lane ----
  const trimLane = (label) => {
    lane = byKind('lane')[0];
    const ld = dir(lane);
    const A = add(lane.center, scale(ld, -0.08)), B = add(lane.center, scale(ld, 0.08));
    const from = since();
    hand('left', A, true); step(1);
    hand('right', B, true); step(12);
    check(`${label}: cut:preview while both hands pinch the lane`, events(from, 'cut:preview').some((p) => p && p.stem === 'perc'));
    hand('left', A, false); step(4);
    hand('right', REST.right, false); hand('left', REST.left, false); step(8);
    const c = events(from, 'cut:add')[0]?.cut ?? null;
    check(`${label}: release -> cut:add on perc`, !!c && c.stem === 'perc', JSON.stringify(c));
    return c;
  };
  cut = trimLane('cut 1');
  await live(800); // the take seeks to the count-in; let the surfaces catch up with the clock
  // The music clock runs between harness calls and regions scroll with it, so hold the music still
  // while the region is checked and pulled (a person pulls it in well under a second).
  evalInPage(() => window.__stemlight.ctx.transport.pause());
  step(2);
  const region = cut && byKind('region').find((r) => r.id === `region:${cut.id}`);
  check('a hollow region target appears for the cut', !!region, JSON.stringify(region && { center: region.center, extra: region.extra }));
  lines.push(`screenshot region: ${shot('region')}`);

  // ---- undo straight away: pull the region 13 cm off ----
  if (region) {
    t = since();
    hand('right', region.center, true); step(3);
    hand('right', add(region.center, [0, 0.07, 0]), true); step(3);
    hand('right', add(region.center, [0, 0.13, 0]), true); step(3);
    hand('right', REST.right, false); step(6);
    check('pull the region 13 cm away -> cut:remove', events(t, 'cut:remove').some((e) => e.id === cut.id));
    check('region target gone after undo', !byKind('region').some((x) => x.id === `region:${cut.id}`));
  }
  evalInPage(() => window.__stemlight.ctx.transport.play());
  await live(800);
  cut = trimLane('cut 2');
  await live(800);

  // ---- pads: shown after the perc cut; a strike lands ----
  const pads = byKind('pad');
  check('2 pads (the timpani pair) appear after the perc cut', pads.length === 2, JSON.stringify(pads.map((p) => p.extra?.pitch)));
  const taking = evalInPage(() => window.__stemlight.parts.taking());
  check('a pads take is running', taking?.instrument === 'pads', JSON.stringify(taking));
  if (pads.length) {
    const pad = pads[0];
    const n = dir(pad).some((x) => x !== 0) && pad.extra?.dx !== undefined ? dir(pad) : [0, 1, 0];
    t = since();
    setHand(hands, 'right', { anchor: 'index-tip', poseId: 'point', position: add(pad.center, scale(n, 0.04)) }); step(3);
    for (let k = 0.03; k >= -0.03; k -= 0.01) { setHand(hands, 'right', { position: add(pad.center, scale(n, k)) }); step(1); }
    step(10);
    const strikes = events(t, 'pad:strike');
    check('index tip down through a real pad -> one strike', strikes.length === 1, JSON.stringify(strikes));
    lines.push(`screenshot pads: ${shot('pads')}`);
    setHand(hands, 'right', { anchor: 'grasp', poseId: 'open', position: REST.right }); step(4);
  }

  await live(300);
  const ph = byKind('playhead')[0];
  if (ph) {
    const pd = dir(ph), spm = ph.extra?.secPerM ?? 0;
    hand('right', ph.center, true); step(4);
    const before = transportNow();
    check('pinch the real playhead -> paused', before.playing === false, JSON.stringify(before));
    hand('right', add(ph.center, scale(pd, 0.03)), true); step(3);
    hand('right', add(ph.center, scale(pd, 0.06)), true); step(3);
    const after = transportNow();
    const want = 0.06 * spm;
    check(`drag 6 cm -> time +${want.toFixed(2)} s (within 50 ms)`, Math.abs(after.t - before.t - want) <= 0.05, `${(after.t - before.t).toFixed(3)} s`);
    hand('right', add(ph.center, scale(pd, 0.06)), false); step(4);
    check('release -> playing again', transportNow().playing === true);
    hand('right', REST.right, false); step(4);
  }

  // ---- reset shell: hold 2 s ----
  const sh = byKind('reset')[0];
  if (sh) {
    t = since();
    hand('right', sh.center, true); step(150);
    hand('right', sh.center, false); step(4);
    check('hold the real reset shell 2 s -> app:reset', events(t, 'app:reset').length === 1);
    hand('right', REST.right, false); step(4);
  }
} finally {
  iw('ecs', 'resume');
}

await sleep(500);
const statsAfter = evalInPage(() => window.__stemlight.stats());
lines.push(`stats before surfaces visible: ${JSON.stringify(statsBefore)}`);
lines.push(`stats after (pads + ribbon shown): ${JSON.stringify(statsAfter)}  (emulator page, not a device number)`);
console.log(lines.slice(-2).join('\n'));
setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });
const failed = results.filter((r) => !r.ok).length;
lines.push(`${results.length - failed}/${results.length} passed`);
console.log(`\n${results.length - failed}/${results.length} passed`);
writeFileSync(new URL(`${DATE}-remake-real.txt`, OUT), lines.join('\n') + '\n');
process.exitCode = failed ? 1 : 0;

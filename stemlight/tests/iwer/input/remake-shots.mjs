// Visual evidence for the remake surfaces (F09, F10, F11, F15, F34, F36, F40 visual halves): looks DOWN at the
// ribbon and pads (the gesture runs in remake-real.mjs look at the creature instead) and captures each state.
// Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/remake-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { devHands, enterXR, evalInPage, inputLog, iw, setHand, sleep } from './harness.mjs';

const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const shot = (name) => {
  const r = iw('browser', 'screenshot', { format: 'png' });
  writeFileSync(new URL(`${DATE}-shot-${name}.png`, OUT), Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
  log(`shot ${name}: results/${DATE}-shot-${name}.png`);
};
const step = (n) => { for (; n > 0; n -= 120) iw('ecs', 'step', { count: Math.min(120, n) }); };
const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (v, k) => v.map((x) => x * k);
const byKind = (kind) => evalInPage((k) => window.__stemlight.ctx.registry.all().filter((t) => t.kind === k), kind);
const dir = (t) => [t.extra?.dx ?? 1, t.extra?.dy ?? 0, t.extra?.dz ?? 0];
const look = (p) => iw('xr', 'look-at', { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } });

try { iw('xr', 'exit'); } catch { /* not in a session */ }
try { evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99'); location.href = '/?piece=dvorak9'; return true; }); } catch { /* navigation */ }
await sleep(6000);
for (let i = 0; i < 40; i++) {
  try { if (evalInPage(() => !!window.__stemlight && window.__stemlight.engine.stems().length > 0)) break; } catch { /* loading */ }
  await sleep(500);
}
await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
const hands = devHands();
const REST = { left: [-0.3, 0.9, -0.15], right: [0.3, 0.9, -0.15] };
for (const side of ['left', 'right']) setHand(hands, side, { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, anchor: 'grasp', position: REST[side] });
const hand = (side, p, pinched) => setHand(hands, side, { position: p, poseId: pinched ? 'pinch' : 'open' });

const perc = byKind('creature').find((t) => t.stem === 'perc');
look(perc.center);
await sleep(2500); // summon + the ribbon glides to the summon pose
evalInPage(() => { const t = window.__stemlight.ctx.transport; t.seek(60); if (!t.playing()) t.play(); });
await sleep(1500);
let lane = byKind('lane')[0];
look(add(lane.center, [0, 0.05, 0]));
await sleep(800);
shot('1-ribbon-lane'); // F09/F10: ribbon, playhead bead, the summoned stem's lane with its notes

// Pinch the playhead and hold: it brightens, the music pauses.
const ph = byKind('playhead')[0];
iw('ecs', 'pause');
hand('right', ph.center, true); step(6);
iw('ecs', 'resume');
await sleep(300);
shot('2-playhead-held'); // F09 visual
iw('ecs', 'pause'); hand('right', REST.right, false); step(4); iw('ecs', 'resume');
await sleep(500);

// Two-hand cut on the lane: preview, then a hollow region with ghost outlines; the take starts (count-in).
lane = byKind('lane')[0];
const ld = dir(lane);
iw('ecs', 'pause');
hand('left', add(lane.center, scale(ld, -0.08)), true); step(1);
hand('right', add(lane.center, scale(ld, 0.08)), true); step(8);
iw('ecs', 'resume');
await sleep(200);
shot('3-cut-preview'); // F10: preview span while both hands pinch
iw('ecs', 'pause');
hand('left', REST.left, false); step(2); hand('right', REST.right, false); step(6);
iw('ecs', 'resume');
await sleep(600);
const pads = byKind('pad');
const mid = pads.length ? scale(pads.reduce((a, p) => add(a, p.center), [0, 0, 0]), 1 / pads.length) : lane.center;
look(add(mid, [0, 0.08, 0]));
await sleep(500);
shot('4-region-pads-countin'); // F10 hollow region + F36 ghost outlines + F11 pads + F34 count-in ring

// Strike a pad during the take: flash + amber note flying from the fingertip into the outlines.
if (pads.length) {
  const pad = pads[0];
  const since = Date.now() - 1;
  iw('ecs', 'pause');
  setHand(hands, 'right', { anchor: 'index-tip', poseId: 'point', position: add(pad.center, [0, 0.04, 0]) }); step(3);
  for (let k = 0.03; k >= -0.03; k -= 0.01) { setHand(hands, 'right', { position: add(pad.center, [0, k, 0]) }); step(1); }
  // The flash lasts 0.25 s and the flight 0.4 s: capture while the ECS is still paused, a few frames after contact,
  // so screenshot latency can't let them finish first.
  step(2);
  await sleep(300); // let a frame render the paused state
  shot('5-pad-hit-amber'); // F11 + F15
  iw('ecs', 'resume');
  log(`pad strikes: ${JSON.stringify(inputLog(since).filter((e) => e.event === 'pad:strike').map((e) => e.data))}`);
  iw('ecs', 'pause'); setHand(hands, 'right', { anchor: 'grasp', poseId: 'open', position: REST.right }); step(4); iw('ecs', 'resume');
}

// Reset shell: hold about 1 s so the ring is half full, capture, then release (no reset).
const sh = byKind('reset')[0];
look(sh.center);
await sleep(500);
iw('ecs', 'pause');
hand('right', sh.center, true); step(72);
iw('ecs', 'resume');
await sleep(100);
shot('6-reset-ring-half'); // F40 visual
iw('ecs', 'pause'); hand('right', REST.right, false); step(4); iw('ecs', 'resume');

setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });
writeFileSync(new URL(`${DATE}-shots.txt`, OUT), lines.join('\n') + '\n');

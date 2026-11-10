// IWER scenario for the pinch gestures on registered targets: EQ stretch and reset, ribbon pause / scrub / tap,
// trim and undo, a pad strike and the quiet reset (biyon-15, 16, 23, 24, 29).
// The playhead, lane, region, pad and reset targets are synthetic: registered here through the page, since
// B's colliders for them aren't in yet. Needs a dev session started with --allow-browser-automation.
// Run: node tests/iwer/input/targets.mjs
import { addTargets, devHands, enterXR, evalInPage, inputLog, iw, reachSpot, removeTargets, setHand, sleep } from './harness.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const since = () => Date.now() - 1;
const events = (from, kind) => inputLog(from).filter((e) => e.event === kind).map((e) => e.data);
const step = (frames) => { for (let n = frames; n > 0; n -= 120) iw('ecs', 'step', { count: Math.min(120, n) }); };
function paused(fn) {
  iw('ecs', 'pause');
  try { return fn(); } finally { iw('ecs', 'resume'); }
}
const add = (a, b) => a.map((x, i) => x + b[i]);
const transportNow = () => evalInPage(() => ({ t: window.__stemlight.ctx.transport.time(), playing: window.__stemlight.ctx.transport.playing() }));

await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
const hands = devHands();
const REST = { left: [-0.3, 0.9, -0.15], right: [0.3, 0.9, -0.15] };
for (const side of ['left', 'right']) {
  setHand(hands, side, { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, anchor: 'grasp', position: REST[side] });
}
/** Puts a hand's grasp point (where thumb and index meet) at p, pinched or open. */
const hand = (side, p, pinched) => setHand(hands, side, { position: p, poseId: pinched ? 'pinch' : 'open' });
await sleep(500);

// ---- EQ on the summoned creature ----
const creatures = evalInPage(() => window.__stemlight.ctx.registry.all().filter((t) => t.kind === 'creature'));
const first = creatures[0];
iw('xr', 'look-at', { device: 'headset', target: { x: first.center[0], y: first.center[1], z: first.center[2] } });
await sleep(1500);
const spot = reachSpot();
let t = since();
paused(() => {
  hand('left', add(spot, [-0.05, 0, 0]), true); step(1);
  hand('right', add(spot, [0.05, 0, 0]), true); step(6); // second pinch 7 frames after the first: one stretch
  for (const x of [0.07, 0.09, 0.11, 0.13, 0.15]) { hand('left', add(spot, [-x, 0, 0]), true); step(1); hand('right', add(spot, [x, 0, 0]), true); step(3); }
  hand('right', add(spot, [0.15, 0, 0]), false); step(3); // release commits
  hand('left', REST.left, false); hand('right', REST.right, false); step(6);
});
let eq = events(t, 'stem:eq');
const committed = eq.at(-1);
check(`EQ stretch on ${first.stem}: 10 cm -> 30 cm wide raises low (+8 dB expected)`, !!committed && committed.stem === first.stem && Math.abs(committed.low - 8) < 1.5 && Math.abs(committed.high) < 1.5 && committed.mid === 0, `${eq.length} events, last ${JSON.stringify(committed)}`);
t = since();
paused(() => {
  hand('left', add(spot, [-0.15, 0, 0]), true); step(1);
  hand('right', add(spot, [0.15, 0, 0]), true); step(6);
  for (const x of [0.1, 0.05, 0.02]) { hand('left', add(spot, [-x, 0, 0]), true); step(1); hand('right', add(spot, [x, 0, 0]), true); step(3); }
  hand('left', REST.left, false); hand('right', REST.right, false); step(6);
});
eq = events(t, 'stem:eq');
check('EQ reset: both pinches brought within 6 cm -> 0/0/0', eq.some((e) => e.low === 0 && e.mid === 0 && e.high === 0), JSON.stringify(eq.at(-1)));
check('no solo or mute during EQ', events(t - 60000, 'stem:solo').length === 0 && events(t - 60000, 'stem:mute').length === 0);

// ---- ribbon: hold, drag, tap ----
const PLAYHEAD = [0.25, 1.15, -0.35];
const LANE = [0, 1.0, -0.4];
const PAD = [0.2, 0.85, -0.3];
const SHELL = [0.35, 0.65, -0.1];
const laneStem = creatures.at(-1).stem;
addTargets([
  { id: 'playhead', kind: 'playhead', center: PLAYHEAD, radius: 0.06, extra: { dx: 1, dy: 0, dz: 0, secPerM: 10 } },
  { id: `lane:${laneStem}`, kind: 'lane', stem: laneStem, center: LANE, radius: 0.04, extra: { dx: 1, dy: 0, dz: 0, halfLength: 0.3, secPerM: 20, tCenter: 10 } },
  { id: 'pad:test', kind: 'pad', center: PAD, radius: 0.06, extra: { pitch: 38 } },
  { id: 'reset', kind: 'reset', center: SHELL, radius: 0.05 },
]);
if (!transportNow().playing) evalInPage(() => window.__stemlight.ctx.transport.play());
await sleep(300);
iw('ecs', 'pause');
try {
  t = since();
  hand('right', PLAYHEAD, true); step(4);
  const before = transportNow();
  check('ribbon pinch -> transport paused', before.playing === false, JSON.stringify(before));
  hand('right', add(PLAYHEAD, [0.03, 0, 0]), true); step(3);
  hand('right', add(PLAYHEAD, [0.06, 0, 0]), true); step(3);
  const after = transportNow();
  check('ribbon drag 6 cm at 10 s/m -> time +0.6 s (within 50 ms)', Math.abs(after.t - before.t - 0.6) <= 0.05, `${(after.t - before.t).toFixed(3)} s`);
  hand('right', add(PLAYHEAD, [0.06, 0, 0]), false); step(4);
  check('ribbon release after a drag -> playing again', transportNow().playing === true);
  hand('right', PLAYHEAD, true); step(6); // 83 ms, still: a tap
  hand('right', PLAYHEAD, false); step(4);
  const tapped = transportNow();
  hand('right', PLAYHEAD, true); step(6);
  hand('right', PLAYHEAD, false); step(4);
  const tappedAgain = transportNow();
  check('ribbon tap toggles pause, tap again plays', tapped.playing === false && tappedAgain.playing === true, `${tapped.playing} then ${tappedAgain.playing}`);
  hand('right', REST.right, false); step(4);

  // ---- trim and undo ----
  t = since();
  hand('left', add(LANE, [-0.1, 0, 0]), true); step(1); // t = 8
  hand('right', add(LANE, [0.1, 0, 0]), true); step(10); // t = 12, within 0.6 s
  const previews = events(t, 'cut:preview');
  check(`trim on lane:${laneStem} -> cut:preview while held`, previews.some((p) => p && p.stem === laneStem), JSON.stringify(previews.at(-1)));
  hand('left', add(LANE, [-0.1, 0, 0]), false); step(4);
  hand('right', REST.right, false); hand('left', REST.left, false); step(4);
  const added = events(t, 'cut:add');
  const cut = added[0]?.cut;
  check('trim release -> cut:add (beat-snapped, about 8 s to 12 s)', added.length === 1 && cut.stem === laneStem && Math.abs(cut.t0 - 8) < 0.8 && Math.abs(cut.t1 - 12) < 0.8, JSON.stringify(cut));
  const hasCut = (id) => evalInPage((cutId) => window.__stemlight.parts.cuts().some((c) => c.id === cutId), id);
  if (cut) {
    check('the audio side took the cut', hasCut(cut.id) === true);
    addTargets([{ id: `region:${cut.id}`, kind: 'region', stem: laneStem, center: add(LANE, [0, 0.06, 0]), radius: 0.03, extra: { dx: 1, halfLength: 0.1 } }]);
    t = since();
    hand('right', add(LANE, [0, 0.06, 0]), true); step(3);
    hand('right', add(LANE, [0, 0.12, 0]), true); step(3);
    hand('right', add(LANE, [0, 0.19, 0]), true); step(3); // 13 cm off
    hand('right', REST.right, false); step(4);
    const removed = events(t, 'cut:remove');
    check('undo: region pulled 13 cm off -> cut:remove', removed.length === 1 && removed[0].id === cut.id, JSON.stringify(removed));
    check('the audio side dropped the cut', hasCut(cut.id) === false);
    removeTargets([`region:${cut.id}`]);
  }

  // ---- pad strike ----
  t = since();
  setHand(hands, 'right', { anchor: 'index-tip', poseId: 'point', position: add(PAD, [0, 0.04, 0]) }); step(3);
  for (let y = 0.03; y >= -0.03; y -= 0.01) { setHand(hands, 'right', { position: add(PAD, [0, y, 0]) }); step(1); } // 1 cm a frame
  setHand(hands, 'right', { position: add(PAD, [0, -0.03, 0]) }); step(10);
  const strikes = events(t, 'pad:strike');
  check('pad: index tip down through the pad -> one strike, pitch 38', strikes.length === 1 && strikes[0].pitch === 38, JSON.stringify(strikes));
  setHand(hands, 'right', { anchor: 'grasp', poseId: 'open', position: REST.right }); step(4);

  // ---- quiet reset ----
  t = since();
  hand('right', SHELL, true); step(70); // about 1 s
  hand('right', SHELL, false); step(4);
  const early = events(t, 'reset:progress');
  check('reset: released at about 1 s -> progress back to 0, no reset', early.at(-1)?.progress === 0 && events(t, 'app:reset').length === 0, JSON.stringify(early));
  t = since();
  hand('right', SHELL, true); step(150); // about 2.1 s
  hand('right', SHELL, false); step(4);
  const resets = events(t, 'app:reset');
  check('reset: held 2 s -> reset:progress 1 and app:reset', events(t, 'reset:progress').some((e) => e.progress === 1) && resets.length === 1, JSON.stringify(resets));
  hand('right', REST.right, false); step(4);
} finally {
  iw('ecs', 'resume');
}

removeTargets(['playhead', `lane:${laneStem}`, 'pad:test', 'reset']);
setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;

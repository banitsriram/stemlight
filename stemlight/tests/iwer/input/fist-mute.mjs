// IWER scenario: summon a creature by head direction, then fist it with DevHandPose and check the bus.
// Run against a dev session: node tests/iwer/input/fist-mute.mjs
// Timing-sensitive parts pause the ECS and step it, so gesture time is exact (1/72 s per step)
// however slow the CLI round trips are.
import { devHands, enterXR, inputLog, iw, reachSpot, setHand, sleep } from './harness.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const since = () => Date.now() - 1;
const events = (from, kind) => inputLog(from).filter((e) => e.event === kind);

/** Pause, run fn (which may step), then resume. */
function paused(fn) {
  iw('ecs', 'pause');
  try { return fn(); } finally { iw('ecs', 'resume'); }
}
const step = (frames) => {
  for (let left = frames; left > 0; left -= 120) iw('ecs', 'step', { count: Math.min(120, left) });
};

await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
const hands = devHands();
console.log('DevHandPose entities', hands);

// The right hand rests low and to the side, open.
setHand(hands, 'right', { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, position: [0.3, 0.9, -0.15] });
setHand(hands, 'left', { enabled: true, poseId: 'open', connected: true, place: true, position: [-0.3, 0.9, -0.15] });
await sleep(500);

// 1. Fist and partial curl read back (biyon-4).
let t0 = since();
setHand(hands, 'right', { poseId: 'fist' });
await sleep(400);
const fistPose = iw('xr', 'get-hand-state', { device: 'hand-right' });
const fistLog = events(t0, 'hand:pose').filter((e) => e.data.hand === 'right').at(-1);
check('DevHandPose fist -> IWER pose fist', fistPose.poseId === 'fist', `poseId ${fistPose.poseId}`);
check('DevHandPose fist -> hand:pose curl >= 0.75', fistLog?.data.curl >= 0.75, `curl ${fistLog?.data.curl}`);
t0 = since();
setHand(hands, 'right', { poseId: 'open', curl: 0.6 });
await sleep(400);
const partial = events(t0, 'hand:pose').filter((e) => e.data.hand === 'right').at(-1);
check('partial curl 0.6 -> hand:pose curl between the thresholds', partial && partial.data.curl > 0.45 && partial.data.curl < 0.75, `curl ${partial?.data.curl}`);
setHand(hands, 'right', { curl: -1 });

// 2. Look to summon (biyon-11): turn the head to the violins' seat.
const VLN = { x: -0.94, y: 1.0, z: -1.294 };
t0 = since();
iw('xr', 'look-at', { device: 'headset', target: VLN });
await sleep(1500);
const summons = events(t0, 'gaze:summon');
check('head on vln for 0.5 s -> gaze:summon vln', summons.length === 1 && summons[0].data.stem === 'vln', JSON.stringify(summons.map((e) => e.data)));

// 3. Fist on the summoned creature at the reach spot (biyon-12). Each check runs inside one paused block,
// so no real-time frames slip in between the steps.
const spot = reachSpot();
setHand(hands, 'right', { position: spot });
await sleep(500);
paused(() => {
  let t = since();
  setHand(hands, 'right', { poseId: 'fist' });
  step(3 + 36); // fist applied, 80 ms debounce, then 0.5 s of hold
  let mutes = events(t, 'stem:mute');
  check('fist on summoned vln -> stem:mute held', mutes.length === 1 && mutes[0].data.stem === 'vln' && mutes[0].data.state === 'held', JSON.stringify(mutes.map((e) => e.data)));
  t = since();
  step(80); // 1.6 s since the fist closed
  mutes = events(t, 'stem:mute');
  check('held 1.5 s -> stem:mute locked', mutes.length === 1 && mutes[0].data.state === 'locked' && mutes[0].data.lockProgress === 1, JSON.stringify(mutes.map((e) => e.data)));
  t = since();
  setHand(hands, 'right', { poseId: 'open' });
  step(30);
  check('open after lock -> no event, stays locked', events(t, 'stem:mute').length === 0);
  t = since();
  setHand(hands, 'right', { poseId: 'fist' });
  step(20);
  setHand(hands, 'right', { poseId: 'open' });
  step(10);
  mutes = events(t, 'stem:mute');
  check('fist on locked vln -> stem:mute on', mutes.length === 1 && mutes[0].data.state === 'on', JSON.stringify(mutes.map((e) => e.data)));

  // 4. Open before 1.5 s returns it.
  t = since();
  setHand(hands, 'right', { poseId: 'fist' });
  step(40);
  setHand(hands, 'right', { poseId: 'open' });
  step(10);
  mutes = events(t, 'stem:mute').map((e) => e.data.state);
  check('fist 0.5 s then open -> held, on', mutes.join() === 'held,on', mutes.join());

  // 5. Tracking gaps (biyon-10): up to 0.3 s holds, longer is a quiet release with no lock.
  // The emulator drops and restores the hand on its own frames while the paused ECS keeps gesture time still.
  const gap = (frames) => {
    setHand(hands, 'right', { connected: false });
    step(1);
    execSleep(300);
    step(frames - 1);
    setHand(hands, 'right', { connected: true });
    step(1);
    execSleep(300);
    step(3);
  };
  t = since();
  setHand(hands, 'right', { poseId: 'fist' });
  step(30);
  gap(Math.round(0.25 * 72));
  mutes = events(t, 'stem:mute').map((e) => e.data.state);
  let tracked = events(t, 'hand:pose').filter((e) => e.data.hand === 'right').map((e) => e.data.tracked);
  check('fist held, 0.25 s tracking gap -> still held, pose never untracked', mutes.join() === 'held' && !tracked.includes(false), `${mutes.join()} tracked ${tracked.join()}`);
  t = since();
  gap(Math.round(0.5 * 72));
  mutes = events(t, 'stem:mute').map((e) => e.data.state);
  tracked = events(t, 'hand:pose').filter((e) => e.data.hand === 'right').map((e) => e.data.tracked);
  check('0.5 s tracking gap -> quiet release (on, never locked)', mutes.join() === 'on' && tracked.includes(false), `${mutes.join()} tracked ${tracked.join()}`);
  setHand(hands, 'right', { poseId: 'open' });
  step(10);
});

function execSleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// Leave the emulator as found.
setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;

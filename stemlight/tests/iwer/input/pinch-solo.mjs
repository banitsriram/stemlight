// IWER scenario: pinch and double-pinch solo on the summoned creature, driven by DevHandPose.
// Run against a dev session: node tests/iwer/input/pinch-solo.mjs [rounds]
// All timing runs inside paused ECS blocks (1/72 s per step), so CLI round trips don't count as gesture time.
import { devHands, enterXR, inputLog, iw, reachSpot, setHand, sleep, stepAlternate } from './harness.mjs';

const ROUNDS = Number(process.argv[2] ?? 5);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const since = () => Date.now() - 1;
const events = (from, kind) => inputLog(from).filter((e) => e.event === kind);
const execSleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function paused(fn) {
  iw('ecs', 'pause');
  try { return fn(); } finally { iw('ecs', 'resume'); }
}
const step = (frames) => iw('ecs', 'step', { count: frames });

await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
const hands = devHands();
setHand(hands, 'left', { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, position: [-0.3, 0.9, -0.15] });
setHand(hands, 'right', { enabled: true, poseId: 'open', curl: -1, connected: true, place: true, position: [0.3, 0.9, -0.15] });
const lookedAt = since();
iw('xr', 'look-at', { device: 'headset', target: { x: 0.94, y: 1.0, z: -1.294 } }); // the reeds
await sleep(1500);
const spot = reachSpot();
setHand(hands, 'right', { position: spot, anchor: 'wrist' });
await sleep(500);
const summons = events(lookedAt, 'gaze:summon').map((e) => e.data.stem);
check('head on reeds for 0.5 s -> gaze:summon reeds', summons.join() === 'reeds', summons.join());

/** pinch 6 frames, open `gapFrames`, pinch 6 frames, open 40 frames (past the 450 ms window). */
const doublePinch = (gapFrames = 12, between) => {
  setHand(hands, 'right', { poseId: 'pinch' });
  step(6);
  setHand(hands, 'right', { poseId: 'open' });
  if (between) between(); else step(gapFrames);
  setHand(hands, 'right', { poseId: 'pinch' });
  step(6);
  setHand(hands, 'right', { poseId: 'open' });
  step(40);
};

paused(() => {
  // Single pinches: pinching shows on hand:pose, never a mute or a solo.
  let t = since();
  for (let i = 0; i < ROUNDS; i++) {
    setHand(hands, 'right', { poseId: 'pinch' });
    step(20);
    setHand(hands, 'right', { poseId: 'open' });
    step(40);
  }
  const pinchPoses = events(t, 'hand:pose').filter((e) => e.data.hand === 'right' && e.data.pinching).length;
  check(`${ROUNDS} pinches -> pinching on hand:pose each time`, pinchPoses === ROUNDS, `${pinchPoses}`);
  check(`${ROUNDS} pinches -> 0 mutes, 0 solos`, events(t, 'stem:mute').length === 0 && events(t, 'stem:solo').length === 0);

  // Double-pinch sets, the next one clears.
  t = since();
  for (let i = 0; i < 2 * ROUNDS; i++) doublePinch();
  const solos = events(t, 'stem:solo').map((e) => e.data.stem);
  const want = Array.from({ length: 2 * ROUNDS }, (_, i) => (i % 2 ? null : 'reeds'));
  check(`${ROUNDS} solos set and ${ROUNDS} cleared`, JSON.stringify(solos) === JSON.stringify(want), JSON.stringify(solos));

  // A tracking gap between the two pinch-downs cancels it.
  t = since();
  for (let i = 0; i < ROUNDS; i++) {
    doublePinch(0, () => {
      step(2);
      setHand(hands, 'right', { connected: false });
      step(1);
      execSleep(200); // the emulator drops the hand on its own frames
      step(4);
      setHand(hands, 'right', { connected: true });
      step(1);
      execSleep(200);
      step(2);
    });
  }
  check(`${ROUNDS} double-pinches with an injected gap -> 0 solos`, events(t, 'stem:solo').length === 0, JSON.stringify(events(t, 'stem:solo').map((e) => e.data)));
});

// Two hands, stepped alternately: the left hand pinching spoils the right hand's double-pinch.
let t = since();
// Two ECS frames per index: pinch-downs at 0 and 10 are 0.28 s apart.
const pose = (i) => (i < 4 || (i >= 10 && i < 14) ? 'pinch' : 'open');
stepAlternate(hands, 60, () => ({ poseId: 'pinch' }), (i) => ({ poseId: pose(i) }));
check('alternate-stepped two hands: other hand busy -> 0 solos', events(t, 'stem:solo').length === 0);
t = since();
stepAlternate(hands, 60, () => ({ poseId: 'open' }), (i) => ({ poseId: pose(i) }));
const solo = events(t, 'stem:solo').map((e) => e.data.stem);
check('alternate-stepped two hands: other hand idle -> solo', solo.length === 1 && solo[0] === 'reeds', JSON.stringify(solo));
// Clear it again so the session ends with nothing soloed.
stepAlternate(hands, 60, () => ({ poseId: 'open' }), (i) => ({ poseId: pose(i) }));

setHand(hands, 'right', { enabled: false });
setHand(hands, 'left', { enabled: false });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { SPEC, createGestureEngine, reachSpotFor } from '../../src/input/engine.ts';

const manifest = JSON.parse(readFileSync(new URL('../../public/pieces/fixture/manifest.json', import.meta.url)));
const FPS = 72;
const EYE = [0, 1.2, 0];

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Rotates a direction by yaw / pitch offsets in degrees, for gaze jitter. */
function jitter(dir, yawDeg, pitchDeg) {
  const yaw = Math.atan2(dir[0], -dir[2]) + (yawDeg * Math.PI) / 180;
  const pitch = Math.asin(dir[1]) + (pitchDeg * Math.PI) / 180;
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/** A hand frame: all four fingers at `curl` (or the given four), index tip 8 cm ahead of the palm, thumb `pinch` metres from it. */
function hand({ palm, curl = 0.1, curls, pinch = 0.08 }) {
  const tip = add(palm, [0, 0, -0.08]);
  return { tracked: true, confidence: 1, palm, tip, thumbTip: add(tip, [pinch, 0, 0]), curls: curls ?? [curl, curl, curl, curl], pinchDist: pinch };
}
const PINCH_CURLS = [0.44, 0.19, 0.12, 0.17]; // IWER's pinch pose

/** A scripted session at 72 Hz over the fixture's nine creatures. */
function session({ moveSummoned = true } = {}) {
  const bus = createBus();
  const log = [];
  for (const k of ['gaze:summon', 'stem:mute', 'stem:solo']) bus.on(k, (e) => log.push({ k, ...e }));
  const poses = [];
  bus.on('hand:pose', (e) => poses.push(e));
  const near = [];
  bus.on('hand:near', (e) => near.push(e));
  const engine = createGestureEngine(bus);
  const targets = manifest.stems.map(({ id, homeSeat }) => ({ id: `creature:${id}`, kind: 'creature', stem: id, center: homeSeat, radius: 0.25 }));
  const s = {
    bus, log, poses, near, engine, targets, t: 0,
    head: { pos: EYE, dir: [0, 0, -1] },
    left: null, right: null,
    frame() {
      engine.step({ t: s.t, hands: { left: s.left, right: s.right }, head: s.head }, targets);
      s.t += 1 / FPS;
    },
    run(seconds, each) {
      const n = Math.round(seconds * FPS);
      for (let i = 0; i < n; i++) { each?.(i); s.frame(); }
    },
    events: (k) => log.filter((e) => e.k === k),
    target: (stem) => targets.find((t) => t.stem === stem),
    lookAt(stem, yaw = 0, pitch = 0) {
      s.head = { pos: EYE, dir: jitter(norm(add(s.target(stem).center, EYE.map((x) => -x))), yaw, pitch) };
    },
    /** Looks at a creature until it is summoned; B glides it to the reach spot (unless moveSummoned is false). */
    summon(stem) {
      s.lookAt(stem);
      s.run(SPEC.summonDwell + 0.1);
      const spot = reachSpotFor(s.head); // B takes the spot from the head as it summons
      s.head = { pos: EYE, dir: norm(add(spot, EYE.map((x) => -x))) }; // then looks down at it
      if (moveSummoned) s.target(stem).center = spot;
      return spot;
    },
  };
  bus.emit('piece:ready', { id: 'fixture', manifest });
  return s;
}

const muteStates = (s) => s.events('stem:mute').map((e) => e.state);
/** Collapses repeated states, so the held progress stream reads as one 'held'. */
const transitions = (s) => muteStates(s).filter((st, i, a) => i === 0 || st !== a[i - 1]);

// ---- look to summon (F32) ----

test('summon: 9 creatures x head yaw, 20/20 correct each', () => {
  const s = session({ moveSummoned: false });
  let correct = 0, trials = 0, seed = 7;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let round = 0; round < 20; round++) {
    const order = manifest.stems.map((m) => m.id);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const stem of order) {
      if (s.engine.debug().summoned === stem) continue;
      trials++;
      const before = s.events('gaze:summon').length;
      s.lookAt(stem, ((round % 5) - 2) * 2.5, ((round % 3) - 1) * 3); // up to 5 deg yaw, 3 deg pitch off
      s.run(0.6);
      const got = s.events('gaze:summon').slice(before);
      if (got.length === 1 && got[0].stem === stem) correct++;
    }
  }
  assert.equal(correct, trials);
  assert.ok(trials >= 9 * 19);
});

test('summon: needs 0.5 s within 12 deg; looking away does not dismiss; the next replaces', () => {
  const s = session({ moveSummoned: false });
  s.lookAt('fl');
  s.run(0.4);
  assert.equal(s.events('gaze:summon').length, 0, 'too short');
  s.head = { pos: EYE, dir: [0, 1, 0] }; // look up at nothing
  s.run(0.5);
  s.lookAt('harp', 13); // just outside 12 deg (harp is the outermost, so nothing else is nearer)
  s.run(1);
  assert.equal(s.events('gaze:summon').length, 0, 'outside the cone');
  s.lookAt('fl', 10);
  s.run(0.6);
  assert.deepEqual(s.events('gaze:summon').map((e) => e.stem), ['fl']);
  s.head = { pos: EYE, dir: [0, 1, 0] };
  s.run(2);
  assert.equal(s.engine.debug().summoned, 'fl', 'looking away keeps it');
  s.lookAt('brass');
  s.run(0.6);
  assert.deepEqual(s.events('gaze:summon').map((e) => e.stem), ['fl', 'brass']);
  assert.equal(s.engine.debug().summoned, 'brass');
});

// ---- fist hold, lock and return (F04, F33) ----

for (const moveSummoned of [true, false]) {
  test(`fist: 20 fist/open cycles hold then return (creature ${moveSummoned ? 'moved to' : 'not moved to'} the reach spot)`, () => {
    const s = session({ moveSummoned });
    const spot = s.summon('vln');
    for (let i = 0; i < 20; i++) {
      s.right = hand({ palm: spot, curl: 0.95 });
      s.run(0.6);
      assert.equal(s.engine.debug().mute.vln, 'held');
      s.right = hand({ palm: spot, curl: 0.1 });
      s.run(0.3);
      assert.equal(s.engine.debug().mute.vln, 'on');
    }
    const t = transitions(s);
    assert.equal(t.length, 40);
    assert.deepEqual(t, Array.from({ length: 40 }, (_, i) => (i % 2 ? 'on' : 'held')));
    assert.equal(muteStates(s).filter((x) => x === 'locked').length, 0);
    assert.ok(s.events('stem:mute').every((e) => e.stem === 'vln'));
  });
}

test('fist: 20 lock cycles stay silent after opening; a fist on a locked one returns it', () => {
  const s = session();
  const spot = s.summon('hn');
  for (let i = 0; i < 20; i++) {
    s.right = hand({ palm: spot, curl: 0.95 });
    s.run(1.7);
    assert.equal(s.engine.debug().mute.hn, 'locked');
    const n = s.events('stem:mute').length;
    s.right = hand({ palm: spot, curl: 0.1 });
    s.run(1);
    assert.equal(s.engine.debug().mute.hn, 'locked', 'stays silent after opening');
    assert.equal(s.events('stem:mute').length, n, 'opening a locked fist emits nothing');
    s.right = hand({ palm: spot, curl: 0.95 });
    s.run(0.5);
    assert.equal(s.engine.debug().mute.hn, 'on', 'fist on a locked one returns it');
    s.right = hand({ palm: spot, curl: 0.1 });
    s.run(0.3);
  }
  assert.deepEqual(transitions(s), Array.from({ length: 20 }, () => ['held', 'locked', 'on']).flat());
});

test('fist: lockProgress rises 0..1 over 1.5 s, debounce 80 ms, exit only at curl <= 0.45', () => {
  const s = session();
  const spot = s.summon('fl');
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(0.05); // under the debounce
  assert.equal(s.events('stem:mute').length, 0);
  s.right = hand({ palm: spot, curl: 0.6 });
  s.run(0.1);
  assert.equal(s.events('stem:mute').length, 0, 'a 50 ms blip never triggers');
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(0.5);
  const first = s.events('stem:mute')[0];
  assert.equal(first.state, 'held');
  assert.equal(first.lockProgress, 0);
  s.right = hand({ palm: spot, curl: 0.5 }); // between the thresholds: still held
  s.run(0.5);
  assert.equal(s.engine.debug().mute.fl, 'held');
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(0.7);
  const progress = s.events('stem:mute').map((e) => e.lockProgress);
  assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]), 'monotonic');
  assert.equal(s.events('stem:mute').at(-1).state, 'locked');
  assert.equal(s.events('stem:mute').at(-1).lockProgress, 1);
  const held = s.events('stem:mute').filter((e) => e.state === 'held');
  assert.ok(held.at(-1).lockProgress > 0.95 && held.at(-1).lockProgress < 1);
  // Lock time: first held to locked is 1.5 s within a frame.
  const n = held.length + 1;
  assert.ok(Math.abs(n / FPS - SPEC.lockTime) <= 2 / FPS, `took ${n} frames`);
});

test('fist: nothing outside the summoned creature, or with nothing summoned', () => {
  const s = session();
  s.head = { pos: EYE, dir: [0, 1, 0] }; // looking up at nothing, so nothing gets summoned
  s.right = hand({ palm: [0, 1.05, -0.45], curl: 0.95 });
  s.run(1);
  assert.equal(s.events('stem:mute').length, 0, 'nothing summoned');
  s.right = null;
  s.run(0.5);
  const spot = s.summon('cb');
  s.right = hand({ palm: add(spot, [0.3, 0, 0]), curl: 0.95 }); // 30 cm away: outside the 25 cm sphere
  s.run(1);
  s.right = hand({ palm: s.target('vln').center, curl: 0.95 }); // inside an unsummoned creature
  s.run(1);
  assert.equal(s.events('stem:mute').length, 0);
});

// ---- pinch and double-pinch solo (F05) ----

/** Two pinch-downs `gap` seconds apart at `pos`, with optional changes between them. */
function doublePinch(s, pos, { gap = 0.2, between, secondPos = pos, h = 'right' } = {}) {
  s[h] = hand({ palm: add(pos, [0, 0, 0.08]), curls: PINCH_CURLS, pinch: 0.005 });
  s.run(0.08);
  s[h] = hand({ palm: add(pos, [0, 0, 0.08]), curls: PINCH_CURLS, pinch: 0.05 });
  s.run(gap - 0.08, between);
  s[h] = hand({ palm: add(secondPos, [0, 0, 0.08]), curls: PINCH_CURLS, pinch: 0.005 });
  s.run(0.08);
  s[h] = hand({ palm: add(secondPos, [0, 0, 0.08]), curls: PINCH_CURLS, pinch: 0.05 });
  s.run(0.6); // settle past the window
}

test('pinch: 20 pinches, zero fist triggers, pinching shows on hand:pose', () => {
  const s = session();
  const spot = s.summon('reeds');
  let downs = 0;
  for (let i = 0; i < 20; i++) {
    s.right = hand({ palm: spot, curls: PINCH_CURLS, pinch: 0.01 });
    s.run(0.3);
    if (s.poses.at(-1).pinching) downs++;
    s.right = hand({ palm: spot, curls: PINCH_CURLS, pinch: 0.02 }); // inside the hysteresis band
    s.run(0.1);
    assert.equal(s.poses.filter((p) => p.hand === 'right').at(-1).pinching, true, 'held until 3 cm');
    s.right = hand({ palm: spot, curls: PINCH_CURLS, pinch: 0.04 });
    s.run(0.6);
    assert.equal(s.poses.filter((p) => p.hand === 'right').at(-1).pinching, false);
  }
  assert.equal(downs, 20);
  assert.equal(s.events('stem:mute').length, 0);
  assert.equal(s.events('stem:solo').length, 0, 'single pinches 0.7 s apart never solo');
});

test('pinch: other fingers curled past 0.6 is not a pinch', () => {
  const s = session();
  const spot = s.summon('reeds');
  s.right = hand({ palm: spot, curls: [0.4, 0.7, 0.2, 0.2], pinch: 0.005 });
  s.run(0.3);
  assert.equal(s.poses.at(-1).pinching, false);
});

test('double-pinch: 20 solos set and 20 cleared', () => {
  const s = session();
  const spot = s.summon('perc');
  for (let i = 0; i < 40; i++) doublePinch(s, spot);
  const solos = s.events('stem:solo').map((e) => e.stem);
  assert.equal(solos.length, 40);
  assert.deepEqual(solos, Array.from({ length: 40 }, (_, i) => (i % 2 ? null : 'perc')));
});

test('double-pinch: 20 with an injected tracking gap give 0 solos', () => {
  const s = session();
  const spot = s.summon('perc');
  for (let i = 0; i < 20; i++) {
    doublePinch(s, spot, { gap: 0.35, between: (f) => { if (f >= 5 && f < 12) s.right = null; else if (f === 12) s.right = hand({ palm: add(spot, [0, 0, 0.08]), curls: PINCH_CURLS, pinch: 0.05 }); } });
  }
  assert.equal(s.events('stem:solo').length, 0);
});

test('double-pinch: too slow, moved 4 cm, or other hand busy gives 0 solos', () => {
  const s = session();
  const spot = s.summon('perc');
  for (let i = 0; i < 20; i++) doublePinch(s, spot, { gap: 0.5 });
  for (let i = 0; i < 20; i++) doublePinch(s, spot, { secondPos: add(spot, [0.041, 0, 0]) });
  s.left = hand({ palm: add(spot, [-0.1, 0, 0]), curls: PINCH_CURLS, pinch: 0.005 }); // left hand pinching
  for (let i = 0; i < 20; i++) doublePinch(s, spot);
  assert.equal(s.events('stem:solo').length, 0);
  s.left = null;
  s.run(0.5);
  doublePinch(s, spot);
  assert.deepEqual(s.events('stem:solo').map((e) => e.stem), ['perc'], 'works again once the other hand is idle');
});

// ---- tracking gaps (F07) ----

test('gap: 0.3 s holds a fist hold; 0.5 s is a quiet release that never locks', () => {
  const s = session();
  const spot = s.summon('brass');
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(0.5);
  s.right = null;
  s.run(0.28);
  assert.equal(s.engine.debug().mute.brass, 'held', 'held through a 0.28 s gap');
  assert.ok(s.poses.at(-1).tracked, 'hand:pose holds the last state');
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(1);
  assert.equal(s.engine.debug().mute.brass, 'locked', 'the lock clock kept running through the short gap');
  s.right = hand({ palm: spot, curl: 0.1 });
  s.run(0.3);
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(0.3); // returns it
  s.right = hand({ palm: spot, curl: 0.1 });
  s.run(0.3);
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(1.2); // held at 1.2 / 1.5 s
  const n = s.events('stem:mute').length;
  s.right = null;
  s.run(0.5);
  const after = s.events('stem:mute').slice(n);
  // Held through the first 0.3 s (progress still rising), then released quietly: the part comes back, no lock.
  assert.deepEqual(after.map((e) => e.state).filter((st) => st !== 'held'), ['on']);
  assert.ok(after.filter((e) => e.state === 'held').every((e) => e.lockProgress < 1));
  assert.equal(s.poses.filter((p) => p.hand === 'right').at(-1).tracked, false);
  const m = s.events('stem:mute').length;
  s.right = hand({ palm: spot, curl: 0.95 }); // tracking returns with a fist already made
  s.run(0.05);
  assert.equal(s.events('stem:mute').length, m, 'no instant re-trigger inside the debounce');
});

test('gap: 20 gaps of 0.3 s and 20 of 0.5 s on held fists', () => {
  const s = session();
  const spot = s.summon('vla_vc');
  let held = 0, released = 0;
  for (let i = 0; i < 20; i++) {
    s.right = hand({ palm: spot, curl: 0.95 });
    s.run(0.3);
    s.right = null;
    s.run(0.29);
    if (s.engine.debug().mute.vla_vc === 'held') held++;
    s.right = hand({ palm: spot, curl: 0.1 });
    s.run(0.3);
    s.right = hand({ palm: spot, curl: 0.95 });
    s.run(0.3);
    s.right = null;
    s.run(0.5);
    if (s.engine.debug().mute.vla_vc === 'on') released++;
    s.right = hand({ palm: spot, curl: 0.1 });
    s.run(0.3);
  }
  assert.equal(held, 20);
  assert.equal(released, 20);
  assert.equal(muteStates(s).filter((x) => x === 'locked').length, 0);
});

// ---- cross-triggers (F06) ----

test('cross-trigger: 20 of each near and far give 0 cross-triggers', () => {
  const s = session();
  const spot = s.summon('harp');
  const far = add(spot, [0, 0.4, 0]);
  for (let i = 0; i < 20; i++) {
    for (const palm of [spot, far]) {
      // Pinch near and far: never a mute.
      s.right = hand({ palm, curls: PINCH_CURLS, pinch: 0.005 });
      s.run(0.3);
      s.right = hand({ palm, curl: 0.1 });
      s.run(0.6);
    }
    // Fist far: nothing at all.
    s.right = hand({ palm: far, curl: 0.95 });
    s.run(0.5);
    s.right = hand({ palm: far, curl: 0.1 });
    s.run(0.3);
  }
  assert.equal(s.events('stem:mute').length, 0);
  assert.equal(s.events('stem:solo').length, 0);
  // Fist near, opened and fisted quickly: holds and returns, never a solo.
  for (let i = 0; i < 20; i++) {
    s.right = hand({ palm: spot, curl: 0.95 });
    s.run(0.2);
    s.right = hand({ palm: spot, curl: 0.1 });
    s.run(0.15);
  }
  assert.equal(s.events('stem:solo').length, 0);
  assert.equal(transitions(s).length, 40);
});

test('hand:near names the nearest target with its surface distance', () => {
  const s = session({ moveSummoned: false });
  const c = s.target('fl').center;
  s.right = hand({ palm: add(c, [0, 0, 0.5]) });
  s.frame();
  const e = s.near.at(-1);
  assert.equal(e.hand, 'right');
  assert.equal(e.targetId, 'creature:fl');
  assert.ok(Math.abs(e.dist - (0.42 - 0.25)) < 1e-6, `dist ${e.dist}`); // tip is 8 cm nearer than the palm
  s.right = hand({ palm: c });
  s.frame();
  assert.equal(s.near.at(-1).dist, 0);
});

test('piece:ready resets mute, solo and summon', () => {
  const s = session();
  const spot = s.summon('vln');
  s.right = hand({ palm: spot, curl: 0.95 });
  s.run(1.7);
  assert.equal(s.engine.debug().mute.vln, 'locked');
  s.bus.emit('piece:ready', { id: 'fixture', manifest });
  assert.deepEqual(s.engine.debug().mute, {});
  assert.equal(s.engine.debug().summoned, null);
});

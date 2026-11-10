// EQ stretch / reset, ribbon pause and scrub, trim and undo, pads and the quiet reset (biyon-15, 16, 23, 24, 29).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { SPEC, createGestureEngine, padVelocity, reachSpotFor } from '../../src/input/engine.ts';
import { createMockTransport } from '../../src/mock/index.ts';

const FPS = 72;
const EYE = [0, 1.2, 0];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const PINCH_CURLS = [0.44, 0.19, 0.12, 0.17]; // IWER's pinch pose

/** A hand whose pinch point (thumb-index midpoint) is at p, closed (5 mm) or open (5 cm). */
function pinchAt(p, closed = true) {
  const half = closed ? 0.0025 : 0.025;
  return { tracked: true, confidence: 1, palm: add(p, [0, 0, 0.08]), tip: add(p, [-half, 0, 0]), thumbTip: add(p, [half, 0, 0]), curls: PINCH_CURLS, pinchDist: 2 * half };
}
/** A hand with its index tip at p, fingers relaxed and the thumb well away. */
function tipAt(p) {
  return { tracked: true, confidence: 1, palm: add(p, [0, 0.03, 0.08]), tip: p, thumbTip: add(p, [0.06, 0, 0]), curls: [0.1, 0.4, 0.4, 0.4], pinchDist: 0.06 };
}

function session({ beats } = {}) {
  const bus = createBus();
  const log = [];
  for (const k of ['gaze:summon', 'stem:mute', 'stem:solo', 'stem:eq', 'cut:preview', 'cut:add', 'cut:remove', 'reset:progress', 'app:reset', 'transport:state', 'transport:seek']) {
    bus.on(k, (e) => log.push({ k, e }));
  }
  const s = { t: 0, left: null, right: null, head: { pos: EYE, dir: [0, 1, 0] } };
  const transport = createMockTransport(bus, 60, () => s.t);
  const strikes = [];
  let ids = 0;
  const engine = createGestureEngine(bus, {
    transport, beats, newId: () => `cut-${++ids}`,
    parts: { strike: (instrument, pitch, vel, from) => strikes.push({ instrument, pitch, vel, from, t: s.t }) },
  });
  const targets = [];
  Object.assign(s, {
    bus, log, engine, transport, strikes, targets,
    frame() { engine.step({ t: s.t, hands: { left: s.left, right: s.right }, head: s.head }, targets); s.t += 1 / FPS; },
    run(seconds, each) { const n = Math.round(seconds * FPS); for (let i = 0; i < n; i++) { each?.(i, n); s.frame(); } },
    events: (k) => log.filter((x) => x.k === k).map((x) => x.e),
    count: (k) => log.filter((x) => x.k === k).length,
    /** Registers a creature straight ahead, looks at it until summoned, and moves it to the reach spot. */
    summon() {
      const c = { id: 'creature:fl', kind: 'creature', stem: 'fl', center: [0, 1.2, -1.6], radius: 0.25 };
      targets.push(c);
      s.head = { pos: EYE, dir: [0, 0, -1] };
      s.run(SPEC.summonDwell + 0.1);
      c.center = reachSpotFor(s.head);
      s.head = { pos: EYE, dir: [0, 1, 0] }; // look away: the summon stays
      return c.center;
    },
  });
  bus.emit('piece:ready', { id: 'fixture', manifest: { stems: [] } });
  return s;
}

// ---- EQ stretch and reset (biyon-15) ----

/** Both hands pinch the creature `lag` s apart at ±start, then move to ±end over `secs`; returns the session. */
function stretch(s, spot, { lag = 0.2, start = [0.05, 0, 0], end = [0.15, 0, 0], secs = 0.5, release = 'right' } = {}) {
  const neg = (v) => v.map((x) => -x);
  s.left = pinchAt(add(spot, neg(start)));
  s.run(lag);
  s.right = pinchAt(add(spot, start));
  s.run(0.1);
  s.run(secs, (i, n) => {
    const k = (i + 1) / n;
    const v = start.map((x, j) => x + (end[j] - x) * k);
    s.left = pinchAt(add(spot, neg(v)));
    s.right = pinchAt(add(spot, v));
  });
  s.run(0.1);
  if (release) {
    s[release] = pinchAt(s[release].tip.map((x, j) => (x + s[release].thumbTip[j]) / 2), false);
    s.run(0.1);
    s.left = pinchAt(add(spot, [-0.3, -0.3, 0.2]), false);
    s.right = pinchAt(add(spot, [0.3, -0.3, 0.2]), false);
    s.run(0.2);
  }
  return s;
}

test('EQ: wider apart raises the low band, logged and committed on release, about 30 Hz', () => {
  const s = session();
  const spot = s.summon();
  stretch(s, spot); // horizontal separation 10 cm → 30 cm: +8 dB low
  const eq = s.events('stem:eq');
  assert.ok(eq.length >= 5 && eq.length <= Math.ceil(0.7 * 30) + 2, `${eq.length} events`);
  const last = eq.at(-1);
  assert.equal(last.stem, 'fl');
  assert.ok(Math.abs(last.low - 8) < 0.2, `low ${last.low}`);
  assert.equal(last.high, 0);
  assert.equal(last.mid, 0);
  assert.equal(s.count('stem:solo'), 0);
  assert.equal(s.count('stem:mute'), 0);
  assert.equal(s.engine.debug().eq, null, 'committed when a hand let go');
});

test('EQ: taller apart raises the high band; both bands clamp at +-12 dB', () => {
  const s = session();
  const spot = s.summon();
  stretch(s, spot, { start: [0.05, 0.02, 0], end: [0.05, 0.2, 0] }); // vertical 4 cm → 40 cm: +14.4 → 12
  let last = s.events('stem:eq').at(-1);
  assert.ok(Math.abs(last.high - 12) < 1e-9, `high ${last.high}`);
  assert.ok(Math.abs(last.low) < 0.01);
  // Narrower and flatter, starting from +12 high: horizontal 34 cm → 0 is -13.6 → -12 low;
  // vertical 10 cm → 7 cm is 12 - 1.2 high. The hands stay 7 cm apart, short of the 6 cm reset.
  stretch(s, spot, { start: [0.17, 0.05, 0], end: [0, 0.035, 0] });
  last = s.events('stem:eq').at(-1);
  assert.equal(last.low, -12, `low ${last.low}`);
  assert.ok(Math.abs(last.high - 10.8) < 0.05, `high ${last.high}`);
  assert.ok(s.events('stem:eq').every((e) => Math.abs(e.low) <= 12 && Math.abs(e.high) <= 12));
});

test('EQ: one hand never starts it; two hands more than 0.5 s apart do not either', () => {
  const s = session();
  const spot = s.summon();
  s.left = pinchAt(add(spot, [-0.05, 0, 0]));
  s.run(1);
  s.left = pinchAt(add(spot, [-0.2, 0, 0]));
  s.run(0.5);
  assert.equal(s.count('stem:eq'), 0, 'one hand');
  s.left = pinchAt(add(spot, [-0.3, -0.3, 0.2]), false);
  s.run(0.3);
  stretch(s, spot, { lag: 0.6 });
  assert.equal(s.count('stem:eq'), 0, 'too far apart in time');
});

test('EQ reset: both pinches brought within 6 cm go back to flat, 10 times', () => {
  const s = session();
  const spot = s.summon();
  for (let i = 0; i < 10; i++) {
    stretch(s, spot, { end: [0.15, 0.05, 0], release: null });
    const n = s.count('stem:eq');
    stretch(s, spot, { lag: 0, start: [0.15, 0.05, 0], end: [0.02, 0, 0], release: null }); // hands come together
    const after = s.events('stem:eq').slice(n);
    assert.deepEqual(after.at(-1), { stem: 'fl', low: 0, mid: 0, high: 0 }, `round ${i}`);
    s.left = pinchAt(add(spot, [-0.3, -0.3, 0.2]), false);
    s.right = pinchAt(add(spot, [0.3, -0.3, 0.2]), false);
    s.run(0.3);
  }
  const zeros = s.events('stem:eq').filter((e) => e.low === 0 && e.mid === 0 && e.high === 0);
  assert.ok(zeros.length >= 10);
  assert.equal(s.count('stem:solo'), 0);
  assert.equal(s.count('stem:mute'), 0);
});

// ---- ribbon pause and scrub (biyon-16) ----

const playhead = (center = [0.3, 1.0, -0.4]) => ({ id: 'playhead', kind: 'playhead', center, radius: 0.06, extra: { dx: 1, dy: 0, dz: 0, secPerM: 10 } });

test('ribbon: hold pauses, release resumes, time untouched', () => {
  const s = session();
  s.targets.push(playhead());
  s.transport.play();
  s.run(1);
  s.right = pinchAt([0.3, 1.0, -0.4]);
  s.run(0.05);
  assert.equal(s.transport.playing(), false, 'paused on pinch');
  const t = s.transport.time();
  s.run(0.5);
  assert.equal(s.transport.time(), t);
  s.right = pinchAt([0.3, 1.0, -0.4], false);
  s.run(0.05);
  assert.equal(s.transport.playing(), true, 'resumed');
  assert.equal(s.count('transport:seek'), 0);
});

test('ribbon: drag scrubs, time follows the hand within 50 ms every frame, then resumes', () => {
  const s = session();
  s.targets.push(playhead());
  s.transport.play();
  s.run(2);
  s.right = pinchAt([0.3, 1.0, -0.4]);
  s.frame();
  const t0 = s.transport.time();
  let worst = 0;
  s.run(1, (i, n) => {
    const dx = 0.1 * Math.sin((Math.PI * (i + 1)) / n) + 0.05 * ((i + 1) / n); // out and back, ends 5 cm along
    s.right = pinchAt([0.3 + dx, 1.0, -0.4]);
    s.frame();
    worst = Math.max(worst, Math.abs(s.transport.time() - (t0 + dx * 10)));
    s.t -= 1 / FPS; // the run loop steps the frame itself; undo the extra time step
  });
  assert.ok(worst <= 0.05, `worst lag ${worst}`);
  assert.ok(Math.abs(s.transport.time() - (t0 + 0.5)) < 1e-6, `ended at ${s.transport.time()}`);
  s.right = pinchAt([0.35, 1.0, -0.4], false);
  s.run(0.05);
  assert.equal(s.transport.playing(), true);
});

test('ribbon: a short still pinch toggles pause, 10 times', () => {
  const s = session();
  s.targets.push(playhead());
  s.transport.play();
  const states = [];
  for (let i = 0; i < 10; i++) {
    s.right = pinchAt([0.3, 1.0, -0.4]);
    s.run(0.15);
    s.right = pinchAt([0.3, 1.0, -0.4], false);
    s.run(0.3);
    states.push(s.transport.playing());
  }
  assert.deepEqual(states, Array.from({ length: 10 }, (_, i) => i % 2 === 1));
});

test('ribbon: double-pinching the playhead inside the summoned creature never solos', () => {
  const s = session();
  const spot = s.summon();
  s.targets.push(playhead(spot));
  for (let i = 0; i < 20; i++) {
    s.right = pinchAt(spot); s.run(0.08);
    s.right = pinchAt(spot, false); s.run(0.12);
    s.right = pinchAt(spot); s.run(0.08);
    s.right = pinchAt(spot, false); s.run(0.6);
  }
  assert.equal(s.count('stem:solo'), 0);
});

// ---- trim and undo (biyon-23) ----

const lane = (id = 'lane:perc', stem = 'perc', y = 0.9) => ({
  id, kind: 'lane', stem, center: [0, y, -0.5], radius: 0.04, extra: { dx: 1, dy: 0, dz: 0, halfLength: 0.4, secPerM: 20, tCenter: 10 },
});

test('trim: 20 two-hand trims preview while held and add a cut on release', () => {
  const s = session();
  s.targets.push(lane());
  for (let i = 0; i < 20; i++) {
    s.left = pinchAt([-0.1, 0.9, -0.5]); // t = 8
    s.run(0.3);
    s.right = pinchAt([0.1, 0.9, -0.5]); // t = 12
    s.run(0.2);
    s.right = pinchAt([0.15, 0.9, -0.5]); // t = 13
    s.run(0.2);
    s.left = pinchAt([-0.1, 0.9, -0.5], false);
    s.run(0.1);
    s.right = pinchAt([0.15, 0.9, -0.5], false);
    s.run(0.2);
  }
  const adds = s.events('cut:add');
  assert.equal(adds.length, 20);
  for (const { cut } of adds) {
    assert.equal(cut.stem, 'perc');
    assert.ok(Math.abs(cut.t0 - 8) < 1e-6 && Math.abs(cut.t1 - 13) < 1e-6, JSON.stringify(cut));
  }
  assert.equal(new Set(adds.map((a) => a.cut.id)).size, 20, 'unique ids');
  const previews = s.events('cut:preview');
  assert.ok(previews.some((p) => p && Math.abs(p.t1 - 12) < 1e-6) && previews.some((p) => p && Math.abs(p.t1 - 13) < 1e-6));
  assert.equal(previews.filter((p) => p === null).length, 20, 'preview cleared each time');
  assert.equal(s.count('stem:solo') + s.count('stem:mute') + s.count('stem:eq'), 0);
});

test('trim: previews snap to the beat grid when beats are known', () => {
  const s = session({ beats: () => Array.from({ length: 120 }, (_, i) => i * 0.5) });
  s.targets.push(lane());
  s.left = pinchAt([-0.112, 0.9, -0.5]); // t = 7.76 → 7.5... nearest beat 8.0? 7.76 → 8.0
  s.run(0.1);
  s.right = pinchAt([0.108, 0.9, -0.5]); // t = 12.16 → 12.0
  s.run(0.2);
  s.left = pinchAt([-0.112, 0.9, -0.5], false);
  s.run(0.1);
  assert.deepEqual(s.events('cut:add')[0].cut, { id: 'cut-1', stem: 'perc', t0: 8, t1: 12 });
});

test('trim: not within 0.6 s, different lanes, or a tracking gap give no cut', () => {
  const s = session();
  s.targets.push(lane(), lane('lane:vln', 'vln', 0.8));
  s.left = pinchAt([-0.1, 0.9, -0.5]);
  s.run(0.7);
  s.right = pinchAt([0.1, 0.9, -0.5]);
  s.run(0.3);
  s.left = s.right = null;
  s.run(0.5);
  s.left = pinchAt([-0.1, 0.9, -0.5]);
  s.right = pinchAt([0.1, 0.8, -0.5]); // the other lane
  s.run(0.3);
  s.left = pinchAt([-0.1, 0.9, -0.5], false);
  s.right = pinchAt([0.1, 0.8, -0.5], false);
  s.run(0.3);
  assert.equal(s.count('cut:preview') + s.count('cut:add'), 0);
  // A gap longer than 0.3 s mid-trim: the preview clears, nothing is added.
  s.left = pinchAt([-0.1, 0.9, -0.5]);
  s.right = pinchAt([0.1, 0.9, -0.5]);
  s.run(0.3);
  assert.ok(s.count('cut:preview') > 0);
  s.right = null;
  s.run(0.5);
  assert.equal(s.count('cut:add'), 0);
  assert.equal(s.events('cut:preview').at(-1), null);
});

test('undo: 10 regions pulled 10 cm off are removed; a short pull is not', () => {
  const s = session();
  for (let i = 0; i < 10; i++) {
    const region = { id: `region:cut-${i}`, kind: 'region', stem: 'perc', center: [0, 0.9, -0.5], radius: 0.04, extra: { dx: 1, halfLength: 0.1 } };
    s.targets.push(region);
    s.right = pinchAt([0.02, 0.9, -0.5]);
    s.run(0.1);
    s.run(0.3, (k, n) => { s.right = pinchAt([0.02, 0.9 + 0.12 * ((k + 1) / n), -0.5]); });
    s.right = pinchAt([0.02, 1.02, -0.5], false);
    s.run(0.1);
    s.targets.splice(s.targets.indexOf(region), 1); // B removes the region once the cut is gone
  }
  assert.deepEqual(s.events('cut:remove').map((e) => e.id), Array.from({ length: 10 }, (_, i) => `cut-${i}`));
  const region = { id: 'region:keep', kind: 'region', center: [0, 0.9, -0.5], radius: 0.04, extra: { dx: 1, halfLength: 0.1 } };
  s.targets.push(region);
  s.right = pinchAt([0, 0.9, -0.5]);
  s.run(0.1);
  s.right = pinchAt([0, 0.98, -0.5]);
  s.run(0.2);
  s.right = pinchAt([0, 0.98, -0.5], false);
  s.run(0.1);
  assert.equal(s.count('cut:remove'), 10);
});

// ---- pads (biyon-24) ----

const pad = { id: 'pad:1', kind: 'pad', center: [0, 0.8, -0.4], radius: 0.06, extra: { pitch: 38 } };

/** The index tip moves straight down through the pad at `speed` m/s, from 5 cm above to 5 cm below. */
function strike(s, speed, x = 0) {
  for (let y = 0.05; y > -0.05; y -= speed / FPS) { s.right = tipAt([x, 0.8 + y, -0.4]); s.frame(); }
  s.right = tipAt([x, 0.8 - 0.05, -0.4]);
  s.run(0.05);
  s.right = tipAt([x, 0.8 + 0.05, -0.4]); // lift back above, slowly enough
  s.run(0.15);
}

test('pads: speed maps 0.4-2.5 m/s to velocity 30-127', () => {
  assert.equal(padVelocity(0.4), 30);
  assert.equal(padVelocity(2.5), 127);
  assert.equal(padVelocity(5), 127);
  assert.equal(padVelocity(1.4), 76);
  const s = session();
  s.targets.push(pad);
  for (const v of [0.41, 1, 1.4, 2, 2.5]) strike(s, v); // 0.41: exactly 0.4 sits on the threshold in floating point
  assert.deepEqual(s.strikes.map((h) => h.vel), [0.41, 1, 1.4, 2, 2.5].map(padVelocity));
  assert.ok(s.strikes.every((h) => h.instrument === 'pads' && h.pitch === 38));
  assert.ok(Math.abs(s.strikes[0].from[1] - 0.8) < 0.05, 'from is the fingertip');
});

test('pads: too slow, upward, or outside the disc is no hit; default pitch 50', () => {
  const s = session();
  s.targets.push(pad);
  for (let y = -0.05; y < 0.05; y += 1.5 / FPS) { s.right = tipAt([0, 0.8 + y, -0.4]); s.frame(); } // upward, from below
  strike(s, 0.3);
  strike(s, 1.5, 0.08); // outside the 6 cm disc
  assert.equal(s.strikes.length, 0);
  s.targets[0] = { ...pad, extra: {} };
  strike(s, 1.5);
  assert.equal(s.strikes[0].pitch, 50);
});

test('pads: 90 ms lockout per pad', () => {
  const s = session();
  s.targets.push(pad);
  const down = (y) => { s.right = tipAt([0, 0.8 + y, -0.4]); s.frame(); };
  // Two crossings 4 frames (56 ms) apart: one hit. Then two 8 frames (111 ms) apart: two hits.
  for (const gapFrames of [4, 8]) {
    s.strikes.length = 0;
    down(0.02); down(-0.02);
    for (let i = 0; i < gapFrames - 2; i++) down(0.02);
    down(-0.02);
    s.run(0.3);
    assert.equal(s.strikes.length, gapFrames === 4 ? 1 : 2, `${gapFrames} frames`);
  }
});

test('pads: a tracking gap across the face is never a hit', () => {
  const s = session();
  s.targets.push(pad);
  for (let i = 0; i < 20; i++) {
    s.right = tipAt([0, 0.82, -0.4]); s.frame();
    s.right = null; s.frame(); s.frame();
    s.right = tipAt([0, 0.78, -0.4]); s.frame();
    s.right = tipAt([0, 0.82, -0.4]); s.run(0.2); // back up slowly
  }
  assert.equal(s.strikes.length, 0);
});

// ---- quiet reset (biyon-29) ----

const shell = { id: 'reset', kind: 'reset', center: [0.3, 0.5, -0.1], radius: 0.05 };

test('quiet reset: pinch and hold 2 s resets the piece, 10 times; progress at about 30 Hz', () => {
  const s = session();
  s.targets.push(shell);
  for (let i = 0; i < 10; i++) {
    const n = s.count('reset:progress');
    s.right = pinchAt(shell.center);
    s.run(2.1);
    s.right = pinchAt(shell.center, false);
    s.run(0.2);
    const p = s.events('reset:progress').slice(n).map((e) => e.progress);
    assert.ok(p.every((x, k) => k === 0 || x >= p[k - 1]), 'rising');
    assert.equal(p.at(-1), 1);
    assert.ok(p.length >= 55 && p.length <= 62, `${p.length} progress events`);
  }
  assert.deepEqual(s.events('app:reset'), Array.from({ length: 10 }, () => ({ piece: 'fixture' })));
});

test('quiet reset: releasing early cancels to 0 and resets nothing', () => {
  const s = session();
  s.targets.push(shell);
  s.right = pinchAt(shell.center);
  s.run(1.2);
  s.right = pinchAt(shell.center, false);
  s.run(0.2);
  assert.equal(s.events('reset:progress').at(-1).progress, 0);
  assert.equal(s.count('app:reset'), 0);
});

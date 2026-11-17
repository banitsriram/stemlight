// Harp plucks and keyboard presses (biyon-26, 27): the index tip crossing a string sideways, or moving down
// through a key top, at speed, inside the string / key, with the pads' 90 ms lockout; gaps are never notes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { SPEC, createGestureEngine, rowVelocity } from '../../src/input/engine.ts';
import { harpTargets, keyTargets, padTargets } from '../../src/ui/remake/layout.ts';
import { reachSpotFor } from '../../src/input/engine.ts';

const FPS = 72;
const FRAME = { eye: [0, 1.2, 0], yaw: 0 };
const PITCHES = [52, 54, 55, 57, 59, 60, 62, 64];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** A pointing hand with its index tip at p (fingers curled, thumb away: neither a fist nor a pinch). */
const tipAt = (p) => ({ tracked: true, confidence: 1, palm: add(p, [0, 0.03, 0.08]), tip: p, thumbTip: add(p, [0.06, 0, 0]), curls: [0.1, 0.4, 0.4, 0.4], pinchDist: 0.06 });

function session(targets) {
  const bus = createBus();
  const strikes = [];
  const s = { t: 0, right: null };
  const engine = createGestureEngine(bus, { parts: { strike: (instrument, pitch, vel, from) => strikes.push({ instrument, pitch, vel, from, t: s.t }) } });
  Object.assign(s, {
    strikes,
    frame() { engine.step({ t: s.t, hands: { left: null, right: s.right }, head: null }, targets); s.t += 1 / FPS; },
    /** Moves the tip in a straight line from a to b at `speed` m/s. */
    move(a, b, speed) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const n = Math.max(2, Math.round((len / speed) * FPS));
      for (let i = 0; i <= n; i++) { s.right = tipAt(a.map((x, j) => x + ((b[j] - x) * i) / n)); s.frame(); }
    },
  });
  return s;
}

test('harp: a sideways sweep at 0.5 m/s plucks all 8 strings in order, low to high, then high to low', () => {
  const strings = harpTargets(FRAME, PITCHES);
  const s = session(strings);
  const y = strings[0].center[1], z = strings[0].center[2];
  s.move([strings[0].center[0] - 0.04, y, z], [strings[7].center[0] + 0.04, y, z], 0.5);
  assert.deepEqual(s.strikes.map((h) => h.pitch), PITCHES);
  assert.ok(s.strikes.every((h) => h.instrument === 'harp'));
  s.t += 0.2;
  s.move([strings[7].center[0] + 0.04, y, z], [strings[0].center[0] - 0.04, y, z], 0.5);
  assert.deepEqual(s.strikes.slice(8).map((h) => h.pitch), [...PITCHES].reverse());
});

test('harp: above the string, too far in front of it, or too slow plucks nothing; speed sets velocity', () => {
  const strings = harpTargets(FRAME, PITCHES);
  const c = strings[3].center;
  const across = (dy, dz, speed) => { const s = session(strings); s.move([c[0] - 0.02, c[1] + dy, c[2] + dz], [c[0] + 0.02, c[1] + dy, c[2] + dz], speed); return s.strikes; };
  assert.equal(across(0, 0, 0.5).length, 1, 'through the middle: a pluck');
  assert.equal(across(0.045, 0, 0.5).length, 1, 'near the top still counts');
  assert.equal(across(0.07, 0, 0.5).length, 0, 'above the string');
  assert.equal(across(0, 0.05, 0.5).length, 0, '5 cm off the plane');
  assert.equal(across(0, 0, 0.05).length, 0, 'too slow');
  assert.ok(across(0, 0, 1.2)[0].vel > across(0, 0, 0.2)[0].vel, 'faster is louder');
  assert.equal(rowVelocity(0.1, SPEC.harpMinSpeed, SPEC.harpMaxSpeed), 30);
  assert.equal(rowVelocity(9, SPEC.harpMinSpeed, SPEC.harpMaxSpeed), 127);
});

test('harp: 90 ms lockout per string; a tracking gap across a string is no pluck', () => {
  const strings = harpTargets(FRAME, PITCHES);
  const c = strings[2].center;
  const s = session(strings);
  // Back and forth across one string every ~28 ms (2 frames each way): only one pluck per 90 ms.
  for (let k = 0; k < 6; k++) { s.right = tipAt([c[0] + (k % 2 ? 0.01 : -0.01), c[1], c[2]]); s.frame(); s.frame(); }
  const n = s.strikes.length;
  assert.ok(n >= 1 && n <= 2, `${n} plucks in ~170 ms`);
  const g = session(strings);
  g.right = tipAt([c[0] - 0.01, c[1], c[2]]); g.frame();
  g.right = { ...tipAt([c[0], c[1], c[2]]), tracked: false }; g.frame(); g.frame();
  g.right = tipAt([c[0] + 0.01, c[1], c[2]]); g.frame();
  assert.equal(g.strikes.length, 0, 'the tip reappeared on the other side: not a pluck');
});

test('keys: a press down through each key at 0.5 m/s plays it; slow, upward, or in the gap plays nothing', () => {
  const keys = keyTargets(FRAME, PITCHES);
  const s = session(keys);
  for (const k of keys) { s.move(add(k.center, [0, 0.03, 0]), add(k.center, [0, -0.02, 0]), 0.5); s.t += 0.1; }
  assert.deepEqual(s.strikes.map((h) => h.pitch), PITCHES);
  assert.ok(s.strikes.every((h) => h.instrument === 'keys'));
  const c = keys[4].center;
  const press = (from, to, speed) => { const p = session(keys); p.move(from, to, speed); return p.strikes.length; };
  assert.equal(press(add(c, [0, 0.03, 0]), add(c, [0, -0.02, 0]), 0.1), 0, 'too slow');
  assert.equal(press(add(c, [0, -0.02, 0]), add(c, [0, 0.03, 0]), 0.5), 0, 'upward');
  assert.equal(press(add(c, [0.025, 0.03, 0]), add(c, [0.025, -0.02, 0]), 0.5), 0, 'in the 4 mm gap between keys');
  assert.equal(press(add(c, [0, 0.03, -0.05]), add(c, [0, -0.02, -0.05]), 0.5), 0, 'beyond the back of the key');
  assert.equal(press(add(c, [0, 0.03, 0.035]), add(c, [0, -0.02, 0.035]), 0.5), 1, 'near the front edge still counts');
});

test('jitter: a tip resting on a string or key top, wobbling 1.5 mm a frame, plays nothing', () => {
  const strings = harpTargets(FRAME, PITCHES), keys = keyTargets(FRAME, PITCHES);
  const c = strings[4].center, k = keys[2].center;
  const sh = session(strings), sk = session(keys); // separate sessions: moving between them would sweep strings
  for (let i = 0; i < 144; i++) {
    const w = (i % 2 ? 1 : -1) * 0.0015;
    sh.right = tipAt([c[0] + w, c[1], c[2]]); sh.frame();
    sk.right = tipAt([k[0], k[1] + w, k[2]]); sk.frame();
  }
  assert.equal(sh.strikes.length, 0, `${sh.strikes.length} plucks from 2 s of jitter on a string`);
  assert.equal(sk.strikes.length, 0, `${sk.strikes.length} presses from 2 s of jitter on a key`);
  void keys;
});

test('a sample from before the row was hidden never counts: the first frame back is no pluck', () => {
  const strings = harpTargets(FRAME, PITCHES);
  const targets = [...strings];
  const s = session(targets);
  const c = strings[1].center;
  s.right = tipAt([c[0] - 0.02, c[1], c[2]]); s.frame();
  targets.length = 0; // row hidden
  for (let i = 0; i < 30; i++) { s.right = tipAt([c[0] + 0.02, c[1], c[2]]); s.frame(); }
  targets.push(...strings); // row back, the tip now on the other side
  s.frame();
  assert.equal(s.strikes.length, 0);
});

test('a tracking jump across the whole row plucks nothing; the next real sweep still plays', () => {
  const strings = harpTargets(FRAME, PITCHES);
  const s = session(strings);
  const y = strings[0].center[1], z = strings[0].center[2];
  const rightOfAll = [strings[7].center[0] + 0.1, y, z], leftOfAll = [strings[0].center[0] - 0.025, y, z];
  for (let i = 0; i < 5; i++) { s.right = tipAt(rightOfAll); s.frame(); }
  for (let i = 0; i < 5; i++) { s.right = tipAt(leftOfAll); s.frame(); } // 0.48 m in one frame
  assert.equal(s.strikes.length, 0, `${s.strikes.length} plucks from a jump`);
  s.move(leftOfAll, [strings[7].center[0] + 0.025, y, z], 0.5);
  assert.deepEqual(s.strikes.map((h) => h.pitch), PITCHES);
  // The fastest strum at a slow 30 Hz tracking rate (2 m/s = 6.7 cm a sample) is still a strum.
  const f = session(strings);
  for (let k = 0; k <= 6; k++) { f.right = tipAt([strings[0].center[0] - 0.025 + 0.0667 * k, y, z]); f.frame(); f.t += 1 / 30 - 1 / FPS; }
  assert.equal(f.strikes.length, 8, `${f.strikes.length} plucks from a 2 m/s strum at 30 Hz`);
});

test('standing, looking down at the harp or keyboard never summons the instrument seated behind it', () => {
  // Seated (eye 1.2 m) nothing is behind the row; standing (eye 1.4 m and up, IWER's default is 1.6 m) the
  // cello, flute, violin and clarinet seats all sit within the 12° summon cone behind it. Cello: its home seat.
  const eye = [0, 1.6, 0];
  const STAND = { eye, yaw: 0 };
  const cello = { id: 'creature:vla_vc', kind: 'creature', stem: 'vla_vc', center: [-0.333, 1.0, -1.565], radius: 0.25 };
  const at = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], l = Math.hypot(...d); return { pos: eye, dir: d.map((x) => x / l) }; };
  const run = (targets, head) => {
    const bus = createBus();
    const summons = [];
    bus.on('gaze:summon', (e) => summons.push(e.stem));
    const engine = createGestureEngine(bus, {});
    for (let i = 0; i < 2 * FPS; i++) engine.step({ t: i / FPS, hands: { left: null, right: null }, head }, targets);
    return summons;
  };
  const strings = harpTargets(STAND, PITCHES), keys = keyTargets(STAND, PITCHES);
  const flute = { id: 'creature:fl', kind: 'creature', stem: 'fl', center: [0.333, 1.0, -1.565], radius: 0.25 };
  const cone = (head, c) => { const d = at(c.center).dir; return Math.acos(head.dir[0] * d[0] + head.dir[1] * d[1] + head.dir[2] * d[2]) * 57.2958; };
  for (const [what, row, look, behind] of [['harp', strings, strings[3], cello], ['keyboard', keys, keys[3], cello], ['harp, treble side', strings, strings[4], flute]]) {
    const head = at(look.center);
    assert.ok(cone(head, behind) < SPEC.summonAngleDeg, `${what}: the ${behind.stem} is inside the summon cone from here (${cone(head, behind).toFixed(1)}°), so this is the real case`);
    assert.deepEqual(run([behind, ...row], head), [], `${what}: 2 s looking at it summons nothing`);
  }
  assert.deepEqual(run([cello, ...strings], at(cello.center)), ['vla_vc'], 'looking straight at the cello still summons it');
  assert.deepEqual(run([cello], at(strings[3].center)), ['vla_vc'], 'with no instrument up, the same look summons it as before');
});

test('looking at the reset shell (a control) never summons the timpani seated behind it', () => {
  const eye = [0, 1.6, 0], seat = { eye, yaw: 0 };
  const timpani = { id: 'creature:perc', kind: 'creature', stem: 'perc', center: [0.976, 1.7, -2.193], radius: 0.25 };
  // The shell 27 cm right, 2 cm down, 42 cm ahead of the eye (layout RESET), and a head pointing at it.
  const shell = { id: 'reset', kind: 'reset', center: [eye[0] + 0.27, eye[1] - 0.02, eye[2] - 0.42], radius: 0.05 };
  const dirTo = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], l = Math.hypot(...d); return d.map((x) => x / l); };
  const head = { pos: eye, dir: dirTo(shell.center) };
  const cone = Math.acos(dirTo(timpani.center).reduce((s, x, i) => s + x * head.dir[i], 0)) * 57.2958;
  const run = (targets) => {
    const bus = createBus(), summons = [];
    bus.on('gaze:summon', (e) => summons.push(e.stem));
    const engine = createGestureEngine(bus, {});
    for (let i = 0; i < 2 * FPS; i++) engine.step({ t: i / FPS, hands: { left: null, right: null }, head }, targets);
    return summons;
  };
  if (cone < SPEC.summonAngleDeg) assert.deepEqual(run([timpani, shell]), [], `the timpani is ${cone.toFixed(1)}° off the gaze, but the shell is nearer it`);
  else assert.ok(true, `from this seat the timpani is outside the cone (${cone.toFixed(1)}°)`);
  // The guard itself, whatever the seat: a control dead ahead with a creature 6° behind it.
  const ahead = { id: 'reset', kind: 'reset', center: [0, 1.6, -0.42], radius: 0.05 };
  const behind = { ...timpani, center: [0.2, 1.6, -2] };
  const straight = { pos: eye, dir: [0, 0, -1] };
  const bus = createBus(), summons = [];
  bus.on('gaze:summon', (e) => summons.push(e.stem));
  const engine = createGestureEngine(bus, {});
  for (let i = 0; i < 2 * FPS; i++) engine.step({ t: i / FPS, hands: { left: null, right: null }, head: straight }, [behind, ahead]);
  assert.deepEqual(summons, [], 'looking at the shell, nothing is summoned');
});

test('playing the harp with a pointing hand inside the summoned creature never silences it', () => {
  const bus = createBus();
  const mutes = [];
  bus.on('stem:mute', (e) => mutes.push(e));
  const strikes = [];
  let t = 0;
  const engine = createGestureEngine(bus, { parts: { strike: (instrument, pitch) => strikes.push({ instrument, pitch }) } });
  const creature = { id: 'creature:fl', kind: 'creature', stem: 'fl', center: [0, 1.2, -1.6], radius: 0.25 };
  const head = { pos: [0, 1.2, 0], dir: [0, 0, -1] };
  const targets = [creature];
  const step = (right) => { engine.step({ t, hands: { left: null, right }, head }, targets); t += 1 / FPS; };
  for (let i = 0; i < Math.round((SPEC.summonDwell + 0.1) * FPS); i++) step(null);
  creature.center = reachSpotFor(head);
  targets.push(...harpTargets(FRAME, PITCHES));
  const strings = targets.filter((x) => x.kind === 'string');
  // A real pointing hand: index straight, the other three curled like a fist.
  const point = (p) => ({ tracked: true, confidence: 1, palm: add(p, [0, 0.03, 0.08]), tip: p, thumbTip: add(p, [0.03, -0.02, 0.04]), curls: [0.05, 0.85, 0.85, 0.85], pinchDist: 0.05 });
  const y = strings[0].center[1], z = strings[0].center[2];
  for (let rep = 0; rep < 4; rep++) {
    for (let k = 0; k <= 8; k++) step(point([strings[0].center[0] - 0.025 + 0.05 * k, y, z]));
    for (let i = 0; i < 72; i++) step(point([strings[7].center[0] + 0.025, y, z])); // rest a second
  }
  assert.ok(strikes.length >= 16, `${strikes.length} plucks`);
  assert.deepEqual(mutes, [], 'no stem:mute at all');
});

test('with the drums up, a pointing hand inside the summoned timpani never silences it; a real fist still does', () => {
  const bus = createBus();
  const mutes = [];
  bus.on('stem:mute', (e) => mutes.push(e));
  let t = 0;
  const engine = createGestureEngine(bus, { parts: { strike: () => {} } });
  const creature = { id: 'creature:perc', kind: 'creature', stem: 'perc', center: [0, 1.2, -1.6], radius: 0.25 };
  const head = { pos: [0, 1.2, 0], dir: [0, 0, -1] };
  const targets = [creature];
  const step = (right) => { engine.step({ t, hands: { left: null, right }, head }, targets); t += 1 / FPS; };
  for (let i = 0; i < Math.round((SPEC.summonDwell + 0.1) * FPS); i++) step(null);
  creature.center = reachSpotFor(head);
  targets.push(...padTargets(FRAME, [47, 52]));
  // A pointing hand (index straight, the other three curled) with its palm at the timpani's centre, held 3 s.
  const hand = (curls) => {
    const c = creature.center;
    return { tracked: true, confidence: 1, palm: c, tip: add(c, [0, -0.03, -0.08]), thumbTip: add(c, [0.06, 0, 0]), curls, pinchDist: 0.06 };
  };
  for (let i = 0; i < 3 * FPS; i++) step(hand([0.05, 0.85, 0.85, 0.85]));
  assert.deepEqual(mutes, [], 'pointing: no stem:mute at all');
  // A real fist, index curled too, still silences it while the drums are up.
  for (let i = 0; i < Math.round((SPEC.fistDebounce + 0.2) * FPS); i++) step(hand([0.9, 0.9, 0.9, 0.9]));
  assert.equal(mutes[0]?.stem, 'perc');
  assert.equal(mutes[0]?.state, 'held', 'a fist holds the timpani silent');
});

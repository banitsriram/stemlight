// Harp and keyboard surfaces (biyon-26, 27): their pitches (one octave of the piece's scale inside the replaced
// stem's range), placement inside the 70×66° view and 0.61 m reach, which one shows, and the flash on a hit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createMockRegistry, createMockTransport } from '../../src/mock/index.ts';
import { HARP, KEYS, harpTargets, keyTargets, melodicWanted, octaveFor, toWorld } from '../../src/ui/remake/layout.ts';
import { createRemakeState } from '../../src/ui/remake/state.ts';

const FRAME = { eye: [0, 1.2, 0], yaw: 0 };
const piece = (id) => JSON.parse(readFileSync(new URL(`../../public/pieces/${id}/manifest.json`, import.meta.url)));
const rangeOf = (m, stem) => m.stems.find((s) => s.id === stem).pitchRange;
const inKey = (m, p) => m.scale.steps.includes((((p - m.scale.tonic) % 12) + 12) % 12);

test('pitches: one octave of the scale, inside the replaced stem, for both real pieces', () => {
  const dv = piece('dvorak9'), be = piece('beethoven5');
  assert.deepEqual(dv.replace.map((r) => `${r.stem}:${r.instrument}`), ['perc:pads', 'fl:harp', 'reeds:keys']);
  assert.deepEqual(be.replace.map((r) => `${r.stem}:${r.instrument}`), ['perc:pads', 'fl:harp', 'reeds:keys']);
  const cases = [
    [dv, 'fl', [76, 78, 79, 81, 83, 84, 86, 88]], [dv, 'reeds', [52, 54, 55, 57, 59, 60, 62, 64]],
    [be, 'fl', [72, 74, 75, 77, 79, 80, 82, 84]], [be, 'reeds', [60, 62, 63, 65, 67, 68, 70, 72]],
  ];
  for (const [m, stem, want] of cases) {
    const got = octaveFor(m.scale, rangeOf(m, stem));
    assert.deepEqual(got, want, `${m.id} ${stem}`);
    const [lo, hi] = rangeOf(m, stem);
    assert.ok(got.every((p) => inKey(m, p) && p >= lo && p <= hi), `${m.id} ${stem}: every note in key and in range`);
    assert.equal(got[7] - got[0], 12, 'an octave, tonic to tonic');
  }
  assert.deepEqual(octaveFor({ tonic: 64, steps: [0, 2, 3, 5, 7, 8, 10] }, undefined), [64, 66, 67, 69, 71, 72, 74, 76]);
});

test('layout: 8 strings and 8 keys inside the 70×66° view, within 0.61 m, low to high from the left', () => {
  const eye = FRAME.eye;
  const check = (p, what) => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const yaw = Math.abs(Math.atan2(d[0], -d[2]) * 57.2958), pitch = Math.abs(Math.atan2(d[1], Math.hypot(d[0], d[2])) * 57.2958);
    assert.ok(yaw <= 35 && pitch <= 33 && Math.hypot(...d) <= 0.61, `${what}: yaw ${yaw.toFixed(1)}°, pitch ${pitch.toFixed(1)}°, ${Math.hypot(...d).toFixed(2)} m`);
  };
  const pitches = [52, 54, 55, 57, 59, 60, 62, 64];
  const strings = harpTargets(FRAME, pitches), keys = keyTargets(FRAME, pitches);
  assert.equal(strings.length, 8);
  assert.equal(keys.length, 8);
  strings.forEach((s, i) => {
    assert.equal(s.kind, 'string'); assert.equal(s.id, `string:${i}`); assert.equal(s.extra.pitch, pitches[i]);
    check([s.center[0], s.center[1] - s.extra.halfLength, s.center[2]], `string ${i} bottom`);
    check([s.center[0], s.center[1] + s.extra.halfLength, s.center[2]], `string ${i} top`);
    if (i) assert.ok(Math.abs(s.center[0] - strings[i - 1].center[0] - HARP.spacing) < 1e-9, 'strings 5 cm apart, left to right');
  });
  keys.forEach((k, i) => {
    assert.equal(k.kind, 'key'); assert.equal(k.id, `key:${i}`); assert.equal(k.extra.pitch, pitches[i]);
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) check([k.center[0] + u * k.extra.halfW, k.center[1], k.center[2] - v * k.extra.halfD], `key ${i} corner`);
    if (i) assert.ok(k.center[0] > keys[i - 1].center[0] + KEYS.width, 'keys left to right with a gap');
  });
  // Turned seat: the row turns with it.
  const turned = harpTargets({ eye, yaw: Math.PI / 2 }, pitches);
  const want = toWorld({ eye, yaw: Math.PI / 2 }, [-(3.5 * HARP.spacing), -HARP.below, HARP.ahead]);
  assert.ok(turned[0].center.every((x, j) => Math.abs(x - want[j]) < 1e-9));
});

test('which melodic instrument shows: the take, else the latest harp/keys cut; pads cuts never', () => {
  const m = piece('dvorak9');
  const P = (cuts, take = null) => ({ cuts: () => cuts, taking: () => take });
  assert.equal(melodicWanted(P([]), m), null);
  assert.equal(melodicWanted(P([{ id: 'a', stem: 'perc', t0: 1, t1: 2 }]), m), null);
  assert.equal(melodicWanted(P([{ id: 'a', stem: 'fl', t0: 1, t1: 2 }]), m), 'harp');
  assert.equal(melodicWanted(P([{ id: 'a', stem: 'fl', t0: 1, t1: 2 }, { id: 'b', stem: 'reeds', t0: 3, t1: 4 }]), m), 'keys');
  assert.equal(melodicWanted(P([{ id: 'b', stem: 'reeds', t0: 3, t1: 4 }], { instrument: 'harp' }), m), 'harp');
  assert.equal(melodicWanted(P([{ id: 'c', stem: 'vln', t0: 3, t1: 4 }]), m), null);
});

async function setup() {
  const bus = createBus();
  const registry = createMockRegistry();
  const transport = createMockTransport(bus, 60, () => 0);
  const cuts = new Map();
  let take = null;
  bus.on('cut:add', ({ cut }) => { cuts.set(cut.id, cut); take = cut.stem === 'fl' ? { cutId: cut.id, instrument: 'harp', pass: 0 } : cut.stem === 'reeds' ? { cutId: cut.id, instrument: 'keys', pass: 0 } : null; });
  bus.on('cut:remove', ({ id }) => { cuts.delete(id); take = null; });
  const parts = { cuts: () => [...cuts.values()], parts: () => [], taking: () => take };
  const state = createRemakeState({ bus, transport, registry }, { parts, head: () => FRAME, loadNotes: async () => [] });
  bus.emit('piece:ready', { id: 'dvorak9', manifest: piece('dvorak9') });
  await new Promise((r) => setImmediate(r));
  return { bus, registry, state, kinds: () => registry.all().map((t) => t.kind) };
}

test('state: a flute cut shows the harp (8 string targets), a reed cut swaps to the keyboard; a hit flashes its string only', async () => {
  const s = await setup();
  let v = s.state.update(1 / 72);
  assert.equal(v.strings.length + v.keys.length, 0, 'nothing before a cut');
  assert.ok(!s.kinds().includes('string') && !s.kinds().includes('key'));

  s.bus.emit('cut:add', { cut: { id: 'h1', stem: 'fl', t0: 10, t1: 12 } });
  v = s.state.update(1 / 72);
  assert.equal(v.strings.length, 8);
  assert.equal(v.keys.length, 0);
  assert.equal(s.kinds().filter((k) => k === 'string').length, 8);
  assert.deepEqual(v.strings.map((x) => x.pitch), s.state.harpPitches());
  assert.ok(v.strings.every((x) => x.b[1] - x.a[1] > 0.075), 'strings stand upright, 8 to 15 cm (graded, bass longest)');

  s.bus.emit('part:hit', { cutId: 'h1', instrument: 'harp', pitch: 81, vel: 90, t: 10.5, from: [0, 1, -0.3] });
  v = s.state.update(1 / 72);
  assert.deepEqual(v.strings.map((x) => x.flash > 0.9), v.strings.map((x) => x.pitch === 81), 'only the struck string flashes');
  v = s.state.update(0.3);
  assert.ok(v.strings.every((x) => x.flash === 0), 'flash over after 0.25 s');

  s.bus.emit('cut:add', { cut: { id: 'k1', stem: 'reeds', t0: 20, t1: 22 } });
  v = s.state.update(1 / 72);
  assert.equal(v.strings.length, 0);
  assert.equal(v.keys.length, 8);
  assert.equal(s.kinds().filter((k) => k === 'string').length, 0, 'string targets removed');
  assert.equal(s.kinds().filter((k) => k === 'key').length, 8);
  assert.deepEqual(v.keys.map((x) => x.pitch), [52, 54, 55, 57, 59, 60, 62, 64]);
  s.bus.emit('countin', { cutId: 'k1', beatsLeft: 4 });
  v = s.state.update(0.1);
  assert.ok(v.countIn && v.countIn.fill > 0 && v.countInOn === 'row', 'the count-in shows on the keyboard (no pads)');
});

test('first-time hints: one per instrument per session, over it, gone on the first hit or after 8 s', async () => {
  const s = await setup();
  const { HINT_SEC } = await import('../../src/ui/remake/state.ts');
  let v = s.state.update(1 / 72);
  assert.equal(v.hint, null, 'no hint before an instrument shows');

  s.bus.emit('cut:add', { cut: { id: 'h1', stem: 'fl', t0: 10, t1: 12 } });
  v = s.state.update(1 / 72); // it appears here, fading in from 0
  v = s.state.update(0.5);
  assert.ok(v.hint && /strings/.test(v.hint.text), `harp hint: "${v.hint?.text}"`);
  assert.ok(v.hint.alpha > 0.9, 'faded in');
  const top = Math.max(...v.strings.map((x) => x.b[1]));
  assert.ok(v.hint.at[1] > top, 'floats above the harp');
  s.bus.emit('part:hit', { cutId: 'h1', instrument: 'harp', pitch: 81, vel: 90, t: 10.5, from: [0, 1, -0.3] });
  v = s.state.update(1 / 72);
  assert.equal(v.hint, null, 'the first pluck ends it');

  s.bus.emit('cut:add', { cut: { id: 'k1', stem: 'reeds', t0: 20, t1: 22 } });
  v = s.state.update(1 / 72);
  assert.ok(v.hint && /key/.test(v.hint.text), `keys hint: "${v.hint?.text}"`);
  v = s.state.update(HINT_SEC + 0.1);
  assert.equal(v.hint, null, `unplayed, it goes after ${HINT_SEC} s`);

  s.bus.emit('cut:add', { cut: { id: 'h2', stem: 'fl', t0: 30, t1: 32 } });
  s.state.update(1 / 72);
  v = s.state.update(0.5);
  assert.equal(v.hint, null, 'the harp hint never comes back in the same session');
});

test('fingertip glow: only near a string, key or drum head, brighter closer, dimmer when tracking is weak', async () => {
  const s = await setup();
  const pose = (tip, confidence = 1) => s.bus.emit('hand:pose', { hand: 'right', tracked: true, confidence, palm: tip, tip, curl: 0, pinching: false });
  pose([0, 1, -0.3]);
  assert.deepEqual(s.state.update(1 / 72).tips, [], 'no instrument up: no glow');
  s.bus.emit('cut:add', { cut: { id: 'h1', stem: 'fl', t0: 10, t1: 12 } });
  let v = s.state.update(1 / 72);
  const st = s.registry.all().filter((t) => t.kind === 'string')[3];
  const off = (dz, conf) => { pose([st.center[0], st.center[1], st.center[2] + dz], conf); return s.state.update(1 / 72).tips; };
  assert.deepEqual(off(0.2), [], '20 cm away: nothing');
  const far = off(0.04)[0], near = off(0.01)[0];
  assert.ok(far && near && near.k > far.k, `brighter closer (${far?.k.toFixed(2)} -> ${near?.k.toFixed(2)})`);
  const weak = off(0.01, 0.2)[0];
  assert.ok(weak.k < near.k * 0.5, `weak tracking dims it (${weak.k.toFixed(2)})`);
  s.bus.emit('hand:pose', { hand: 'right', tracked: false, confidence: 0, palm: [0, 0, 0], tip: [0, 0, 0], curl: 0, pinching: false });
  assert.deepEqual(s.state.update(1 / 72).tips, [], 'lost hand: no glow');
  void v;
});

// Remake surfaces (biyon-45, 46, 47, 58 shell): target geometry and extras, lane tCenter, region targets on
// cut:add / cut:remove, when the pads show, their pitches, and the count-in ring.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createMockRegistry, createMockTransport } from '../../src/mock/index.ts';
import { surfaceDist, timeAt, padLocal as padFace } from '../../src/input/targets.ts';
import {
  countInLook, laneTarget, padPair, padPitches, padTargets, playheadTarget, PLAYHEAD, regionTarget, resetTarget, RIBBON, SEC_PER_M, toWorld,
} from '../../src/ui/remake/layout.ts';
import { createRemakeState } from '../../src/ui/remake/state.ts';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const FRAME = { eye: [0, 1.2, 0], yaw: 0 };
const MANIFEST = {
  id: 'dvorak9', title: 'x', composer: 'x', durationSec: 60,
  stems: [{ id: 'perc', file: '', homeSeat: [1, 1.7, -2], pitchRange: [40, 52] }, { id: 'vln', file: '', homeSeat: [-1, 1, -1], pitchRange: [55, 96] }],
  scale: { tonic: 64, steps: [0, 2, 3, 5, 7, 8, 10] },
  replace: [{ stem: 'perc', instrument: 'pads' }],
  credits: [],
};
const NOTES = [
  { id: 1, t: 9.5, dur: 0.4, pitch: 47, vel: 90, stem: 'perc', glyph: 'quarter', beat: 0 },
  { id: 2, t: 10.2, dur: 0.4, pitch: 52, vel: 90, stem: 'perc', glyph: 'quarter', beat: 0 },
  { id: 3, t: 11.0, dur: 0.4, pitch: 47, vel: 90, stem: 'perc', glyph: 'eighth', beat: 0 },
  { id: 4, t: 12.0, dur: 0.4, pitch: 52, vel: 90, stem: 'perc', glyph: 'quarter', beat: 0 }, // at t1: outside [t0, t1)
  { id: 5, t: 10.5, dur: 0.4, pitch: 70, vel: 90, stem: 'vln', glyph: 'quarter', beat: 0 },
];
const BEATS = { tempo: [{ t: 0, bpm: 120 }], beats: Array.from({ length: 120 }, (_, i) => i * 0.5), downbeats: Array.from({ length: 30 }, (_, i) => i * 2) };

/** A parts stand-in that follows cut:add / cut:remove like the real one. */
function fakeParts(bus) {
  const cuts = new Map();
  let take = null;
  bus.on('cut:add', ({ cut }) => { cuts.set(cut.id, cut); if (cut.stem === 'perc') take = { cutId: cut.id, instrument: 'pads', pass: 0 }; });
  bus.on('cut:remove', ({ id }) => { cuts.delete(id); if (take?.cutId === id) take = null; });
  return { cuts: () => [...cuts.values()], parts: () => [], taking: () => take, endTake() { take = null; } };
}

async function setup() {
  const bus = createBus();
  let clock = 0;
  const transport = createMockTransport(bus, 60, () => clock);
  const registry = createMockRegistry();
  const parts = fakeParts(bus);
  const state = createRemakeState({ bus, transport, registry }, {
    parts, head: () => FRAME, beats: () => BEATS, loadNotes: async () => NOTES,
  });
  bus.emit('piece:ready', { id: 'dvorak9', manifest: MANIFEST });
  await new Promise((r) => setImmediate(r)); // notes load
  const byId = (id) => registry.all().find((t) => t.id === id);
  const kinds = () => registry.all().map((t) => t.kind).sort();
  return { bus, transport, registry, parts, state, byId, kinds, tick(dt = 1 / 72) { clock += dt; return state.update(dt); }, setClock(c) { clock = c; } };
}

test('layout: playhead 6 cm, along the ribbon, clear of the lane capsule; inside a 70×66° view pitched 10° down', () => {
  const p = playheadTarget(FRAME), lane = laneTarget(FRAME, 'perc', 30);
  assert.equal(p.kind, 'playhead');
  assert.equal(p.radius, PLAYHEAD.radius);
  assert.ok(near(p.extra.dx, 1) && near(p.extra.dy, 0) && near(p.extra.dz, 0));
  assert.ok(near(p.extra.secPerM, RIBBON.windowSec / RIBBON.halfWidth));
  // A pinch on the lane right at "now" is not inside the playhead, so the lane gets it.
  assert.ok(surfaceDist(p, lane.center) > 0, 'lane centre is outside the playhead sphere');
  assert.ok(surfaceDist(p, lane.center) - lane.radius > 0.02, 'at least 2 cm between the two colliders');
  // Ribbon centre is 31° below the eye at level gaze; the view's half-height is 33°.
  const down = Math.atan2(RIBBON.below, RIBBON.ahead) * 180 / Math.PI;
  assert.ok(down < 33, `${down.toFixed(1)}° below level`);
  // Edges: 32° to either side at most (half-width 35°).
  assert.ok(Math.atan2(RIBBON.halfWidth, RIBBON.ahead) * 180 / Math.PI < 35);
});

test('layout: frames rotate with yaw (90° left: ahead is -x, time runs toward -z)', () => {
  const f = { eye: [0, 1.2, 0], yaw: Math.PI / 2 };
  const lane = laneTarget(f, 'vln', 0);
  assert.ok(near(lane.center[0], -RIBBON.ahead) && near(lane.center[2], 0) && near(lane.center[1], 1.2 - RIBBON.below));
  assert.ok(near(lane.extra.dx, 0) && near(lane.extra.dz, -1));
  assert.deepEqual(toWorld(FRAME, [0, 0, 1]), [0, 1.2, -1]);
});

test('lane: capsule along the ribbon; time under the hand = tCenter + offset × secPerM', () => {
  const lane = laneTarget(FRAME, 'perc', 30);
  assert.equal(lane.id, 'lane:perc');
  assert.equal(lane.kind, 'lane');
  assert.equal(lane.stem, 'perc');
  assert.equal(lane.extra.halfLength, RIBBON.halfWidth);
  assert.ok(lane.radius >= 0.03, 'a few cm thick');
  assert.equal(lane.extra.tCenter, 30);
  const right = [lane.center[0] + 0.1, lane.center[1], lane.center[2]];
  assert.ok(near(timeAt(lane, right), 30 + 0.1 * SEC_PER_M));
  assert.ok(surfaceDist(lane, [lane.center[0] + 0.27, lane.center[1] + 0.02, lane.center[2]]) < 0, 'end of the lane is inside');
});

test('state: nothing registered before a piece; lane appears on summon and its tCenter follows transport time', async () => {
  const bus = createBus();
  const registry = createMockRegistry();
  const s = createRemakeState({ bus, transport: createMockTransport(bus, 60, () => 0), registry }, { parts: fakeParts(bus), head: () => FRAME, loadNotes: async () => [] });
  assert.equal(s.update(0.01).visible, false);
  assert.equal(registry.all().length, 0);

  const e = await setup();
  e.tick();
  assert.deepEqual(e.kinds(), ['playhead', 'reset']);
  e.bus.emit('gaze:summon', { stem: 'perc' });
  e.transport.seek(20);
  e.transport.play();
  e.tick(0.5);
  assert.ok(near(e.byId('lane:perc').extra.tCenter, e.transport.time()));
  const t1 = e.transport.time();
  e.tick(0.25);
  assert.ok(e.transport.time() > t1);
  assert.ok(near(e.byId('lane:perc').extra.tCenter, e.transport.time()), 'tCenter updated every frame');
  e.bus.emit('gaze:summon', { stem: 'vln' });
  e.tick();
  assert.equal(e.byId('lane:perc'), undefined, 'one lane at a time');
  assert.ok(e.byId('lane:vln'));
});

test('regions: cut:add registers a hollow region capsule over its span with ghost notes; cut:remove drops it', async () => {
  const e = await setup();
  e.bus.emit('gaze:summon', { stem: 'perc' });
  e.transport.seek(10);
  e.bus.emit('cut:preview', { stem: 'perc', t0: 10, t1: 12 });
  let v = e.tick();
  assert.ok(v.preview && near(v.preview.x0, 0) && near(v.preview.x1, 2 / SEC_PER_M), 'preview span drawn');
  e.bus.emit('cut:add', { cut: { id: 'c1', stem: 'perc', t0: 10, t1: 12 } });
  v = e.tick();
  assert.equal(v.preview, null);
  const r = e.byId('region:c1');
  assert.ok(r, 'region target registered');
  assert.equal(r.kind, 'region');
  assert.ok(near(r.extra.halfLength, 1 / SEC_PER_M));
  const lane = e.byId('lane:perc');
  assert.ok(near(r.center[0] - lane.center[0], 1 / SEC_PER_M), 'centred on the region');
  assert.equal(v.regions.length, 1);
  assert.deepEqual(v.regions[0].ghosts.map((m) => m.note.id), [2, 3], 'outlines = exactly the region\'s notes');
  assert.deepEqual(e.state.ghostNotes({ id: 'c1', stem: 'perc', t0: 10, t1: 12 }).map((n) => n.id), [2, 3]);
  assert.ok(!v.notes.some((m) => m.note.id === 2 || m.note.id === 3), 'cut notes are not drawn solid');
  assert.ok(v.notes.some((m) => m.note.id === 1), 'notes outside the cut are');

  // Regions scroll with time: 1 s later the region centre moved 1 s worth to the left.
  e.transport.seek(11);
  e.tick();
  assert.ok(near(e.byId('region:c1').center[0] - e.byId('lane:perc').center[0], 0), 'moved with time');

  e.bus.emit('cut:remove', { id: 'c1' });
  v = e.tick();
  assert.equal(e.byId('region:c1'), undefined);
  assert.equal(v.regions.length, 0);
});

test('regions: out of the ±8 s window → no target; other stems\' cuts are not on this lane', async () => {
  const e = await setup();
  e.bus.emit('gaze:summon', { stem: 'vln' });
  e.bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 10, t1: 12 } });
  e.bus.emit('cut:add', { cut: { id: 'far', stem: 'vln', t0: 40, t1: 42 } });
  e.transport.seek(10);
  e.tick();
  assert.equal(e.byId('region:p'), undefined);
  assert.equal(e.byId('region:far'), undefined);
  const r = regionTarget(FRAME, { id: 'x', stem: 'vln', t0: 15, t1: 30 }, 10);
  assert.ok(near(r.extra.halfLength * 2, RIBBON.halfWidth - 5 / SEC_PER_M), 'clipped to the ribbon end');
});

test('pads: hidden until a pads take or a perc cut; then 2 up-facing pads (the timpani pair), clear of the summoned creature', async () => {
  const e = await setup();
  e.tick();
  assert.ok(!e.kinds().includes('pad'));
  e.bus.emit('cut:add', { cut: { id: 'v', stem: 'vln', t0: 10, t1: 12 } });
  e.tick();
  assert.ok(!e.kinds().includes('pad'), 'a cut on a non-replaceable stem does not show the pads');
  e.bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 20, t1: 22 } });
  const v = e.tick();
  const pads = e.registry.all().filter((t) => t.kind === 'pad');
  assert.equal(pads.length, 2);
  assert.deepEqual(pads.map((p) => p.extra.pitch), [47, 52]);
  assert.deepEqual(v.pads.map((p) => p.pitch), [47, 52]);
  for (const p of pads) assert.deepEqual([p.extra.dx, p.extra.dy, p.extra.dz], [0, 1, 0]);
  // A fingertip 2 cm above a pad's centre is over its face (radial 0, height +2 cm).
  const f = padFace(pads[1], [pads[1].center[0], pads[1].center[1] + 0.02, pads[1].center[2]]);
  assert.ok(near(f.height, 0.02) && near(f.radial, 0));
  // Pads stay apart: no overlap between neighbours.
  assert.ok(Math.hypot(pads[0].center[0] - pads[1].center[0], pads[0].center[2] - pads[1].center[2]) > 2 * pads[0].radius);
  // Still shown after the take ends while the cut exists; gone once it is removed.
  e.parts.endTake();
  e.tick();
  assert.equal(e.registry.all().filter((t) => t.kind === 'pad').length, 2);
  e.bus.emit('cut:remove', { id: 'p' });
  e.tick();
  assert.equal(e.registry.all().filter((t) => t.kind === 'pad').length, 0);
});

test('pad pitches: tonic and dominant near MIDI 40–52', () => {
  assert.deepEqual(padPitches(64), [40, 47, 52]); // E: Dvořák's timpani notes are 47 and 52
  assert.deepEqual(padPitches(60), [43, 48, 55]); // C: G and C, the Beethoven timpani pair
  assert.deepEqual(padPitches(62), [38, 45, 50]); // D: 57 is further outside the range than 38
  assert.equal(padTargets(FRAME, [43, 48])[0].id, 'pad:0');
  assert.deepEqual(padPair(padPitches(64)), [47, 52]);
  assert.deepEqual(padPair(padPitches(60)), [43, 48]);
});

test('count-in ring: fills over one bar with a pulse on each of the 4 ticks, then goes', async () => {
  const e = await setup();
  e.bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 20, t1: 22 } });
  e.transport.seek(18);
  e.tick();
  const fills = [];
  for (let left = 4; left >= 1; left--) {
    e.bus.emit('countin', { cutId: 'p', beatsLeft: left });
    const at = e.tick(0.001).countIn;
    assert.ok(at.pulse > 0.95, 'pulse on the tick');
    const mid = e.tick(0.25).countIn; // half a beat later (120 bpm)
    assert.ok(mid.pulse < 0.2, 'pulse decays');
    fills.push(mid.fill);
    e.tick(0.249);
  }
  [0.125, 0.375, 0.625, 0.875].forEach((want, i) => assert.ok(near(fills[i], want, 0.002), `beat ${i + 1}: ${fills[i]}`));
  assert.equal(e.tick(0.6).countIn, null, 'gone after the bar');
  assert.equal(countInLook(null, 0), null);
  assert.equal(countInLook({ cutId: 'p', total: 4, beatsLeft: 1, at: 0, beatLen: 0.5 }, 0.5).fill, 1);
});

test('part:hit: the nearest pad flashes and an amber note flies from the fingertip into the matching outline', async () => {
  const e = await setup();
  e.bus.emit('gaze:summon', { stem: 'perc' });
  e.bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 10, t1: 12 } });
  e.transport.seek(10);
  e.tick();
  const from = [0.1, 0.8, -0.35];
  e.bus.emit('part:hit', { cutId: 'p', instrument: 'pads', pitch: 52, vel: 100, t: 10.25, from });
  let v = e.tick(0.001);
  assert.ok(v.pads[1].flash > 0.9 && v.pads[0].flash === 0, 'pad 52 flashes');
  assert.equal(v.flights.length, 1);
  assert.deepEqual(v.flights[0].from, from);
  // Lands on note 2 (t 10.2, pitch 52): x = 0.2 s along the lane, top of the pitch range.
  const lane = e.byId('lane:perc');
  assert.ok(near(v.flights[0].to[0], lane.center[0] + 0.2 / SEC_PER_M, 1e-4));
  assert.ok(v.flights[0].to[1] > lane.center[1], 'high pitch sits high in the lane');
  v = e.tick(0.5);
  assert.equal(v.flights.length, 0, 'flight over after 0.4 s');
  assert.ok(v.pads[1].flash === 0);
});

test('playhead brightens while held; reset ring follows reset:progress', async () => {
  const e = await setup();
  e.bus.emit('hand:pinch', { hand: 'right', down: true, targetId: 'playhead' });
  assert.equal(e.tick().playheadHeld, true);
  e.bus.emit('hand:pinch', { hand: 'right', down: false, targetId: 'playhead' });
  assert.equal(e.tick().playheadHeld, false);
  e.bus.emit('hand:pinch', { hand: 'left', down: true, targetId: 'lane:perc' });
  assert.equal(e.tick().playheadHeld, false);
  e.bus.emit('reset:progress', { progress: 0.5 });
  assert.equal(e.tick().reset.progress, 0.5);
  const reset = e.byId('reset');
  assert.equal(reset.kind, 'reset');
  assert.ok(reset.center[0] > 0.2 && Math.abs(reset.center[1] - 1.2) < 0.1, 'right of the view at eye level (inside 70×66°)');
  assert.deepEqual(resetTarget(FRAME).center, reset.center);
  e.bus.emit('app:reset', { piece: 'dvorak9' });
  assert.ok(e.tick().reset.flash > 0.9);
});

test('frames: the ribbon glides to the summon pose; pads and shell keep the pose from the first play', async () => {
  const bus = createBus();
  let head = { eye: [0, 1.2, 0], yaw: 0 };
  const registry = createMockRegistry();
  const transport = createMockTransport(bus, 60, () => 0);
  const parts = fakeParts(bus);
  const s = createRemakeState({ bus, transport, registry }, { parts, head: () => head, loadNotes: async () => [] });
  bus.emit('piece:ready', { id: 'dvorak9', manifest: MANIFEST });
  transport.play();
  bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 1, t1: 2 } });
  s.update(0.01);
  const pad0 = registry.all().find((t) => t.id === 'pad:1').center;
  head = { eye: [0, 1.2, 0], yaw: 0.6 };
  bus.emit('gaze:summon', { stem: 'perc' });
  s.update(0.3);
  const mid = registry.all().find((t) => t.id === 'lane:perc').center;
  s.update(0.4);
  const end = registry.all().find((t) => t.id === 'lane:perc').center;
  assert.deepEqual(end.map((x) => +x.toFixed(6)), laneTarget(head, 'perc', 0).center.map((x) => +x.toFixed(6)), 'arrived after 0.6 s');
  assert.ok(Math.abs(mid[0]) < Math.abs(end[0]) && Math.abs(mid[0]) > 0, 'mid-glide');
  assert.deepEqual(registry.all().find((t) => t.id === 'pad:1').center, pad0, 'pads did not move');
});

test('F27 layout: pads and reset shell sit inside 70×66° of the forward view, within 0.61 m, and pads clear the creature sphere', () => {
  // Seated eye at the origin looking down -z; the summoned creature waits 0.45 m ahead, 0.15 m below, radius 0.25.
  const f = { eye: [0, 0, 0], yaw: 0 };
  const creature = [0, -0.15, -0.45];
  const pts = [...padTargets(f, [47, 52]).map((p) => ({ id: p.id, c: p.center, pad: true })), { id: 'reset', c: resetTarget(f).center }];
  for (const { id, c, pad } of pts) {
    const yaw = Math.atan2(c[0], -c[2]) * 57.2958, pitch = Math.atan2(c[1], Math.hypot(c[0], c[2])) * 57.2958, d = Math.hypot(...c);
    assert.ok(Math.abs(yaw) <= 35 && Math.abs(pitch) <= 33, `${id} inside 70×66° (yaw ${yaw.toFixed(1)}, pitch ${pitch.toFixed(1)})`);
    assert.ok(d <= 0.61, `${id} within reach (${d.toFixed(2)} m)`);
    if (pad) assert.ok(Math.hypot(c[0] - creature[0], c[1] - creature[1], c[2] - creature[2]) > 0.25, `${id} outside the creature's fist sphere`);
  }
});

test('ribbon, lane ends and playhead sit outside the summoned creature, inside 70×66° and reach', () => {
  const f = { eye: [0, 0, 0], yaw: 0 };
  const creature = [0, -0.15, -0.45], R = 0.25;
  const lane = laneTarget(f, 'perc', 0), ph = playheadTarget(f);
  const d = [lane.extra.dx, lane.extra.dy, lane.extra.dz], h = lane.extra.halfLength;
  const pts = [
    ['lane centre', lane.center], ['lane left end', lane.center.map((c, i) => c - d[i] * h)], ['lane right end', lane.center.map((c, i) => c + d[i] * h)],
    ['playhead', ph.center],
  ];
  for (const [id, c] of pts) {
    const yaw = Math.atan2(c[0], -c[2]) * 57.2958, pitch = Math.atan2(c[1], Math.hypot(c[0], c[2])) * 57.2958, dist = Math.hypot(...c);
    assert.ok(Math.abs(yaw) <= 35 && Math.abs(pitch) <= 33, `${id} inside 70×66° (yaw ${yaw.toFixed(1)}, pitch ${pitch.toFixed(1)})`);
    assert.ok(dist <= 0.61, `${id} within reach (${dist.toFixed(2)} m)`);
    const gap = Math.hypot(c[0] - creature[0], c[1] - creature[1], c[2] - creature[2]) - R;
    assert.ok(gap > 0.02, `${id} clear of the creature's body (gap ${gap.toFixed(3)} m)`);
  }
});

test('ghost outlines match exactly the cut region\'s notes in the real Dvořák notes.json (F36)', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => JSON.parse(readFileSync(new URL(`../../public/pieces/dvorak9/${f}`, import.meta.url), 'utf8'));
  const manifest = read('manifest.json'), beats = read('beats.json'), raw = read('notes.json');
  const notes = Array.isArray(raw) ? raw : raw.notes;
  const bus = createBus();
  let clock = 0;
  const transport = createMockTransport(bus, manifest.durationSec, () => clock);
  const registry = createMockRegistry();
  const state = createRemakeState({ bus, transport, registry }, {
    parts: fakeParts(bus), head: () => FRAME, beats: () => beats, loadNotes: async () => notes,
  });
  bus.emit('piece:ready', { id: 'dvorak9', manifest });
  await new Promise((r) => setImmediate(r));
  const near1 = (t) => beats.beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  // The densest 4 s of each stem: perc around 64 s (15 notes), violins around 70.5 s (60 notes).
  for (const [stem, from] of [['perc', 64], ['vln', 70.5]]) {
    const t0 = near1(from), t1 = near1(from + 4);
    const id = `real-${stem}`;
    bus.emit('gaze:summon', { stem });
    transport.seek((t0 + t1) / 2); // the whole region inside the ±8 s ribbon window
    bus.emit('cut:add', { cut: { id, stem, t0, t1 } });
    clock += 1 / 72;
    const v = state.update(1 / 72);
    const region = v.regions.find((r) => r.id === id) ?? v.regions[0];
    const want = notes.filter((n) => n.stem === stem && n.t >= t0 && n.t < t1).map((n) => n.id).sort((a, b) => a - b);
    const got = region.ghosts.map((m) => m.note.id).sort((a, b) => a - b);
    assert.ok(want.length >= 10, `${stem}: a real, busy region (${want.length} notes)`);
    assert.deepEqual(got, want, `${stem} ${t0.toFixed(2)}-${t1.toFixed(2)} s: outlines = exactly the notes.json notes in the region`);
    assert.ok(!v.notes.some((m) => want.includes(m.note.id)), `${stem}: none of them is also drawn solid`);
    bus.emit('cut:remove', { id });
  }
});

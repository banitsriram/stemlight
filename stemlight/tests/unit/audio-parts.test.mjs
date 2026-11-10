// Cuts, count-in, guide track, 1/8 snapping and loop playback (biyon-23, 24, 25: F10, F11, F34, F35).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createEngine } from '../../src/audio/engine.ts';
import { createParts, GUIDE_GAIN } from '../../src/audio/parts.ts';
import { snapCut, snapEighth } from '../../src/audio/mix.ts';
import { beats120, fakeContext, manifest } from './audio-fake.mjs';

async function setup(sec = 40, replace) {
  const bus = createBus();
  const ctx = fakeContext();
  const engine = createEngine(bus, { createContext: () => ctx, fetchBytes: async () => new ArrayBuffer(48000 * sec) });
  const parts = createParts(engine, bus);
  const m = manifest(sec, replace);
  await engine.load('fixture', m, beats120(sec), '/x');
  bus.emit('piece:ready', { id: 'fixture', manifest: m });
  const step = (dt, n = 1) => { for (let i = 0; i < n; i++) { ctx.currentTime += dt; engine.update(); parts.update(); } };
  const stem = (id) => engine.stems().find((s) => s.id === id);
  return { bus, ctx, engine, parts, step, stem };
}

test('20 trims: each region is silent on playback, outside stays full; 10 undos restore it (F10 audio)', async () => {
  const { bus, ctx, engine, step, stem } = await setup(40, []);
  for (let i = 0; i < 20; i++) {
    const t0 = 1 + i * 1.5 + 0.07, t1 = t0 + 0.9; // deliberately off-beat: must snap
    const id = `c${i}`;
    bus.emit('cut:add', { cut: { id, stem: 'vln', t0, t1 } });
    engine.transport.seek(Math.max(0, t0 - 1));
    engine.transport.play();
    step(0.01);
    const s = snapCut(beats120(40).beats, t0, t1);
    const at = (t) => stem('vln').trim.gain.at(engine.ctxTimeAt(t));
    assert.ok(s.t1 - s.t0 >= 0.5 - 1e-9, 'at least one beat');
    assert.equal(at((s.t0 + s.t1) / 2), 0, `trim ${i} silent mid-region`);
    assert.equal(at(s.t0 - 0.05), 1, `trim ${i} full before`);
    assert.equal(at(s.t1 + 0.05), 1, `trim ${i} full after`);
    if (i < 10) {
      bus.emit('cut:remove', { id });
      step(0.01);
      assert.equal(stem('vln').trim.gain.at(engine.ctxTimeAt((s.t0 + s.t1) / 2)), 1, `undo ${i} restores`);
    }
    engine.transport.pause();
  }
});

test('off-grid strikes (±60 ms) land on the 1/8 grid (F11)', () => {
  const b = beats120(20).beats;
  for (let k = 4; k < 40; k++) {
    const grid = k * 0.25;
    for (const off of [-0.06, -0.03, 0, 0.03, 0.06]) assert.equal(snapEighth(b, grid + off), grid);
  }
});

test('take: 4 count-in events, guide −18 dB on pass 0 only, 3 loops sample-exact, hits replayed on later passes (F11, F34, F35)', async () => {
  const { bus, ctx, engine, parts, step, stem } = await setup(40);
  const countins = [];
  bus.on('countin', (e) => countins.push(e.beatsLeft));
  const hits = [];
  bus.on('part:hit', (e) => hits.push(e));
  bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 8, t1: 10 } }); // one bar
  assert.equal(parts.taking().cutId, 'p');
  // Count-in runs from t=6 (4 beats before 8).
  assert.ok(Math.abs(engine.transport.time() - 6) < 0.06);
  const guideAt = (t) => stem('perc').trim.gain.at(engine.ctxTimeAt(t));

  // Advance into the region (pass 0) and play 3 off-grid hits.
  const advanceTo = (t) => { while (engine.transport.time() < t) step(0.004); };
  advanceTo(8.03);
  assert.ok(Math.abs(guideAt(9) - GUIDE_GAIN) < 1e-9, 'guide at −18 dB on pass 0');
  parts.strike('pads', 50, 100, [0, 1, -0.4]); // 8.03 → 8.0
  advanceTo(8.52);
  parts.strike('pads', 57, 90, [0, 1, -0.4]);  // 8.52 → 8.5
  advanceTo(9.24);
  parts.strike('pads', 50, 80, [0, 1, -0.4]);  // 9.24 → 9.25
  assert.deepEqual(countins, [4, 3, 2, 1]);
  assert.deepEqual(parts.parts()[0].hits.map((h) => h.tOffset), [0, 0.5, 1.25]);
  assert.deepEqual(hits.map((h) => h.t), [8, 8.5, 9.25]);

  // Run three more passes worth of time, recording voice start times.
  const voicesBefore = ctx.voices.length;
  const wraps = () => engine.log.filter((e) => e.kind === 'wrap').map((e) => e.data.at);
  for (let i = 0; i < 2000 && engine.pass() < 3; i++) step(0.004);
  const w = wraps();
  assert.ok(w.length >= 1, 'looped');
  for (let i = 1; i < w.length; i++) assert.ok(Math.abs(w[i] - w[i - 1] - 2) < 1e-9, 'each pass is exactly the region length');
  // Pass 1: guide gone, cut silent.
  assert.equal(stem('perc').trim.gain.at(w[0] + 1), 0, 'guide silent on pass 1');
  // Every recorded hit is scheduled on pass 1 at wrap + tOffset (the timpani's fundamental partial).
  const pass1 = ctx.voices.slice(voicesBefore).map((v) => v.when).filter((t) => t >= w[0] - 1e-9 && t < w[0] + 2);
  for (const off of [0, 0.5, 1.25]) assert.ok(pass1.some((t) => Math.abs(t - (w[0] + off)) < 1e-6), `hit at +${off} replayed on pass 1`);
  // No new hits on pass 1, so the take ends after it and the piece plays on.
  for (let i = 0; i < 1000; i++) step(0.004);
  assert.equal(parts.taking(), null);
  assert.ok(engine.transport.time() > 10, 'playback continues past the region');
  const trims = parts.log.filter((e) => e.kind === 'trim' && e.data.stem === 'perc');
  assert.ok(trims.some((e) => e.data.pass === 0 && Math.abs(e.data.gain - GUIDE_GAIN) < 1e-9), 'logged −18 dB on pass 0');
  assert.ok(trims.some((e) => e.data.pass === 1 && e.data.gain === 0), 'logged silent on pass 1');
});

test('lockout: a second strike on the same pad within 90 ms is ignored', async () => {
  const { bus, ctx, parts } = await setup(20);
  const hits = [];
  bus.on('part:hit', (e) => hits.push(e));
  parts.strike('pads', 50, 100, [0, 0, 0]);
  ctx.currentTime += 0.05;
  parts.strike('pads', 50, 100, [0, 0, 0]);
  ctx.currentTime += 0.05;
  parts.strike('pads', 50, 100, [0, 0, 0]);
  assert.equal(hits.length, 2);
});

test('3 loop passes stay sample-exact while the user keeps playing (F11)', async () => {
  const { bus, engine, parts, step } = await setup(40);
  bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 8, t1: 10 } });
  let lastPass = -1;
  for (let i = 0; i < 4000 && engine.pass() < 3; i++) {
    step(0.004);
    const t = engine.transport.time();
    if (t > 8.2 && t < 9.8 && engine.pass() !== lastPass) { parts.strike('pads', 50 + engine.pass(), 100, [0, 0, 0]); lastPass = engine.pass(); }
  }
  const w = engine.log.filter((e) => e.kind === 'wrap').map((e) => e.data.at);
  assert.equal(engine.pass(), 3);
  assert.ok(w.length >= 3);
  for (let i = 1; i < w.length; i++) assert.ok(Math.abs(w[i] - w[i - 1] - 2) < 1e-9);
  assert.equal(parts.parts()[0].hits.length, 3);
  assert.ok(engine.transport.time() >= 8 && engine.transport.time() < 10, 'still inside the loop');
});

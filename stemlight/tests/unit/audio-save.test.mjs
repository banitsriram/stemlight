// Saving and pause/resume (biyon-28, 29: F22, F23, F40 audio side).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createEngine } from '../../src/audio/engine.ts';
import { createParts } from '../../src/audio/parts.ts';
import { createSave, emptySave, sanitize } from '../../src/audio/save/store.ts';
import { initPersist } from '../../src/audio/save/persist.ts';
import { initLifecycle } from '../../src/audio/lifecycle.ts';
import { beats120, fakeContext, manifest } from './audio-fake.mjs';

const memoryStorage = () => {
  let row;
  return { get: async () => row, set: async (s) => { row = structuredClone(s); }, peek: () => row, clear: () => { row = undefined; } };
};

async function boot(storage) {
  const bus = createBus();
  const ctx = fakeContext();
  const engine = createEngine(bus, { createContext: () => ctx, fetchBytes: async () => new ArrayBuffer(48000 * 30) });
  const parts = createParts(engine, bus);
  const save = await createSave(storage, 0);
  initPersist(bus, save, engine, parts);
  const life = initLifecycle(bus, engine.transport, engine.audio);
  const m = manifest(30);
  await engine.load('dvorak9', m, beats120(30), '/x');
  bus.emit('piece:ready', { id: 'dvorak9', manifest: m });
  const step = (dt, n = 1) => { for (let i = 0; i < n; i++) { ctx.currentTime += dt; engine.update(); parts.update(); } };
  return { bus, ctx, engine, parts, save, life, step };
}

test('reload restores locks, solo, EQ, cuts and the recorded part (F22)', async () => {
  const storage = memoryStorage();
  const a = await boot(storage);
  a.bus.emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0.5 });
  a.bus.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
  a.bus.emit('stem:mute', { stem: 'fl', state: 'held', lockProgress: 0.3 }); // transient: not kept
  a.bus.emit('stem:eq', { stem: 'hn', low: 6, mid: 0, high: -4 });
  a.bus.emit('cut:add', { cut: { id: 'trim1', stem: 'cb', t0: 3, t1: 4 } });
  a.bus.emit('cut:add', { cut: { id: 'p', stem: 'perc', t0: 8, t1: 10 } });
  while (a.engine.transport.time() < 8.5) a.step(0.004);
  a.parts.strike('pads', 50, 100, [0, 0, 0]);
  a.bus.emit('app:pause', {});
  await a.save.flush();

  const b = await boot(storage);
  const mix = b.engine.mix();
  assert.equal(mix.mute.vln, 'locked');
  assert.equal(mix.mute.fl, 'on');
  assert.deepEqual(mix.eq.hn, { low: 6, mid: 0, high: -4 });
  assert.deepEqual(b.parts.cuts().map((c) => c.id).sort(), ['p', 'trim1']);
  assert.deepEqual(b.parts.parts().find((p) => p.cutId === 'p').hits.map((h) => h.tOffset), [0.5]);
  assert.equal(b.parts.taking(), null, 'a restored cut does not start a new take');
  assert.equal(b.engine.stems().find((s) => s.id === 'vln').gain.gain.value, 0, 'the lock is audible after reload');
});

test('cleared or corrupt storage gives a clean start with no error (F22)', async () => {
  const storage = memoryStorage();
  const a = await boot(storage);
  assert.deepEqual(a.save.load(), emptySave());
  assert.deepEqual(sanitize({ version: 7, perPiece: 3 }), emptySave());
  assert.deepEqual(sanitize('junk'), emptySave());
  const broken = { get: async () => { throw new Error('blocked'); }, set: async () => { throw new Error('blocked'); } };
  const c = await createSave(broken, 0);
  c.patch({ tutorialDone: true });
  await c.flush();
  assert.equal(c.load().tutorialDone, true, 'works in memory when storage is blocked');
});

test('reset clears only this piece, 10 times (F40 audio side)', async () => {
  const storage = memoryStorage();
  const a = await boot(storage);
  a.save.patch({ perPiece: { ...a.save.load().perPiece, beethoven5: { mute: {}, solo: 'hn', eq: {}, cuts: [], parts: [] } } });
  for (let i = 0; i < 10; i++) {
    a.bus.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
    a.bus.emit('cut:add', { cut: { id: `t${i}`, stem: 'cb', t0: 3, t1: 4 } });
    a.bus.emit('app:reset', { piece: 'dvorak9' });
    assert.equal(a.engine.mix().mute.vln, 'on');
    assert.equal(a.parts.cuts().length, 0);
    assert.equal(a.save.load().perPiece.dvorak9, undefined);
    assert.equal(a.save.load().perPiece.beethoven5.solo, 'hn', 'other piece untouched');
  }
});

test('pause and resume: transport stops, then resumes from the same time if it was playing (F23)', async () => {
  const a = await boot(memoryStorage());
  a.engine.transport.play();
  a.step(0.01, 100);
  const t = a.engine.transport.time();
  a.life.pause();
  assert.equal(a.engine.transport.playing(), false);
  a.ctx.currentTime += 5;
  assert.ok(Math.abs(a.engine.transport.time() - t) < 0.02);
  await a.life.resume();
  assert.equal(a.engine.transport.playing(), true);
  assert.ok(Math.abs(a.engine.transport.time() - t) < 0.02);
  // Paused while already stopped: resume leaves it stopped.
  a.engine.transport.pause();
  a.life.pause();
  await a.life.resume();
  assert.equal(a.engine.transport.playing(), false);
});

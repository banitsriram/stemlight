// The minimal piece order: when beethoven5 ends, dvorak9 loads and plays.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createEngine } from '../../src/audio/engine.ts';
import { initSequence } from '../../src/audio/sequence.ts';
import { beats120, fakeContext, manifest } from './audio-fake.mjs';

test('piece:end on beethoven5 loads dvorak9 and plays it; the last piece just ends', async () => {
  const bus = createBus();
  const ctx = fakeContext();
  const engine = createEngine(bus, { createContext: () => ctx, fetchBytes: async () => new ArrayBuffer(48000 * 4) });
  const served = { manifest: { ...manifest(4), id: 'dvorak9' }, beats: beats120(4) };
  globalThis.fetch = async (url) => ({ ok: true, json: async () => (String(url).endsWith('manifest.json') ? served.manifest : served.beats) });
  const ready = [];
  bus.on('piece:ready', (e) => ready.push(e.id));
  initSequence(engine, bus);
  await engine.load('beethoven5', manifest(4), beats120(4), '/x');
  engine.transport.play();
  ctx.currentTime += 5;
  engine.update(); // reaches the end → piece:end
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ready, ['dvorak9']);
  assert.equal(engine.transport.playing(), true);
  ctx.currentTime += 5;
  engine.update();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ready, ['dvorak9'], 'nothing after the last piece');
});

// Audio engine logic against a fake AudioContext that records every source start.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createEngine } from '../../src/audio/engine.ts';
import { beatsCrossed, emptyMix, stemGain } from '../../src/audio/mix.ts';

function param(v = 0) {
  const p = {
    value: v,
    cancelScheduledValues() {}, setValueAtTime(x) { p.value = x; }, linearRampToValueAtTime(x) { p.value = x; },
    setTargetAtTime(x) { p.value = x; },
  };
  return p;
}
function node(extra = {}) {
  return { connect(n) { return n; }, disconnect() {}, ...extra };
}

function fakeContext() {
  const starts = [];
  const ctx = {
    currentTime: 0, sampleRate: 48000, destination: node(), starts,
    listener: { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(-1), upX: param(), upY: param(1), upZ: param() },
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param(), gain: param() }),
    createPanner: () => node({ positionX: param(), positionY: param(), positionZ: param() }),
    createBuffer: (c, len, sr) => ({ numberOfChannels: c, length: len, duration: len / sr }),
    createBufferSource() {
      const src = node({
        buffer: null, onended: null, stopped: false,
        start(when = 0, offset = 0) { starts.push({ src, when, offset }); },
        stop() { src.stopped = true; },
      });
      return src;
    },
    decodeAudioData: async (bytes) => ({ numberOfChannels: 1, length: bytes.byteLength, duration: bytes.byteLength / 48000 }),
    resume: async () => {},
  };
  return ctx;
}

const STEMS = ['vln', 'vla_vc', 'cb', 'fl', 'reeds', 'hn', 'brass', 'perc', 'harp'];
const manifest = (sec) => ({
  id: 'fixture', title: 't', composer: 'c', durationSec: sec,
  stems: STEMS.map((id, i) => ({ id, file: `stems/${id}.opus`, homeSeat: [i, 1, -2], pitchRange: [40, 80] })),
  scale: { tonic: 60, steps: [0, 2, 4, 5, 7, 9, 11] }, replace: [], credits: [],
});
const beats = { tempo: [{ t: 0, bpm: 120 }], beats: Array.from({ length: 360 }, (_, i) => i * 0.5), downbeats: Array.from({ length: 90 }, (_, i) => i * 2) };

async function setup(sec = 180) {
  const bus = createBus();
  const ctx = fakeContext();
  const engine = createEngine(bus, { createContext: () => ctx, fetchBytes: async () => new ArrayBuffer(48000 * sec) });
  await engine.load('fixture', manifest(sec), beats, '/pieces/fixture');
  return { bus, ctx, engine };
}

test('3 min with 10 seeks: every stem starts at one context time from one offset (F03)', async () => {
  const { ctx, engine } = await setup(180);
  const t = engine.transport;
  t.play();
  const seeks = [12.3, 47, 3.25, 99.9, 150, 0, 178, 60.5, 120.01, 33];
  for (const s of seeks) {
    ctx.currentTime += 1;
    engine.update();
    t.seek(s);
  }
  ctx.currentTime += 200;
  engine.update();
  // 11 start batches (play + 10 seeks) of 9 stems each.
  assert.equal(ctx.starts.length, 99);
  for (let b = 0; b < 11; b++) {
    const batch = ctx.starts.slice(b * 9, b * 9 + 9);
    const whens = new Set(batch.map((s) => s.when)), offsets = new Set(batch.map((s) => s.offset));
    assert.equal(whens.size, 1, `batch ${b} start times differ`);
    assert.equal(offsets.size, 1, `batch ${b} offsets differ`);
  }
  assert.deepEqual(ctx.starts.slice(9).filter((_, i) => i % 9 === 0).map((s) => s.offset), seeks);
  assert.equal(t.playing(), false, 'stops at the end');
  assert.equal(t.time(), 180);
});

test('time follows the context clock, pause freezes it, seek while paused does not start sources', async () => {
  const { ctx, engine } = await setup(60);
  const t = engine.transport;
  t.play();
  ctx.currentTime += 0.05 + 2; // START_LEAD + 2 s
  assert.ok(Math.abs(t.time() - 2) < 1e-9);
  t.pause();
  ctx.currentTime += 5;
  assert.ok(Math.abs(t.time() - 2) < 1e-9);
  const before = ctx.starts.length;
  t.seek(10);
  assert.equal(ctx.starts.length, before);
  assert.equal(t.time(), 10);
  t.play();
  assert.equal(ctx.starts.at(-1).offset, 10);
});

test('mute, lock, solo and EQ events drive the stem gains and filters, and are logged', async () => {
  const { bus, engine } = await setup(30);
  const gain = (id) => engine.stems().find((s) => s.id === id).gain.gain.value;
  bus.emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0.2 });
  assert.equal(gain('vln'), 0);
  bus.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
  assert.equal(gain('vln'), 0);
  bus.emit('stem:mute', { stem: 'vln', state: 'on', lockProgress: 0 });
  assert.equal(gain('vln'), 1);
  bus.emit('stem:solo', { stem: 'hn' });
  assert.equal(gain('hn'), 1);
  assert.equal(gain('vln'), 0);
  bus.emit('stem:solo', { stem: null });
  assert.equal(gain('vln'), 1);
  bus.emit('stem:eq', { stem: 'hn', low: 20, mid: -3, high: -40 });
  const hn = engine.stems().find((s) => s.id === 'hn');
  assert.deepEqual([hn.low.gain.value, hn.mid.gain.value, hn.high.gain.value], [12, -3, -12]);
  assert.ok(engine.log.some((e) => e.kind === 'eq' && e.stem === 'hn'));
  assert.ok(engine.log.filter((e) => e.kind === 'gain' && e.stem === 'vln').length >= 3);
});

test('panners sit at each stem homeSeat from the manifest', async () => {
  const { engine } = await setup(30);
  engine.stems().forEach((s, i) => {
    assert.deepEqual([s.panner.positionX.value, s.panner.positionY.value, s.panner.positionZ.value], [i, 1, -2]);
  });
});

test('beats fire once each while playing, with downbeats flagged', async () => {
  const { bus, ctx, engine } = await setup(30);
  const got = [];
  bus.on('beat', (b) => got.push(b));
  engine.transport.play();
  for (let i = 0; i < 40; i++) { ctx.currentTime += 0.1; engine.update(); }
  // 4 s of music (minus the 0.05 s lead): the beat at the start position, then 0.5 .. 3.5
  assert.deepEqual(got.map((b) => b.t), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  assert.deepEqual(got.filter((b) => b.downbeat).map((b) => b.t), [0, 2]);
});

test('mix rules: a muted solo stays silent; beatsCrossed ignores backwards time', () => {
  const mix = emptyMix();
  mix.solo = 'vln';
  mix.mute.vln = 'locked';
  assert.equal(stemGain(mix, 'vln'), 0);
  assert.deepEqual(beatsCrossed([0, 1, 2], [0], 2, 1), []);
});

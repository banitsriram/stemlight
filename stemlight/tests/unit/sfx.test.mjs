// Each action event plays its sound once, from the creature's position (biyon-52).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { initSfx } from '../../src/ui/sfx/index.ts';
import { fakeContext } from './audio-fake.mjs';

function setup({ playing = true } = {}) {
  const ac = fakeContext();
  ac.state = 'running';
  const outs = [];
  const bus = createBus();
  const ctx = {
    bus,
    transport: { playing: () => playing },
    audio: { context: () => ac, sfxOut: (pos) => { outs.push(pos); return ac.createGain(); } },
  };
  initSfx(ctx, (stem) => (stem === 'vln' ? [0, 1, -0.45] : undefined));
  return { bus, ac, outs, setPlaying: (p) => { playing = p; } };
}

test('summon whooshes from the creature', () => {
  const { bus, ac, outs } = setup();
  bus.emit('gaze:summon', { stem: 'vln' });
  assert.deepEqual(outs, [[0, 1, -0.45]]);
  assert.equal(ac.starts.length, 1); // one noise burst
});

test('mute: chime once per hold, clink on lock, bloom on return', () => {
  const { bus, ac, outs } = setup();
  for (const p of [0, 0.3, 0.6]) bus.emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: p });
  assert.equal(outs.length, 1);
  assert.equal(ac.voices.length, 3);
  bus.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
  bus.emit('stem:mute', { stem: 'vln', state: 'on', lockProgress: 0 });
  assert.equal(outs.length, 3);
  assert.ok(ac.voices.slice(3, 5).every((v) => v.f > 4000)); // clink is high
  assert.ok(ac.voices.slice(5).every((v) => v.f < 400)); // bloom is warm
});

test('solo rises, clearing falls', () => {
  const { bus, ac } = setup();
  bus.emit('stem:solo', { stem: 'vln' });
  bus.emit('stem:solo', { stem: null });
  const f = ac.voices.map((v) => v.f);
  assert.ok(f[0] < f[1] && f[2] > f[3]);
});

test('scrub ticks only while paused, so loop wraps stay quiet', () => {
  const { bus, outs, setPlaying } = setup();
  bus.emit('transport:seek', { t: 3 });
  assert.equal(outs.length, 0);
  setPlaying(false);
  bus.emit('transport:seek', { t: 2 });
  assert.equal(outs.length, 1);
});

test('nothing plays before audio is unlocked', () => {
  const { bus, ac, outs } = setup();
  ac.state = 'suspended';
  bus.emit('gaze:summon', { stem: 'vln' });
  assert.equal(outs.length, 0);
});

test('EQ: a sweep while shaping, a click when the reset snaps it flat', () => {
  const { bus, ac, outs } = setup();
  bus.emit('stem:eq', { stem: 'vln', low: 4, mid: 0, high: -2 });
  assert.equal(ac.starts.length, 1); // the sweep is filtered noise
  bus.emit('stem:eq', { stem: 'vln', low: 0, mid: 0, high: 0 });
  assert.equal(outs.length, 2);
  assert.equal(ac.voices.length, 2); // the click: two short tones, no noise
  bus.emit('stem:eq', { stem: 'vln', low: 0, mid: 0, high: 0 }); // already flat: nothing
  assert.equal(outs.length, 2);
});

test('pinch ticks on close only, from the grabbed creature', () => {
  const { bus, outs } = setup();
  bus.emit('hand:pinch', { hand: 'right', down: true, targetId: 'creature:vln' });
  bus.emit('hand:pinch', { hand: 'right', down: false, targetId: 'creature:vln' });
  bus.emit('hand:pinch', { hand: 'left', down: true, targetId: null });
  assert.deepEqual(outs, [[0, 1, -0.45], [0, 1.1, -0.6]]);
});

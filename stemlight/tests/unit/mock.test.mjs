import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createMockTransport } from '../../src/mock/index.ts';

const dir = new URL('../../public/pieces/fixture/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, dir)));

test('transport advances, pauses, seeks and stops at the end', () => {
  const bus = createBus();
  const states = [], seeks = [];
  bus.on('transport:state', (e) => states.push(e.playing));
  bus.on('transport:seek', (e) => seeks.push(e.t));
  let clock = 100;
  const t = createMockTransport(bus, 20, () => clock);

  t.play(); clock += 3;
  assert.equal(t.time(), 3);
  t.pause(); clock += 5;
  assert.equal(t.time(), 3);
  t.seek(1);
  assert.equal(t.time(), 1);
  t.play(); clock += 2;
  t.seek(10); clock += 1;
  assert.equal(t.time(), 11);
  clock += 100;
  assert.equal(t.time(), 20);
  assert.equal(t.playing(), false);
  assert.deepEqual(states, [true, false, true]);
  assert.deepEqual(seeks, [1, 10]);
});

test('fixture matches the contract', () => {
  const manifest = read('manifest'), notes = read('notes'), beats = read('beats'), envelopes = read('envelopes');
  assert.equal(manifest.stems.length, 9);
  assert.equal(notes.length, 30);
  assert.equal(new Set(notes.map((n) => n.id)).size, 30);
  const stems = new Map(manifest.stems.map((s) => [s.id, s]));
  notes.forEach((n, i) => {
    if (i) assert.ok(n.t >= notes[i - 1].t, 'sorted by t');
    assert.ok(n.t + n.dur <= manifest.durationSec + 2);
    const [low, high] = stems.get(n.stem).pitchRange;
    assert.ok(n.pitch >= low && n.pitch <= high, `pitch in range: ${n.id}`);
  });
  assert.equal(beats.beats.length, 40);
  assert.ok(beats.downbeats.every((d) => beats.beats.includes(d)));
  for (const s of manifest.stems) {
    assert.ok(statSync(new URL(s.file, dir)).size > 0);
    const env = envelopes.stems[s.id];
    assert.equal(env.length, 600);
    assert.ok(env.every((v) => v >= 0 && v <= 1));
    const yaw = Math.abs((Math.atan2(s.homeSeat[0], -s.homeSeat[2]) * 180) / Math.PI);
    const radius = Math.hypot(s.homeSeat[0], s.homeSeat[2]);
    assert.ok(yaw <= 50.01 && radius >= 1.4 && radius <= 2.6, `${s.id} sits in the arc`);
  }
});

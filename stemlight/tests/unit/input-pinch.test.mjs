// hand:pinch (agreed 11 Nov, biyon-16): one down and one up per pinch, carrying what it grabbed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { SPEC, createGestureEngine } from '../../src/input/engine.ts';

const FPS = 72;
const PINCH_CURLS = [0.44, 0.19, 0.12, 0.17];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const hand = (palm, pinch) => {
  const tip = add(palm, [0, 0, -0.08]);
  return { tracked: true, confidence: 1, palm, tip, thumbTip: add(tip, [pinch, 0, 0]), curls: PINCH_CURLS, pinchDist: pinch };
};

test('each pinch emits one down and one up with the grabbed target id (null over nothing)', () => {
  const bus = createBus();
  const got = [];
  bus.on('hand:pinch', (e) => got.push(e));
  const engine = createGestureEngine(bus);
  const reset = { id: 'reset', kind: 'reset', center: [0.3, 0.6, -0.2], radius: 0.06 };
  const targets = [reset];
  let t = 0;
  const step = (right) => { engine.step({ t, hands: { left: null, right }, head: { pos: [0, 1.2, 0], dir: [0, 0, -1] } }, targets); t += 1 / FPS; };
  // The pinch point is the thumb–index midpoint; place it on the reset shell, then in empty air.
  const palmFor = (p) => add(p, [-0.0025, 0, 0.08]);
  for (const [where, id] of [[reset.center, 'reset'], [[0, 1.6, -1.5], null]]) {
    for (let i = 0; i < 10; i++) step(hand(palmFor(where), 0.005));
    for (let i = 0; i < 10; i++) step(hand(palmFor(where), SPEC.pinchExit + 0.02));
    const last2 = got.slice(-2);
    assert.deepEqual(last2.map((e) => [e.hand, e.down, e.targetId]), [['right', true, id], ['right', false, id]]);
  }
  assert.equal(got.length, 4);
});

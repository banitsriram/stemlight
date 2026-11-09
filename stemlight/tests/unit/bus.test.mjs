import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';

test('delivers to every handler for that event only', () => {
  const bus = createBus();
  const got = [];
  bus.on('stem:solo', (e) => got.push(['a', e.stem]));
  bus.on('stem:solo', (e) => got.push(['b', e.stem]));
  bus.on('app:pause', () => got.push(['wrong']));
  bus.emit('stem:solo', { stem: 'vln' });
  assert.deepEqual(got, [['a', 'vln'], ['b', 'vln']]);
});

test('unsubscribe stops delivery, even from inside a handler', () => {
  const bus = createBus();
  let first = 0, second = 0;
  const off = bus.on('app:pause', () => { first++; off(); });
  bus.on('app:pause', () => second++);
  bus.emit('app:pause', {});
  bus.emit('app:pause', {});
  assert.equal(first, 1);
  assert.equal(second, 2);
});

test('emitting with no handlers is harmless', () => {
  createBus().emit('app:resume', {});
});

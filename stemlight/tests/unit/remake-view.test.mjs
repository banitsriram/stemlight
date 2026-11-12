// The remake view must actually fill the GPU buffers: on 12 Nov every ribbon, pad and ring vertex rendered
// at the origin with colour 0, because the attribute copied the array the code wrote into.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Object3D } from 'three';
import { createRemakeView } from '../../src/ui/remake/view.ts';

test('draw() writes visible geometry into the arrays the GPU reads', () => {
  const scene = new Object3D();
  const v = createRemakeView(scene);
  const frame = { eye: [0, 1.2, 0], yaw: 0 };
  v.draw({
    visible: true, ribbon: frame, seat: frame, now: 10, clock: 1, stem: 'perc', ticks: [{ x: 0, down: true }], notes: [], regions: [],
    preview: null, playheadHeld: false, pads: [{ center: [-0.27, 1.05, -0.42], pitch: 47, flash: 0 }, { center: [0.27, 1.05, -0.42], pitch: 52, flash: 0 }],
    strings: [], keys: [], countIn: null, reset: { center: [0.27, 1.18, -0.42], progress: 0.5, flash: 0 }, flights: [],
  }, [0, 1.2, 0]);
  for (const mesh of v.group.children.slice(0, 2)) {
    const g = mesh.geometry, n = g.drawRange.count;
    assert.ok(n > 0, `${mesh.type} draws something`);
    const pos = g.getAttribute('position').array, col = g.getAttribute('color').array;
    let maxPos = 0, maxCol = 0;
    for (let i = 0; i < n * 3; i++) { maxPos = Math.max(maxPos, Math.abs(pos[i])); maxCol = Math.max(maxCol, col[i]); }
    assert.ok(maxPos > 0.1, `${mesh.type} vertices are placed (max |coord| ${maxPos.toFixed(2)})`);
    assert.ok(maxCol > 0.05, `${mesh.type} vertices are lit (max colour ${maxCol.toFixed(2)})`);
  }
});

test('a pad hit reads warm amber, not clipped white (F15)', () => {
  const v = createRemakeView(new Object3D());
  const frame = { eye: [0, 1.2, 0], yaw: 0 };
  const pad = [-0.27, 1.05, -0.42];
  v.draw({
    visible: true, ribbon: frame, seat: frame, now: 10, clock: 1, stem: 'perc', ticks: [], notes: [], regions: [],
    preview: null, playheadHeld: false, pads: [{ center: pad, pitch: 47, flash: 1 }],
    strings: [], keys: [], countIn: null, reset: { center: [0.27, 1.18, -0.42], progress: 0, flash: 0 }, flights: [],
  }, [0, 1.2, 0]);
  // Sum every triangle vertex sitting exactly on the pad centre (the fill fan and the halo centre): additive
  // blending adds them, so the sum is what the eye sees at the middle of the pad.
  const g = v.group.children[0].geometry, pos = g.getAttribute('position').array, col = g.getAttribute('color').array;
  const sum = [0, 0, 0];
  let hits = 0;
  for (let i = 0; i < g.drawRange.count; i++) {
    if (Math.hypot(pos[i * 3] - pad[0], pos[i * 3 + 1] - pad[1], pos[i * 3 + 2] - pad[2]) > 1e-6) continue;
    hits++;
    for (let c = 0; c < 3; c++) sum[c] += col[i * 3 + c] / 24; // 24 fan segments share the centre
  }
  assert.ok(hits > 0, 'pad centre drawn');
  assert.ok(sum[0] > sum[2] * 2, `warm: red ${sum[0].toFixed(2)} well above blue ${sum[2].toFixed(2)}`);
  assert.ok(sum[2] < 0.6, `blue stays low enough that it does not wash to white (${sum[2].toFixed(2)})`);
});

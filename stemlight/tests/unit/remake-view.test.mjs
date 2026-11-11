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
    countIn: null, reset: { center: [0.27, 1.18, -0.42], progress: 0.5, flash: 0 }, flights: [],
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

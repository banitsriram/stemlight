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

test('a pad hit reads warm amber, not clipped white (F15): the drum head flashes and a warm halo shows', () => {
  const v = createRemakeView(new Object3D());
  const frame = { eye: [0, 1.2, 0], yaw: 0 };
  const pad = [-0.27, 1.05, -0.42];
  v.draw({
    visible: true, ribbon: frame, seat: frame, now: 10, clock: 1, stem: 'perc', ticks: [], notes: [], regions: [],
    preview: null, playheadHeld: false, pads: [{ center: pad, pitch: 47, flash: 1 }, { center: [0.27, 1.05, -0.42], pitch: 52, flash: 0 }],
    strings: [], keys: [], countIn: null, reset: { center: [0.27, 1.18, -0.42], progress: 0, flash: 0 }, flights: [],
  }, [0, 1.2, 0]);
  const drums = v.models.drums, u = drums.material.uniforms;
  assert.ok(drums.visible, 'the drums show while there are pads');
  assert.deepEqual(u.uFlash.value.slice(0, 2), [1, 0], 'only the struck head flashes');
  const a = u.uAmber.value;
  assert.ok(a.r > a.b * 2 && a.b < 0.6, `the flash colour is warm amber (${a.r.toFixed(2)}, ${a.g.toFixed(2)}, ${a.b.toFixed(2)})`);
  // The halo above the struck head: its centre vertex, additive, must be warm too and not wash to white.
  const g = v.group.children[0].geometry, pos = g.getAttribute('position').array, col = g.getAttribute('color').array;
  const above = [pad[0], pad[1] + 0.02, pad[2]];
  let centre = null;
  for (let i = 0; i < g.drawRange.count && !centre; i++) {
    if (Math.hypot(pos[i * 3] - above[0], pos[i * 3 + 1] - above[1], pos[i * 3 + 2] - above[2]) < 1e-6) centre = [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]];
  }
  assert.ok(centre, 'halo drawn above the struck head');
  assert.ok(centre[0] > centre[2] * 2 && centre[2] < 0.6, `warm halo (${centre.map((x) => x.toFixed(2)).join(', ')})`);
});

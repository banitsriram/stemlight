// The playable instruments as models (13 Nov): the key tops and drum heads sit exactly on their input targets,
// the harp frame never stands where a sweep across the strings goes, the models show only while their
// instrument is up, and a strike flashes (and for a key, dips) only the struck part.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Object3D, Vector3 } from 'three';
import { HARP, KEYS, PADS, harpTargets, keyTargets, padTargets } from '../../src/ui/remake/layout.ts';
import { drums, harpFrame, keyboard } from '../../src/ui/remake/models.ts';
import { STRING_SHIVER, createRemakeView } from '../../src/ui/remake/view.ts';

const SEAT = { eye: [0.1, 1.15, -0.05], yaw: 0.6 }; // a turned, off-centre seat: the models must follow it
const PITCH8 = [52, 54, 55, 57, 59, 60, 62, 64];

/** The geometry's points that carry part index `i`, as seat-local positions. */
function partPoints(g, i) {
  const pos = g.getAttribute('position'), part = g.getAttribute('part'), out = [];
  for (let k = 0; k < pos.count; k++) if (Math.abs(part.getX(k) - i) < 0.5) out.push(new Vector3().fromBufferAttribute(pos, k));
  return out;
}
const bounds = (pts) => new Box3().setFromPoints(pts);
/** Seat-local (x right, y up, -z ahead) to world, as three.js places the mesh: position eye, rotation.y yaw. */
const toWorldVia = (seat) => {
  const o = new Object3D();
  o.position.set(...seat.eye); o.rotation.set(0, seat.yaw, 0); o.updateMatrixWorld();
  return (p) => p.clone().applyMatrix4(o.matrixWorld);
};
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fmt = (p) => p.map((x) => x.toFixed(3)).join(', ');

test('each key top is its key target: same centre, width and depth, on a turned seat', () => {
  const g = keyboard(), w = toWorldVia(SEAT), targets = keyTargets(SEAT, PITCH8);
  for (let i = 0; i < KEYS.count; i++) {
    const b = bounds(partPoints(g, i));
    const c = w(new Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2 - 0.0015)).toArray(); // the lip adds 3 mm in front (+z, toward the eye)
    assert.ok(near(c, targets[i].center) < 1e-3, `key ${i}: model top ${fmt(c)} vs target ${fmt(targets[i].center)}`);
    const size = b.getSize(new Vector3());
    assert.ok(Math.abs(size.x - KEYS.width) < 1e-6, `key ${i} is ${size.x.toFixed(3)} m wide`);
    assert.ok(Math.abs(size.z - KEYS.depth - 0.003) < 1e-6, `key ${i} is ${KEYS.depth} m deep plus its 3 mm lip`);
  }
});

test('each drum head is its pad: same centre and radius, top at the strike plane', () => {
  const g = drums(), w = toWorldVia(SEAT), targets = padTargets(SEAT, [47, 52]);
  for (let i = 0; i < PADS.count; i++) {
    const b = bounds(partPoints(g, i));
    const c = w(new Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2)).toArray();
    assert.ok(near(c, targets[i].center) < 1e-3, `head ${i}: ${fmt(c)} vs pad ${fmt(targets[i].center)}`);
    assert.ok(Math.abs(b.getSize(new Vector3()).x / 2 - PADS.radius) < 1e-3, 'head radius = pad radius');
  }
});

test('the harp frame frames the strings and keeps clear of a sweep across them', () => {
  const g = harpFrame();
  const pos = g.getAttribute('position');
  const z = -HARP.ahead, xs = harpTargets({ eye: [0, 0, 0], yaw: 0 }, PITCH8).map((t) => t.center[0]);
  const lo = -HARP.below - HARP.halfLength, hi = -HARP.below + HARP.halfLength;
  let inside = 0;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), dz = Math.abs(pos.getZ(k) - z);
    // The space a sweep uses: 2.5 cm past each outer string, along the strings' length, within the pluck depth.
    if (x > xs[0] - 0.025 && x < xs[7] + 0.025 && y > lo + 0.004 && y < hi - 0.004 && dz < HARP.depthTol) inside++;
  }
  assert.equal(inside, 0, `${inside} frame vertices in the sweep zone`);
  const b = new Box3().setFromBufferAttribute(pos);
  assert.ok(b.min.x < xs[0] - 0.03 && b.max.x > xs[7] + 0.03, 'posts outside both outer strings');
  assert.ok(b.min.y < lo && b.max.y > hi, 'soundbox below and neck above the strings');
});

const viewOf = (over) => ({
  visible: true, ribbon: SEAT, seat: SEAT, now: 10, clock: 1, stem: null, ticks: [], notes: [], regions: [], preview: null,
  playheadHeld: false, pads: [], strings: [], keys: [], countIn: null, reset: { center: [0.27, 1.18, -0.42], progress: 0, flash: 0 }, flights: [], ...over,
});

test('models show only with their instrument, follow the seat, and flash only the struck part', () => {
  const v = createRemakeView(new Object3D());
  v.draw(viewOf({}), SEAT.eye);
  assert.deepEqual(Object.values(v.models).map((m) => m.visible), [false, false, false], 'nothing before a cut');

  const keys = keyTargets(SEAT, PITCH8).map((t, i) => ({ center: t.center, pitch: t.extra.pitch, flash: i === 3 ? 0.5 : 0 }));
  v.draw(viewOf({ keys }), SEAT.eye);
  assert.deepEqual([v.models.harp.visible, v.models.keys.visible, v.models.drums.visible], [false, true, false]);
  assert.deepEqual(v.models.keys.material.uniforms.uFlash.value, [0, 0, 0, 0.5, 0, 0, 0, 0], 'key 3 flashes');
  assert.equal(v.models.keys.material.uniforms.uDip.value, 0.006, 'a pressed key dips 6 mm');
  assert.ok(Math.abs(v.models.keys.rotation.y - SEAT.yaw) < 1e-9, 'turned with the seat');
  assert.ok(near(v.models.keys.position.toArray(), SEAT.eye) < 1e-9, 'placed at the seat');

  const strings = harpTargets(SEAT, PITCH8).map((s) => ({ a: [s.center[0], s.center[1] - 0.05, s.center[2]], b: [s.center[0], s.center[1] + 0.05, s.center[2]], pitch: s.extra.pitch, flash: 0 }));
  v.draw(viewOf({ strings }), SEAT.eye);
  assert.deepEqual([v.models.harp.visible, v.models.keys.visible], [true, false], 'the harp replaces the keyboard');

  v.draw(viewOf({ visible: false, strings }), SEAT.eye);
  assert.ok(Object.values(v.models).every((m) => !m.visible), 'hidden with the remake surfaces');
});

test('each model is one mesh of modest size, carrying tint and part per vertex', () => {
  for (const g of [harpFrame(), keyboard(), drums()]) {
    assert.ok(g.getAttribute('position').count < 20000, `${g.getAttribute('position').count} vertices`);
    assert.ok(g.getAttribute('tint') && g.getAttribute('part'));
  }
});

test('a plucked string shivers: a lens widest at its middle, still at its ends; an unplucked one stays straight', () => {
  const frame = { eye: [0, 1.2, 0], yaw: 0 };
  const t = harpTargets(frame, PITCH8);
  const strings = t.map((s, i) => ({ a: [s.center[0], s.center[1] - 0.05, s.center[2]], b: [s.center[0], s.center[1] + 0.05, s.center[2]], pitch: s.extra.pitch, flash: i === 2 ? 1 : 0 }));
  const v = createRemakeView(new Object3D());
  v.draw(viewOf({ ribbon: frame, seat: frame, strings }), frame.eye);
  const g = v.group.children[1].geometry, pos = g.getAttribute('position').array;
  // Line vertices near each string's x, within its length: how far any strays sideways from the string.
  const sway = (s) => {
    let mid = 0, end = 0;
    for (let i = 0; i < g.drawRange.count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (Math.abs(z - s.a[2]) > 1e-6 || y < s.a[1] - 1e-6 || y > s.b[1] + 1e-6 || Math.abs(x - s.a[0]) > 0.02) continue;
      const u = (y - s.a[1]) / (s.b[1] - s.a[1]), d = Math.abs(x - s.a[0]);
      if (u > 0.4 && u < 0.6) mid = Math.max(mid, d);
      if (u < 0.01 || u > 0.99) end = Math.max(end, d);
    }
    return { mid, end };
  };
  const plucked = sway(strings[2]), still = sway(strings[5]);
  assert.ok(plucked.mid > STRING_SHIVER * 0.45, `plucked string swings ${(plucked.mid * 1000).toFixed(1)} mm at its middle (it flickers between half and full width)`);
  assert.ok(plucked.end < 1e-6, 'its ends stay put');
  assert.ok(still.mid < 1e-6, 'an unplucked string stays straight');
});

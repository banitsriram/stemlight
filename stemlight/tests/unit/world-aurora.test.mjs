// Aurora over ice (18 Nov): the world builds its three objects (sky, ice, snow) the way the deep sea does, so the
// world manager can draw it in three calls, fade it for a change, run it on wall-clock time and pulse it on the beat.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdditiveBlending, BackSide, Mesh, Points } from 'three';
import { FLOOR_Y, SNOWFLAKES, createAurora } from '../../src/world/aurora.ts';
import { SEA_UNIFORMS } from '../../src/world/deepsea.ts';

const materials = (w) => w.objects.map((o) => o.material);

test('three objects: the sky sphere seen from inside, the ice drawn over it, and the snow', () => {
  const w = createAurora();
  assert.equal(w.objects.length, 3);
  const [sky, ice, snow] = w.objects;
  assert.ok(sky instanceof Mesh, 'the sky is a mesh');
  assert.equal(sky.material.side, BackSide, 'the sky is seen from inside');
  assert.equal(sky.renderOrder, -2, 'the sky draws first');
  assert.ok(ice instanceof Mesh, 'the ice is a mesh');
  assert.equal(ice.renderOrder, -1, 'the ice draws over the sky');
  assert.ok(snow instanceof Points, 'the snow is points');
  assert.equal(snow.geometry.getAttribute('position').count, SNOWFLAKES);
  assert.equal(snow.material.blending, AdditiveBlending);
  for (const o of w.objects) {
    assert.equal(o.frustumCulled, false, 'never culled: the sky and the ice surround the seat');
    assert.equal(o.material.isShaderMaterial, true);
    assert.equal(o.material.depthWrite, false);
  }
});

test('the ice lies flat at the seabed height and reaches the 40 m fade, premultiplied like the seabed', () => {
  const ice = createAurora().objects[1];
  assert.equal(FLOOR_Y, -0.6);
  ice.geometry.computeBoundingBox();
  const b = ice.geometry.boundingBox;
  assert.ok(Math.abs(b.min.y - FLOOR_Y) < 1e-6 && Math.abs(b.max.y - FLOOR_Y) < 1e-6, `flat at ${FLOOR_Y}: y ${b.min.y}..${b.max.y}`);
  assert.ok(b.min.x <= -40 && b.max.x >= 40 && b.min.z <= -40 && b.max.z >= 40, 'reaches 40 m every way');
  assert.equal(ice.material.transparent, true);
  assert.equal(ice.material.premultipliedAlpha, true);
});

test('the sky and the ice read the shared palette, so a world change re-lights them', () => {
  const [sky, ice] = createAurora().objects;
  for (const m of [sky.material, ice.material]) {
    for (const k of Object.keys(SEA_UNIFORMS)) assert.equal(m.uniforms[k], SEA_UNIFORMS[k], `${k} shared by reference`);
  }
});

test('every fragment shader dims with uFade and converts its colour last', () => {
  for (const m of materials(createAurora())) {
    assert.match(m.fragmentShader, /\* uFade/);
    assert.match(m.fragmentShader, /#include <colorspace_fragment>/);
  }
});

test('setFade(0.3) sets uFade on all three materials', () => {
  const w = createAurora();
  w.setFade(0.3);
  for (const m of materials(w)) assert.equal(m.uniforms.uFade.value, 0.3);
});

test('update(12.5) sets uTime on all three materials', () => {
  const w = createAurora();
  w.update(12.5);
  for (const m of materials(w)) assert.equal(m.uniforms.uTime.value, 12.5);
});

test('pulse passes the beat swell to all three materials and clamps below zero', () => {
  const w = createAurora();
  w.pulse(0.12);
  for (const m of materials(w)) assert.equal(m.uniforms.uPulse.value, 0.12);
  w.pulse(-1);
  for (const m of materials(w)) assert.equal(m.uniforms.uPulse.value, 0);
});

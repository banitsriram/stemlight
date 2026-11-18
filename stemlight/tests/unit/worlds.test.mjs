// The worlds (18 Nov, sir): three to choose from, the deep sea by default and remembered per device; a change fades
// through dark while the shared palette glides; the Starry Night world builds three draw calls and answers fade,
// time and beat; the world orbs sit under the song bubbles in view and reach, and a touch picks only when meant.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import { SEA_PALETTE, SEA_UNIFORMS, WORLD_GLOW, setPalette } from '../../src/world/deepsea.ts';
import { CHURCH, COTTAGES, CYPRESS, FAR_COTTAGES, createStarry, groundY } from '../../src/world/starry.ts';
import {
  AURORA_PALETTE, DEFAULT_WORLD, FADE_SEC, STARRY_PALETTE, WORLDS, WORLD_KEY, fadeAt, isWorld, loadWorld, saveWorld, worldInfo,
} from '../../src/world/worldList.ts';
import { toWorld } from '../../src/ui/remake/layout.ts';
import { ORBS, PICKER, createPicker } from '../../src/ui/remake/picker.ts';
import { SONGS } from '../../src/audio/sequence.ts';

const FRAME = { eye: [0, 1.2, 0], yaw: 0 };
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('three worlds: deep sea (the default), Starry Night, Aurora; each palette valid, its light a unit vector', () => {
  assert.deepEqual(WORLDS.map((w) => w.id), ['sea', 'starry', 'aurora', 'room']);
  assert.deepEqual(WORLDS.map((w) => w.name), ['Deep sea', 'Starry Night', 'Aurora', 'Passthrough']);
  assert.equal(DEFAULT_WORLD, 'sea');
  for (const w of WORLDS) {
    for (const k of ['abyss', 'deep', 'shallows', 'surface', 'foam']) assert.match(w.palette[k], /^#[0-9A-F]{6}$/i, `${w.id}.${k}`);
    assert.ok(Math.abs(Math.hypot(...w.palette.light) - 1) < 0.02, `${w.id}: light is a unit vector`);
    assert.ok(w.glow > 0 && w.glow <= 1, `${w.id}: glow ${w.glow}`);
    assert.equal(w.orb.length, 2);
  }
  assert.equal(worldInfo('starry').palette, STARRY_PALETTE);
  assert.equal(worldInfo('aurora').palette, AURORA_PALETTE);
  assert.ok(isWorld('aurora') && !isWorld('moon') && !isWorld(null));
});

test('the choice is remembered on this device; anything odd or unavailable falls back to the deep sea', () => {
  assert.equal(loadWorld(store()), 'sea');
  assert.equal(loadWorld(store({ [WORLD_KEY]: 'starry' })), 'starry');
  assert.equal(loadWorld(store({ [WORLD_KEY]: 'volcano' })), 'sea');
  assert.equal(loadWorld(null), 'sea');
  assert.equal(loadWorld({ getItem() { throw new Error('blocked'); } }), 'sea');
  const s = store();
  saveWorld('aurora', s);
  assert.equal(s.m.get(WORLD_KEY), 'aurora');
  assert.doesNotThrow(() => saveWorld('sea', { setItem() { throw new Error('private mode'); } }));
});

test('a change fades the old world out, swaps at half way, fades the new one in; the palette eases across', () => {
  assert.equal(FADE_SEC, 1);
  const a = fadeAt(0), b = fadeAt(0.25), c = fadeAt(0.5), e = fadeAt(0.75), f = fadeAt(1), g = fadeAt(5);
  assert.deepEqual([a.old, a.next, a.palette, a.swapped], [1, 0, 0, false]);
  assert.deepEqual([b.old, b.next, b.swapped], [0.5, 0, false]);
  assert.deepEqual([c.old, c.next, c.swapped], [0, 0, true]);
  assert.deepEqual([e.old, e.next, e.swapped], [0, 0.5, true]);
  assert.deepEqual([f.old, f.next, f.palette], [0, 1, 1]);
  assert.deepEqual(g, f, 'past the end it holds');
  assert.ok(b.palette < 0.25 && e.palette > 0.75, 'eased');
});

test('setPalette writes the shared uniforms every lit material reads, and glides between worlds', () => {
  setPalette(SEA_PALETTE);
  assert.equal(SEA_UNIFORMS.SEA_ABYSS.value.getHexString(), new Color(SEA_PALETTE.abyss).getHexString());
  setPalette(SEA_PALETTE, STARRY_PALETTE, 1);
  assert.equal(SEA_UNIFORMS.SEA_SURFACE.value.getHexString(), new Color(STARRY_PALETTE.surface).getHexString());
  setPalette(SEA_PALETTE, STARRY_PALETTE, 0.5);
  const mid = SEA_UNIFORMS.SEA_DEEP.value, a = new Color(SEA_PALETTE.deep), b = new Color(STARRY_PALETTE.deep);
  assert.ok(Math.abs(mid.r - (a.r + b.r) / 2) < 1e-6 && Math.abs(mid.b - (a.b + b.b) / 2) < 1e-6, 'half way');
  assert.ok(Math.abs(SEA_UNIFORMS.SEA_L.value.length() - 1) < 1e-6, 'the light stays a unit vector');
  // The haze is 70 % of the way from the abyss to the deep colour, as it always was.
  const haze = SEA_UNIFORMS.SEA_ABYSS.value.clone().lerp(SEA_UNIFORMS.SEA_DEEP.value, 0.7);
  assert.equal(SEA_UNIFORMS.SEA_HAZE.value.getHexString(), haze.getHexString());
  setPalette(SEA_PALETTE);
  assert.equal(typeof WORLD_GLOW.value, 'number');
});

test('Starry Night: sky, toon land, fireflies (three draw calls); fade, time and beat reach every material', () => {
  const w = createStarry();
  assert.equal(w.objects.length, 3);
  const [sky, hill, motes] = w.objects;
  assert.equal(sky.renderOrder, -2);
  assert.equal(sky.material.side, 1, 'BackSide');
  assert.equal(hill.renderOrder, -1);
  assert.ok(motes.isPoints);
  w.setFade(0.3);
  w.update(12.5);
  for (const o of w.objects) {
    assert.equal(o.material.uniforms.uFade.value, 0.3);
    assert.equal(o.material.uniforms.uTime.value, 12.5);
  }
  w.pulse(-1);
  assert.equal(sky.material.uniforms.uPulse.value, 0, 'the beat swell never goes negative');
  w.pulse(0.12);
  assert.equal(motes.material.uniforms.uPulse.value, 0.12);
  // The hill shares the world's palette (it includes the shared GLSL), so a world change re-lights it.
  assert.equal(hill.material.uniforms.SEA_L, SEA_UNIFORMS.SEA_L);
});

test('world orbs: a row under the song bubbles, inside the view and reach, their touch spheres clear of the bubbles', () => {
  const p = createPicker(SONGS, WORLDS, (id) => id !== 'room');
  p.open(0, FRAME);
  const orbs = p.orbs(), bubbles = p.bubbles(), eye = FRAME.eye;
  assert.equal(orbs.length, 3);
  for (const [i, c] of orbs.entries()) {
    const d = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
    const yaw = Math.abs(Math.atan2(d[0], -d[2]) * 57.2958), pitch = Math.abs(Math.atan2(d[1], Math.hypot(d[0], d[2])) * 57.2958);
    assert.ok(yaw <= 35 && pitch <= 33 && Math.hypot(...d) <= 0.61, `orb ${i}: yaw ${yaw.toFixed(1)}°, pitch ${pitch.toFixed(1)}°, ${Math.hypot(...d).toFixed(2)} m`);
    assert.ok(c[1] < Math.min(...bubbles.map((b) => b[1])), 'under the bubbles');
    for (const b of bubbles) {
      const gap = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]) - PICKER.touch - ORBS.touch;
      assert.ok(gap > 0.01, `orb ${i} keeps ${(gap * 100).toFixed(1)} cm from a bubble's touch sphere`);
    }
  }
  assert.ok(orbs[0][0] < orbs[1][0] && orbs[1][0] < orbs[2][0], 'left to right in world order');
  assert.deepEqual(p.targets(null).filter((t) => t.id.startsWith('world:')).map((t) => `${t.id}:${t.kind}`), ['world:sea:song', 'world:starry:song', 'world:aurora:song']);
});

test('world orbs: a fingertip coming in from outside once armed picks that world; resting or early never does', () => {
  const p = createPicker(SONGS, WORLDS, (id) => id !== 'room');
  p.open(0, FRAME);
  const [, starry] = p.orbs(), away = [0.5, 0.2, 0.3];
  const tip = (at) => [{ hand: 'right', at, ok: true }];
  assert.equal(p.touchWorld(0, tip(away)), null);
  assert.equal(p.touchWorld(0.3, tip(starry)), null, 'before the arm time');
  assert.equal(p.touchWorld(1, tip(starry)), null, 'came in early, still inside');
  assert.equal(p.touchWorld(1.1, tip(away)), null);
  assert.equal(p.touchWorld(1.2, tip(starry)), 'starry');
  assert.equal(p.touch(1.2, tip(starry)), null, 'an orb touch is not a song touch');
  p.close();
  assert.equal(p.touchWorld(2, tip(starry)), null, 'closed');
  assert.deepEqual(createPicker(SONGS).orbs(), [], 'no worlds given: no orbs');
});

test('the orb row sits where the layout says (frame-local -12/0/+12 cm, 26.5 cm down, 43 cm out)', () => {
  const p = createPicker(SONGS, WORLDS, (id) => id !== 'room');
  p.open(0, FRAME);
  assert.deepEqual(p.orbs().map((c) => c.map((x) => +x.toFixed(3))), [[-0.12, 0.935, -0.43], [0, 0.935, -0.43], [0.12, 0.935, -0.43]]);
  assert.deepEqual(toWorld(FRAME, [0, -ORBS.below, ORBS.ahead]).map((x) => +x.toFixed(3)), [0, 0.935, -0.43]);
});

test('Starry Night land: opaque toon mesh (writes depth, so instruments sort against it) with every shared palette uniform', () => {
  const [, land] = createStarry().objects;
  assert.equal(land.material.transparent, false);
  assert.equal(land.material.depthWrite, true);
  for (const k of Object.keys(SEA_UNIFORMS)) assert.equal(land.material.uniforms[k], SEA_UNIFORMS[k], `${k} shared by reference`);
  for (const a of ['tint', 'glow', 'hull', 'faceUv', 'kind', 'normal']) assert.ok(land.geometry.getAttribute(a), `attribute ${a}`);
  const hull = land.geometry.getAttribute('hull');
  let outlined = 0;
  for (let i = 0; i < hull.count; i++) outlined += hull.getX(i) > 0.5 ? 1 : 0;
  assert.ok(outlined > 1000, `the cottages, church, cypress and bushes carry outline shells (${outlined} hull vertices)`);
});

test('Starry Night village (sir: close round you, open straight ahead): no cottage ahead within 35 degrees closer than 15 m', () => {
  const az = (h) => Math.atan2(h.x, -h.z) * 57.2958, dist = (h) => Math.hypot(h.x, h.z);
  assert.ok(COTTAGES.length >= 12, `${COTTAGES.length} cottages round you`);
  for (const h of COTTAGES) {
    assert.ok(dist(h) >= 5, `cottage at ${az(h).toFixed(0)} deg is ${dist(h).toFixed(1)} m away (5 m or more)`);
    assert.ok(Math.abs(az(h)) >= 35 || dist(h) >= 15, `cottage at ${az(h).toFixed(0)} deg, ${dist(h).toFixed(1)} m: not in the open view`);
  }
  // None overlap each other or the cypress (footprints as circles round their corners).
  const foot = (h) => Math.hypot(h.w, h.d) / 2 + 0.3;
  const all = [...COTTAGES, ...FAR_COTTAGES];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const gap = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) - foot(all[i]) - foot(all[j]);
      assert.ok(gap > -0.6, `cottages ${i} and ${j} overlap by ${(-gap).toFixed(2)} m`);
    }
    assert.ok(Math.hypot(all[i].x - CYPRESS.x, all[i].z - CYPRESS.z) > foot(all[i]) + CYPRESS.radius, `cottage ${i} clear of the cypress`);
  }
  // The church and its spire stand ahead and a little right, beyond the open view; the cypress on the left.
  assert.ok(az(CHURCH) > 0 && az(CHURCH) < 15 && dist(CHURCH) > 18 && dist(CHURCH) < 30, `church at ${az(CHURCH).toFixed(1)} deg, ${dist(CHURCH).toFixed(1)} m`);
  assert.ok(az(CYPRESS) < -30 && az(CYPRESS) > -55, `cypress on the left (${az(CYPRESS).toFixed(0)} deg)`);
  // The ground falls away ahead (the far village sits lower) and the seat area stays near the old floor height.
  assert.ok(Math.abs(groundY(0, 0) + 0.6) < 0.25 && groundY(0, -25) < groundY(0, 0) - 2, 'the meadow falls away ahead');
});

test('passthrough: offered only in a passthrough session, never kept, and the room draws nothing once up', async () => {
  const { availableWorlds, loadWorld, saveWorld, createSwitch } = await import('../../src/world/worldList.ts');
  const { createRoom } = await import('../../src/world/room.ts');
  assert.deepEqual(availableWorlds(true), ['sea', 'starry', 'aurora', 'room']);
  assert.deepEqual(availableWorlds(false), ['sea', 'starry', 'aurora']);
  const kept = new Map();
  const store = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
  saveWorld('room', store);
  assert.equal(kept.size, 0, 'Passthrough is not saved');
  kept.set('stemlight.world', 'room');
  assert.equal(loadWorld(store), 'sea', 'a stored room falls back to the deep sea');
  const sw = createSwitch('starry');
  sw.jump('room');
  assert.equal(sw.shown(), 'room');
  assert.equal(sw.changing(), false, 'jump is instant');
  const room = createRoom();
  room.setFade(1);
  assert.equal(room.objects[0].material.visible, false, 'no draw call once the room is up');
  room.setFade(0.3);
  assert.ok(room.objects[0].material.visible && Math.abs(room.objects[0].material.opacity - 0.7) < 1e-9, 'the veil fades the room in');
});

// The playable instruments as real objects (banit's request, 13 Nov), modelled in code with no downloaded assets,
// in the deep-sea glass look (17 Nov, src/world/deepsea.ts): what you touch is pale frosted glass with cyan edge
// light, the frames around it dark teal glass, their fittings neutral pale glass:
//   - the harp: a pale glass column, a dark glass neck and soundbox framing the 8 strings (the strings themselves
//     stay glowing lines in view.ts, so a pluck can light them),
//   - the keyboard: 8 frosted keys in a dark glass case,
//   - the pads: two small kettle drums with frosted heads, the strike surfaces.
// Each is one merged mesh (one draw call) built in the seat frame (x right, y up, -z ahead) and placed each frame
// at the seat. The key tops and drum heads sit exactly on their input targets (layout.ts): what you see is
// what you hit. A per-vertex `part` index lets one uniform array flash a struck key or head amber and dip a key.
import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Euler, Float32BufferAttribute,
  LatheGeometry, Matrix4, Mesh, Quaternion, ShaderMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../../contracts';
import { SEA_GLSL, SEA_UNIFORMS } from '../../world/deepsea.ts';
import { HARP, KEYS, PADS, harpString, padLocal } from './layout.ts';

type Mat = [string, number]; // glass colour, gloss 0..1 (the tint and metal of banit's instruments)
// What you touch is pale frosted glass (its cyan edge light comes from uGlow); the frames dark teal glass; the
// fittings neutral pale glass, so cyan stays on what you can touch.
const FROST: Mat = ['#cdeff2', 0.12], LIP: Mat = ['#a6dce2', 0.15], DEEP: Mat = ['#0b3a45', 0.7];
const EDGE: Mat = ['#c8d4d6', 1], BOARD: Mat = ['#c8d4d6', 0.3], EYELET: Mat = ['#06222a', 0.3], RAIL: Mat = DEEP;
const MAPLE = DEEP, PALE = BOARD, GOLD = EDGE, EBONY = EYELET, IVORY = FROST, LACQUER = DEEP, FELT = RAIL;
const COPPER = DEEP, SKIN = FROST, SILVER = EDGE;

/** Collects parts with a tint (rgb + metal) and a part index (-1 = frame, else the key or pad it belongs to). */
class Parts {
  private list: BufferGeometry[] = [];
  add(g: BufferGeometry, [hex, metal]: Mat, at: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], part = -1): this {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute('uv');
    flat.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(1, 1, 1)));
    const c = new Color(hex), n = flat.getAttribute('position').count;
    const tint = new Float32Array(n * 4), idx = new Float32Array(n).fill(part);
    for (let i = 0; i < n; i++) tint.set([c.r, c.g, c.b, metal], i * 4);
    flat.setAttribute('tint', new Float32BufferAttribute(tint, 4));
    flat.setAttribute('part', new Float32BufferAttribute(idx, 1));
    this.list.push(flat);
    return this;
  }
  rod(a: Vec3, b: Vec3, r: number, mat: Mat, seg = 8): this {
    const va = new Vector3(...a), d = new Vector3(...b).sub(va), len = d.length();
    const g = new CylinderGeometry(r, r, len, seg, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
    const m = va.add(new Vector3(...b)).multiplyScalar(0.5);
    return this.add(g, mat, [m.x, m.y, m.z]);
  }
  done(): BufferGeometry {
    const g = mergeGeometries(this.list);
    g.computeBoundingSphere();
    return g;
  }
}

const spread = (i: number, n: number, s: number) => (i - (n - 1) / 2) * s;

/**
 * The harp frame, a real harp's outline around the graded strings (harpString): a tall fluted gold column on the
 * bass side, a maple neck curving down over the string tops to the treble shoulder, and a maple soundbox
 * sloping up under the string bottoms (a pale soundboard on top, an eyelet per string), meeting the neck at the
 * shoulder. Nothing stands inside the band a sweep crosses.
 */
export function harpFrame(): BufferGeometry {
  const p = new Parts();
  const z = -HARP.ahead, n = HARP.count;
  const xs = Array.from({ length: n }, (_, i) => spread(i, n, HARP.spacing));
  const ends = xs.map((_, i) => harpString(i, n));
  const xL = xs[0] - 0.04, xR = xs[n - 1] + 0.045; // column and shoulder, clear of a sweep 2.5 cm past either outer string
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const at = (x: number, which: 'lo' | 'hi') => { // the string ends' line, extended past the outer strings
    const k = (x - xs[0]) / (xs[n - 1] - xs[0]);
    return lerp(ends[0][which], ends[n - 1][which], k);
  };
  const tube = (pts: [number, number][], r: number, mat: Mat, seg = 40) =>
    p.add(new TubeGeometry(new CatmullRomCurve3(pts.map(([x, y]) => new Vector3(x, y, z)), false, 'centripetal'), seg, r, 8, false), mat);
  // Soundbox under the string bottoms, rising to the treble and turning up into the shoulder.
  // Near the treble the band's edges are the strings' own ends, so both curves are pinned point by point
  // there: the soundbox stays under the band until it is past the sweep, then rises into the shoulder.
  const bandLo = -HARP.below - HARP.halfLength, bandHi = -HARP.below + HARP.halfLength, xs7 = xs[n - 1];
  const box: [number, number][] = [[xL, at(xL, 'lo') - 0.03], [xs[0], at(xs[0], 'lo') - 0.017], [0, at(0, 'lo') - 0.016],
    [xs7, bandLo - 0.018], [xs7 + 0.025, bandLo - 0.017], [xR - 0.004, bandLo - 0.008], [xR, -HARP.below], [xR, bandHi + 0.004]];
  tube(box, 0.013, MAPLE);
  tube(box.slice(1, 4).map(([x, y]) => [x, y + 0.011] as [number, number]), 0.0045, PALE, 24); // soundboard
  // Neck over the string tops, from the column's capital down to the shoulder, with a gentle S.
  const neck: [number, number][] = [[xL, at(xL, 'hi') + 0.024], [xs[0], at(xs[0], 'hi') + 0.012], [xs[2], at(xs[2], 'hi') + 0.016], [xs[5], at(xs[5], 'hi') + 0.009],
    [xs7, bandHi + 0.0095], [xs7 + 0.025, bandHi + 0.011], [xR, bandHi + 0.008]];
  tube(neck, 0.0085, MAPLE);
  for (let i = 0; i < n; i++) {
    p.add(new SphereGeometry(0.0032, 8, 6), GOLD, [xs[i], ends[i].hi + 0.004, z + 0.006]); // tuning pin
    p.add(new SphereGeometry(0.0026, 6, 4), EBONY, [xs[i], ends[i].lo - 0.001, z + 0.004]); // eyelet
  }
  // Fluted gold column on the bass side, from its foot to a crown above the neck.
  const foot = at(xL, 'lo') - 0.045, top = at(xL, 'hi') + 0.024;
  p.rod([xL, foot, z], [xL, top, z], 0.0085, GOLD, 10);
  p.add(new LatheGeometry([[0.0085, 0], [0.014, 0.008], [0.011, 0.016], [0.015, 0.022], [0.006, 0.03], [0.001, 0.034]].map(([r, y]) => new Vector2(r, y)), 12), GOLD, [xL, top, z]);
  p.add(new LatheGeometry([[0.001, -0.012], [0.016, -0.01], [0.014, 0], [0.0085, 0.01]].map(([r, y]) => new Vector2(r, y)), 12), GOLD, [xL, foot, z]);
  return p.done();
}

/** The keyboard: key i's top is the middle of key target i (KEYS), part index i so it can dip and flash. */
export function keyboard(): BufferGeometry {
  const p = new Parts();
  const zc = -KEYS.ahead, top = -KEYS.below, d = KEYS.depth, w = KEYS.width;
  const outer = spread(KEYS.count - 1, KEYS.count, KEYS.spacing) + w / 2;
  for (let i = 0; i < KEYS.count; i++) {
    const x = spread(i, KEYS.count, KEYS.spacing);
    p.add(new BoxGeometry(w, 0.018, d), IVORY, [x, top - 0.009, zc], [0, 0, 0], i);
    p.add(new BoxGeometry(w, 0.004, 0.003), LIP, [x, top - 0.016, zc + d / 2 + 0.0015], [0, 0, 0], i); // front lip
  }
  // Keybed under the keys, cheek blocks at each end, a back rail with a red felt strip and a gold line.
  p.add(new BoxGeometry(outer * 2 + 0.03, 0.014, d + 0.03), LACQUER, [0, top - 0.025, zc - 0.005]);
  for (const s of [-1, 1]) p.add(new BoxGeometry(0.012, 0.03, d + 0.03), LACQUER, [s * (outer + 0.009), top - 0.012, zc - 0.005]);
  const back = zc - d / 2 - 0.012;
  p.add(new BoxGeometry(outer * 2 + 0.03, 0.05, 0.02), LACQUER, [0, top + 0.01, back - 0.002]);
  p.add(new BoxGeometry(outer * 2, 0.007, 0.004), FELT, [0, top + 0.003, back + 0.009]);
  p.add(new BoxGeometry(outer * 2 + 0.03, 0.0025, 0.021), GOLD, [0, top + 0.035, back - 0.002]);
  return p.done();
}

/** Two kettle drums: drum i's head is pad target i (radius PADS.radius), part index i so the head can flash. */
export function drums(): BufferGeometry {
  const p = new Parts();
  const r = PADS.radius;
  for (let i = 0; i < PADS.count; i++) {
    const [x, y, ahead] = padLocal(i);
    const at: Vec3 = [x, y, -ahead];
    // Copper bowl below the head, the skin head itself (its top at the strike plane), a silver hoop and rods.
    const bowl = Array.from({ length: 10 }, (_, k) => {
      const t = k / 9;
      return new Vector2(Math.max(0.002, r * Math.sin(t * Math.PI * 0.5)), -0.07 * Math.cos(t * Math.PI * 0.5) ** 1.3 - 0.003);
    });
    p.add(new LatheGeometry(bowl, 28), COPPER, at);
    p.add(new CylinderGeometry(r, r, 0.004, 28), SKIN, [x, y - 0.002, -ahead], [0, 0, 0], i);
    p.add(new TorusGeometry(r + 0.002, 0.003, 6, 32), SILVER, [x, y - 0.001, -ahead], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3, cx = x + Math.cos(a) * (r + 0.006), cz = -ahead + Math.sin(a) * (r + 0.006);
      p.rod([cx, y - 0.045, cz], [cx, y - 0.002, cz], 0.0022, SILVER, 5);
    }
    // A short tripod and ring, so the drum stands rather than floats.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      p.rod([x + Math.cos(a) * r * 0.55, y - 0.06, -ahead + Math.sin(a) * r * 0.55], [x + Math.cos(a) * r * 0.8, y - 0.11, -ahead + Math.sin(a) * r * 0.8], 0.003, SILVER, 5);
    }
    p.add(new TorusGeometry(r * 0.7, 0.0025, 5, 20), SILVER, [x, y - 0.09, -ahead], [Math.PI / 2, 0, 0]);
  }
  return p.done();
}

/**
 * The quiet-reset shell: a pearl scallop (a fluted dome with ribs pressed into its rim and two small ears at the
 * hinge), lit like the instruments so its ribs shade. Part 0, so pinching it can glow it cyan. Until 17 Nov it
 * was a flat additive cyan shape that read as an unexplained blob (scoring audit 3).
 */
export function resetShell(): BufferGeometry {
  const p = new Parts();
  const prof: Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * (Math.PI / 2); prof.push(new Vector2(Math.sin(a) * 0.04, Math.cos(a) * 0.02)); }
  const dome = new LatheGeometry(prof, 54);
  const pos = dome.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), zz = pos.getZ(i), r = Math.hypot(x, zz);
    const rib = 1 + 0.1 * Math.cos(Math.atan2(zz, x) * 11) * (r / 0.04);
    pos.setXYZ(i, x * rib, pos.getY(i) * (1 + 0.25 * (rib - 1)), zz * rib);
  }
  dome.computeVertexNormals();
  const PEARL: Mat = ['#f2e4ec', 0.5];
  p.add(dome, PEARL, [0, 0, 0], [0, 0, 0], 0);
  for (const s of [-1, 1]) p.add(new BoxGeometry(0.016, 0.004, 0.012), PEARL, [s * 0.011, 0.001, 0.038], [0, s * 0.3, 0], 0); // hinge ears
  return p.done();
}

/**
 * A song in the picker (18 Nov): a frosted glass bubble around a small pearl, one draw call. Part 0, so a touch
 * can flash it amber; radius 1 (scale it to size).
 */
export function songBubble(): BufferGeometry {
  const p = new Parts();
  p.add(new SphereGeometry(1, 32, 16), FROST, [0, 0, 0], [0, 0, 0], 0);
  p.add(new SphereGeometry(0.34, 16, 10), ['#f2e4ec', 0.5], [0.18, 0.22, 0.2], [0, 0, 0], 0);
  return p.done();
}

/**
 * A world orb in the picker (18 Nov): a small glass sphere tinted like its world, with that world's light inside
 * as a pearl (deep sea: pale surface light; Starry Night: the yellow moon; Aurora: aurora green). Radius 1.
 */
export function worldOrb(glass: string, pearl: string): BufferGeometry {
  const p = new Parts();
  p.add(new SphereGeometry(1, 28, 14), [glass, 0.35], [0, 0, 0], [0, 0, 0], 0);
  // The pearl rides on the front of the glass (the side facing the seat, -z), so it shows: inside, it was hidden.
  p.add(new SphereGeometry(0.5, 16, 10), [pearl, 0.6], [0.1, 0.15, -0.72], [0, 0, 0], 0);
  return p.done();
}

// Deep-sea glass, lit only by the surface far above, in world space (src/world/deepsea.ts), as banit's
// instruments are. On top: a cyan fresnel rim on the touchable parts (keys, heads, the shell) and a trace of it on
// the frames, and the amber flash and dip of a struck one. uFlash[i] is 0..1 per key or pad.
const VERT = /* glsl */ `
attribute vec4 tint; attribute float part;
uniform float uFlash[8]; uniform float uDip;
varying vec3 vN; varying vec3 vToEye; varying vec4 vTint; varying float vFlash; varying float vPlay;
void main() {
  float f = 0.0;
  for (int i = 0; i < 8; i++) if (abs(part - float(i)) < 0.5) f = uFlash[i];
  vec3 p = position;
  p.y -= uDip * f;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vec3 eye = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz); // this eye's position: under multiview cameraPosition is shared by both eyes
  vToEye = eye - w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vTint = tint; vFlash = f; vPlay = part >= 0.0 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = SEA_GLSL + /* glsl */ `
uniform vec3 uAmber; uniform vec3 uGlow;
varying vec3 vN; varying vec3 vToEye; varying vec4 vTint; varying float vFlash; varying float vPlay;
void main() {
  vec3 V = normalize(vToEye);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  float fres;
  vec3 c = seaGlass(N, V, vTint.rgb, vTint.a, fres);
  float idle = 1.0 - vFlash;
  c += uGlow * (fres * (0.12 + 0.85 * vPlay) + 0.08 * vPlay) * idle;
  float wrap = 0.5 + 0.5 * dot(N, SEA_L);
  c = mix(c, uAmber * (0.5 + 0.5 * wrap), vFlash * 0.85) + uAmber * vFlash * (0.25 + 0.6 * fres);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export type InstrumentModel = Mesh<BufferGeometry, ShaderMaterial>;

export function instrumentMesh(geometry: BufferGeometry, amber: Color, glow: Color, dip = 0): InstrumentModel {
  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: DoubleSide,
    uniforms: { ...SEA_UNIFORMS, uFlash: { value: new Array(8).fill(0) }, uDip: { value: dip }, uAmber: { value: amber.clone() }, uGlow: { value: glow.clone() } },
  });
  const m = new Mesh(geometry, mat);
  m.visible = false;
  return m;
}

/** Shows `m` at the seat frame (eye, level yaw) with these flash levels, or hides it. */
export function placeModel(m: InstrumentModel, show: boolean, seat: { eye: Vec3; yaw: number }, flashes: number[] = []) {
  m.visible = show;
  if (!show) return;
  m.position.set(...seat.eye);
  m.rotation.set(0, seat.yaw, 0); // three.js: local +x -> rightOf(yaw), local -z -> forwardOf(yaw)
  const u = m.material.uniforms.uFlash.value as number[];
  for (let i = 0; i < 8; i++) u[i] = flashes[i] ?? 0;
}

// The playable instruments as real objects (banit's request, 13 Nov), in the same lit wood, brass and ivory look
// as his nine section instruments (src/world/instruments.ts), modelled in code with no downloaded assets:
//   - the harp: a gold column, a maple neck and soundbox framing the 8 strings (the strings themselves stay
//     glowing lines in view.ts, so a pluck can light them),
//   - the keyboard: 8 ivory keys in a black lacquer case with a red felt rail,
//   - the pads: two small copper kettle drums whose heads are the strike surfaces.
// Each is one merged mesh (one draw call) built in the seat frame (x right, y up, -z ahead) and placed each frame
// at the seat. The key tops and drum heads sit exactly on their input targets (layout.ts): what you see is
// what you hit. A per-vertex `part` index lets one uniform array flash a struck key or head amber and dip a key.
import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Euler, Float32BufferAttribute,
  LatheGeometry, Matrix4, Mesh, Quaternion, ShaderMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../../contracts';
import { HARP, KEYS, PADS, padLocal } from './layout.ts';

type Mat = [string, number]; // colour, metal 0..1 (banit's palette, so the two sets of instruments match)
const MAPLE: Mat = ['#8a3d14', 0], PALE: Mat = ['#d9b98a', 0], GOLD: Mat = ['#e0b24e', 1], EBONY: Mat = ['#17120f', 0.15];
const IVORY: Mat = ['#f2ead8', 0.12], LACQUER: Mat = ['#0d0b0a', 0.55], FELT: Mat = ['#7a1020', 0];
const COPPER: Mat = ['#b9673a', 1], SKIN: Mat = ['#efe6d2', 0], SILVER: Mat = ['#cdd5de', 1];

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

/** The harp frame. String i runs from y = -HARP.below - halfLength (soundbox) to -HARP.below + halfLength (neck). */
export function harpFrame(): BufferGeometry {
  const p = new Parts();
  const z = -HARP.ahead, yLo = -HARP.below - HARP.halfLength, yHi = -HARP.below + HARP.halfLength;
  const half = spread(HARP.count - 1, HARP.count, HARP.spacing) + 0.04; // posts 4 cm outside the outer strings
  // Soundbox along the bottom: maple, a pale soundboard on top where the strings end, an eyelet per string.
  p.add(new BoxGeometry(half * 2 + 0.02, 0.03, 0.036), MAPLE, [0, yLo - 0.017, z]);
  p.add(new BoxGeometry(half * 2 - 0.01, 0.004, 0.022), PALE, [0, yLo - 0.0015, z]);
  // Neck along the top, gently arched at the ends where it meets the posts, with a gold tuning pin per string.
  const neck = new CatmullRomCurve3([[-half, yHi + 0.004], [-half + 0.05, yHi + 0.011], [0, yHi + 0.012], [half - 0.05, yHi + 0.011], [half, yHi + 0.004]]
    .map(([x, y]) => new Vector3(x, y, z)), false, 'centripetal');
  p.add(new TubeGeometry(neck, 32, 0.0085, 8, false), MAPLE);
  for (let i = 0; i < HARP.count; i++) {
    const x = spread(i, HARP.count, HARP.spacing);
    p.add(new SphereGeometry(0.0032, 8, 6), GOLD, [x, yHi + 0.004, z + 0.006]);
    p.add(new SphereGeometry(0.0026, 6, 4), EBONY, [x, yLo + 0.001, z + 0.004]);
  }
  // Fluted gold column on the bass (left) side with a crown; a slimmer post on the treble side.
  p.rod([-half, yLo - 0.03, z], [-half, yHi + 0.004, z], 0.0085, GOLD, 10);
  p.add(new LatheGeometry([[0.0085, 0], [0.014, 0.008], [0.011, 0.016], [0.015, 0.022], [0.006, 0.03], [0.001, 0.034]].map(([r, y]) => new Vector2(r, y)), 12), GOLD, [-half, yHi + 0.004, z]);
  p.rod([half, yLo - 0.03, z], [half, yHi + 0.004, z], 0.006, GOLD, 8);
  for (const x of [-half, half]) p.add(new SphereGeometry(0.009, 8, 6), GOLD, [x, yLo - 0.034, z]);
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
    p.add(new BoxGeometry(w, 0.004, 0.003), ['#e3d7bd', 0.1], [x, top - 0.016, zc + d / 2 + 0.0015], [0, 0, 0], i); // front lip
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

// Lit like banit's instruments without scene lights: a key light fixed to the view, a fake sky reflection for
// metal. On top: a cyan fresnel rim on the playable parts (keys, heads) so they read as touchable, and the amber
// flash and dip of a struck one. uFlash[i] is 0..1 per key or pad.
const VERT = /* glsl */ `
attribute vec4 tint; attribute float part;
uniform float uFlash[8]; uniform float uDip;
varying vec3 vN; varying vec3 vView; varying vec4 vTint; varying float vFlash; varying float vPlay;
void main() {
  float f = 0.0;
  for (int i = 0; i < 8; i++) if (abs(part - float(i)) < 0.5) f = uFlash[i];
  vec3 p = position;
  p.y -= uDip * f;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vTint = tint; vFlash = f; vPlay = part >= 0.0 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform vec3 uAmber; uniform vec3 uGlow;
varying vec3 vN; varying vec3 vView; varying vec4 vTint; varying float vFlash; varying float vPlay;
void main() {
  vec3 V = normalize(vView);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.45, 0.7, 0.55));
  float metal = vTint.a;
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), mix(20.0, 80.0, metal));
  vec3 R = reflect(-V, N);
  vec3 sky = mix(vec3(0.03, 0.04, 0.08), vec3(0.42, 0.36, 0.7), smoothstep(-0.2, 0.9, R.y))
    + vec3(0.15, 0.6, 0.65) * pow(1.0 - abs(R.y), 6.0) * 0.5;
  vec3 wood = vTint.rgb * (0.3 + 0.8 * diff) + vec3(spec * 0.3);
  vec3 shiny = vTint.rgb * (0.12 + 0.45 * diff) + vTint.rgb * sky * 1.7 + mix(vTint.rgb, vec3(1.0), 0.6) * spec * 1.3;
  vec3 c = mix(wood, shiny, metal);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  c += uGlow * rim * (0.08 + 0.5 * vPlay) * (1.0 - vFlash);
  c = mix(c, uAmber * (0.55 + 0.6 * diff), vFlash * 0.85) + uAmber * vFlash * (0.25 + 0.5 * rim);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export type InstrumentModel = Mesh<BufferGeometry, ShaderMaterial>;

export function instrumentMesh(geometry: BufferGeometry, amber: Color, glow: Color, dip = 0): InstrumentModel {
  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: DoubleSide,
    uniforms: { uFlash: { value: new Array(8).fill(0) }, uDip: { value: dip }, uAmber: { value: amber.clone() }, uGlow: { value: glow.clone() } },
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

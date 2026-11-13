// The nine orchestra sections as real instruments, modelled in code (no downloaded assets).
// Each is one merged body mesh (tint rgb + metal per vertex) and one LineSegments for its strings,
// sized to sit inside the 25 cm collider and facing +z.
import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Euler, ExtrudeGeometry, Float32BufferAttribute,
  LatheGeometry, Matrix4, Quaternion, Shape, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StemId, Vec3 } from '../contracts';

export interface Instrument {
  body: BufferGeometry;
  /** Flat x,y,z pairs for LineSegments (strings). */
  lines: number[];
  /** r,g,b per line vertex. */
  lineColors: number[];
  /** 0..1 per line vertex: how far a string swings there when its section plays (0 at the ends). */
  vib: number[];
}

type Mat = [string, number]; // colour, metal 0..1
const SPRUCE: Mat = ['#b5651d', 0], MAPLE: Mat = ['#8a3d14', 0], DARKWOOD: Mat = ['#5c2a12', 0], PALE: Mat = ['#d9b98a', 0];
const EBONY: Mat = ['#17120f', 0.15], GRENADILLA: Mat = ['#1b1512', 0.25];
const BRASS: Mat = ['#d8a13a', 1], SILVER: Mat = ['#cdd5de', 1], COPPER: Mat = ['#b9673a', 1], GOLD: Mat = ['#e0b24e', 1];
const SKIN: Mat = ['#efe6d2', 0], FELT: Mat = ['#f4f1ea', 0], PEARL: Mat = ['#f3efe6', 0.4];

const Y = new Vector3(0, 1, 0);

class Builder {
  private parts: BufferGeometry[] = [];
  lines: number[] = [];
  lineColors: number[] = [];
  vib: number[] = [];

  /** Adds a part at `at`, rotated by euler `rot` and scaled. */
  add(g: BufferGeometry, [hex, metal]: Mat, at: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): this {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute('uv');
    flat.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale)));
    const c = new Color(hex), n = flat.getAttribute('position').count;
    const tint = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) tint.set([c.r, c.g, c.b, metal], i * 4);
    flat.setAttribute('tint', new Float32BufferAttribute(tint, 4));
    this.parts.push(flat);
    return this;
  }

  /** A straight rod from a to b. */
  rod(a: Vec3, b: Vec3, r: number, mat: Mat, seg = 8, r2 = r): this {
    const va = new Vector3(...a), d = new Vector3(...b).sub(va), len = d.length();
    const g = new CylinderGeometry(r2, r, len, seg, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(Y, d.normalize()));
    const m = va.add(new Vector3(...b)).multiplyScalar(0.5);
    return this.add(g, mat, [m.x, m.y, m.z]);
  }

  /** A string from a to b in `seg` pieces; it swings between them when `vibrates`. */
  string(a: Vec3, b: Vec3, hex = '#e9e4d6', vibrates = true, seg = 8): this {
    const c = new Color(hex);
    const n = vibrates ? seg : 1;
    for (let i = 0; i < n; i++) {
      for (const t of [i / n, (i + 1) / n]) {
        this.lines.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        this.lineColors.push(c.r, c.g, c.b);
        this.vib.push(vibrates ? Math.sin(Math.PI * t) : 0);
      }
    }
    return this;
  }

  /** Merges, turns the whole instrument by `rot`, centres it and scales its longest side to `size` metres. */
  finish(size: number, rot: Vec3 = [0, 0, 0]): Instrument {
    const body = mergeGeometries(this.parts);
    const turn = new Matrix4().makeRotationFromEuler(new Euler(...rot));
    body.applyMatrix4(turn);
    body.computeBoundingBox();
    const box = body.boundingBox!, dim = box.getSize(new Vector3()), mid = box.getCenter(new Vector3());
    const s = size / Math.max(dim.x, dim.y, dim.z);
    const fit = new Matrix4().makeScale(s, s, s).multiply(new Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z));
    body.applyMatrix4(fit);
    fit.multiply(turn);
    const p = new Vector3();
    for (let i = 0; i < this.lines.length; i += 3) {
      p.fromArray(this.lines, i).applyMatrix4(fit);
      p.toArray(this.lines, i);
    }
    return { body, lines: this.lines, lineColors: this.lineColors, vib: this.vib };
  }
}

/** A tube along `pts` whose radius is rAt(u), u = 0..1 along it: bells flare, lead pipes taper. Open-ended. */
function sweep(pts: Vec3[], rAt: (u: number) => number, seg = 64, radial = 10): BufferGeometry {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [], index: number[] = [];
  const c = new Vector3(), v = new Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, r = rAt(u);
    curve.getPointAt(u, c);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      v.copy(c).addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c2 = a + radial, d = b + radial;
      index.push(a, c2, b, b, c2, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const lathe = (profile: [number, number][], seg = 24) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), seg);
/** A horn bell's radius: narrow bore r0 until `from`, then an exponential flare to r1. */
const flare = (r0: number, r1: number, from: number, sharp = 4) => (u: number) =>
  (u < from ? r0 : r0 + (r1 - r0) * (Math.exp(sharp * ((u - from) / (1 - from))) - 1) / (Math.exp(sharp) - 1));

// ---- violin family: one builder, three sets of proportions ----

interface Fiddle {
  ribs: number; neck: number; sloped: boolean; endpin: number; chinrest: boolean; wide: number; top: Mat; back: Mat; size: number;
}

function fiddle(f: Fiddle): Instrument {
  const b = new Builder();
  // Right half of the outline, bottom to top (body length 1): lower bout, C-bout waist, upper bout.
  const upper: [number, number][] = f.sloped
    ? [[0.2, 0.7], [0.15, 0.82], [0.08, 0.94], [0.035, 0.995]]
    : [[0.235, 0.72], [0.22, 0.85], [0.15, 0.95], [0.06, 0.995]];
  const half: [number, number][] = [
    [0.15, 0.01], [0.26, 0.07], [0.29, 0.18], [0.275, 0.3], [0.225, 0.372], [0.15, 0.415], [0.128, 0.5], [0.15, 0.585], [0.218, 0.632], ...upper,
  ];
  const right = half.map(([x, y]) => new Vector2(x * f.wide, y));
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.splineThru([...right, new Vector2(0, 1)]);
  shape.splineThru([...right.map((p) => new Vector2(-p.x, p.y)).reverse(), new Vector2(0, 0)]);
  const bevel = 0.028;
  const body = new ExtrudeGeometry(shape, { depth: f.ribs, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.018, bevelSegments: 3, curveSegments: 5 });
  b.add(body, f.back, [0, 0, -f.ribs / 2]);
  const zt = f.ribs / 2 + bevel; // top plate
  // The spruce top is a lighter plate laid just proud of the body, so the front reads as a different wood.
  b.add(new ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: false, curveSegments: 5 }), f.top, [0, 0.012, zt - 0.004], [0, 0, 0], [0.93, 0.976, 1]);
  // f-holes
  for (const side of [-1, 1]) {
    const s = side * f.wide;
    b.add(sweep([[0.075 * s, 0.4, 0], [0.095 * s, 0.43, 0], [0.085 * s, 0.5, 0], [0.105 * s, 0.56, 0], [0.09 * s, 0.585, 0]], () => 0.007, 14, 5), EBONY, [0, 0, zt + 0.011], [0, 0, 0], [1, 1, 0.3]);
  }
  // Neck, fingerboard, pegbox, scroll and pegs
  const top = 1 + f.neck;
  b.add(new BoxGeometry(0.05, f.neck + 0.06, 0.05), f.back, [0, 1 + f.neck / 2 - 0.03, zt - 0.04]);
  b.rod([0, 0.6, zt + 0.045], [0, top, zt + 0.012], 0.034, EBONY, 4, 0.022);
  b.add(new BoxGeometry(0.052, 0.15, 0.055), f.back, [0, top + 0.07, zt - 0.045]);
  b.add(sweep(Array.from({ length: 14 }, (_, i) => {
    const a = (i / 13) * Math.PI * 3, r = 0.045 - i * 0.0026;
    return [0, top + 0.17 + Math.sin(a) * r, zt - 0.05 - Math.cos(a) * r] as Vec3;
  }), (u) => 0.03 - 0.014 * u, 28, 8), f.back, [0, 0, 0], [0, 0, 0], [0.9, 1, 1]);
  for (let i = 0; i < 4; i++) {
    const y = top + 0.025 + i * 0.033, side = i % 2 ? 1 : -1;
    b.rod([-0.03 * side, y, zt - 0.045], [0.075 * side, y, zt - 0.045], 0.006, EBONY, 6);
    b.add(new SphereGeometry(0.014, 8, 6), EBONY, [0.085 * side, y, zt - 0.045], [0, 0, 0], [0.5, 1.2, 1]);
  }
  b.add(new BoxGeometry(0.058, 0.012, 0.012), PALE, [0, top, zt + 0.014]); // nut
  // Bridge, tailpiece, chinrest, endpin
  const bridgeY = 0.47, bridgeZ = zt + 0.08;
  b.add(new BoxGeometry(0.115 * f.wide, 0.012, 0.08), PALE, [0, bridgeY, zt + 0.04]);
  b.rod([0, 0.07, zt + 0.02], [0, 0.31, zt + 0.045], 0.03, EBONY, 4, 0.045);
  b.rod([0, 0.0, zt - 0.01], [0, 0.07, zt + 0.02], 0.004, EBONY, 4);
  if (f.chinrest) b.add(new SphereGeometry(0.075, 12, 8), EBONY, [-0.13, 0.075, zt + 0.012], [0, 0, 0], [1, 0.85, 0.22]);
  if (f.endpin) {
    b.rod([0, -f.endpin, 0], [0, 0, 0], 0.006, SILVER, 6);
    b.add(new CylinderGeometry(0.016, 0.02, 0.03, 8), EBONY, [0, -0.012, 0]);
  }
  // Four strings: nut to bridge (these swing), then bridge to tailpiece.
  for (let i = 0; i < 4; i++) {
    const k = i / 3 - 0.5;
    b.string([k * 0.04, top, zt + 0.022], [k * 0.085 * f.wide, bridgeY, bridgeZ], i < 2 ? '#d8c9a0' : '#e8ecf2');
    b.string([k * 0.085 * f.wide, bridgeY, bridgeZ], [k * 0.05, 0.31, zt + 0.05], '#e8ecf2', false);
  }
  return b.finish(f.size);
}

const violin = () => fiddle({ ribs: 0.085, neck: 0.38, sloped: false, endpin: 0, chinrest: true, wide: 1, top: SPRUCE, back: MAPLE, size: 0.36 });
const cello = () => fiddle({ ribs: 0.2, neck: 0.4, sloped: false, endpin: 0.3, chinrest: false, wide: 1.08, top: ['#a4551c', 0], back: ['#7a3312', 0], size: 0.44 });
const doubleBass = () => fiddle({ ribs: 0.24, neck: 0.44, sloped: true, endpin: 0.12, chinrest: false, wide: 1.18, top: ['#8b4a1c', 0], back: DARKWOOD, size: 0.48 });

// ---- woodwinds ----

function flute(): Instrument {
  const b = new Builder();
  const r = 0.0145;
  b.add(new CylinderGeometry(r, r, 1, 14, 1), SILVER, [0, 0, 0], [0, 0, Math.PI / 2]);
  b.add(new CylinderGeometry(r * 1.12, r * 1.12, 0.035, 14), SILVER, [-0.5, 0, 0], [0, 0, Math.PI / 2]); // crown
  for (const x of [-0.215, -0.2, 0.3, 0.315]) b.add(new CylinderGeometry(r * 1.18, r * 1.18, 0.012, 14), SILVER, [x, 0, 0], [0, 0, Math.PI / 2]); // joint rings
  // Lip plate with its embouchure hole
  b.add(new SphereGeometry(0.034, 14, 8), SILVER, [-0.385, r * 0.75, 0], [0, 0, 0], [1, 0.3, 0.62]);
  b.add(new CylinderGeometry(0.009, 0.009, 0.004, 10), EBONY, [-0.385, r * 0.75 + 0.01, 0]);
  // Key cups on posts, along one rod
  const keys = [-0.13, -0.085, -0.04, 0.005, 0.05, 0.11, 0.155, 0.2, 0.245, 0.345, 0.39, 0.435];
  keys.forEach((x, i) => {
    const big = i < 9 ? 0.0185 : 0.021;
    b.add(new CylinderGeometry(big, big * 0.92, 0.008, 12), SILVER, [x, r + 0.008, 0]);
    b.add(new CylinderGeometry(big * 0.45, big * 0.45, 0.003, 8), SILVER, [x, r + 0.0135, 0]);
    b.rod([x, r + 0.006, 0.012], [x, r + 0.006, 0.024], 0.0035, SILVER, 5);
  });
  b.rod([-0.15, r + 0.006, 0.025], [0.27, r + 0.006, 0.025], 0.0038, SILVER, 6);
  b.rod([0.325, r + 0.006, 0.025], [0.46, r + 0.006, 0.025], 0.0038, SILVER, 6);
  for (const x of [-0.15, 0.06, 0.27, 0.325, 0.46]) b.add(new SphereGeometry(0.0065, 6, 5), SILVER, [x, r + 0.006, 0.025]);
  // Trill keys and the thumb key underneath
  for (const x of [0.03, 0.075]) b.add(new SphereGeometry(0.011, 8, 6), SILVER, [x, r + 0.004, -0.02], [0, 0, 0], [1.3, 0.4, 0.8]);
  b.add(new SphereGeometry(0.016, 8, 6), SILVER, [-0.11, -r - 0.004, 0.004], [0, 0, 0], [1.2, 0.4, 1]);
  return b.finish(0.46, [0.9, 0, 0.12]); // tipped toward the viewer so the keys show
}

function clarinet(): Instrument {
  const b = new Builder();
  const r = 0.026;
  b.add(new CylinderGeometry(r, r * 1.04, 0.68, 14), GRENADILLA, [0, 0.04, 0]);
  // Bell with its silver ring
  b.add(lathe([[r * 1.04, -0.3], [0.031, -0.36], [0.042, -0.43], [0.062, -0.48], [0.082, -0.5], [0.08, -0.505], [0.058, -0.48], [0.03, -0.4]], 20), GRENADILLA);
  b.add(new TorusGeometry(0.082, 0.004, 6, 20), SILVER, [0, -0.502, 0], [Math.PI / 2, 0, 0]);
  // Barrel, mouthpiece, ligature
  b.add(lathe([[r * 1.02, 0.38], [r * 1.2, 0.41], [r * 1.2, 0.43], [r * 1.0, 0.46]], 14), GRENADILLA);
  b.add(new CylinderGeometry(0.011, r * 0.98, 0.13, 12), EBONY, [0, 0.525, 0], [0, 0, 0], [1, 1, 0.85]);
  b.add(new CylinderGeometry(r * 0.86, r * 0.92, 0.035, 12), SILVER, [0, 0.505, 0]);
  b.add(new BoxGeometry(0.014, 0.1, 0.003), PALE, [0, 0.535, 0.014]); // reed
  for (const y of [-0.3, 0.04, 0.38, 0.46]) b.add(new CylinderGeometry(r * 1.16, r * 1.16, 0.014, 14), SILVER, [0, y, 0]);
  // Ring keys down the front, with their rods
  for (const y of [0.27, 0.21, 0.15, -0.03, -0.09, -0.15]) {
    b.add(new TorusGeometry(0.012, 0.0035, 5, 12), SILVER, [0, y, r + 0.003]);
  }
  for (const [y0, y1] of [[0.12, 0.3], [-0.2, 0.0]] as const) b.rod([0.018, y0, r * 0.82], [0.018, y1, r * 0.82], 0.0032, SILVER, 5);
  // Side and pinky keys: flat spoons on short arms
  const spoon = (x: number, y: number, z: number, len: number) => {
    b.add(new SphereGeometry(0.012, 8, 5), SILVER, [x, y, z], [0, 0, 0], [0.9, 1.5, 0.35]);
    b.rod([x, y, z], [x * 0.7, y + len, z * 0.95], 0.003, SILVER, 5);
  };
  spoon(0.026, 0.32, 0.012, -0.05); spoon(-0.026, 0.3, 0.012, -0.06); spoon(0.027, 0.34, -0.006, -0.05);
  spoon(-0.03, -0.2, 0.014, 0.07); spoon(0.03, -0.22, 0.014, 0.08); spoon(-0.026, -0.25, 0.018, 0.06); spoon(0.026, -0.27, 0.018, 0.07);
  b.add(new SphereGeometry(0.011, 8, 5), SILVER, [0, 0.33, -r - 0.004], [0, 0, 0], [1, 1.6, 0.4]); // register key
  return b.finish(0.44, [0.25, 0, -0.3]);
}

// ---- brass ----

function horn(): Instrument {
  const b = new Builder();
  const R = 0.19;
  // Mouthpiece and lead pipe, 1.3 turns of coil, then the bell throat sweeping out and flaring.
  const path: Vec3[] = [[-0.1, 0.36, 0.05], [-0.14, 0.28, 0.05], [-0.17, 0.18, 0.045]];
  const a0 = Math.PI * 0.88, turns = 1.3;
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, a = a0 + t * turns * Math.PI * 2;
    path.push([Math.cos(a) * R * (1 - 0.1 * t), Math.sin(a) * R * (1 - 0.1 * t), 0.04 - 0.07 * t]);
  }
  path.push([0.2, -0.13, -0.02], [0.27, -0.2, 0.02], [0.33, -0.27, 0.07]);
  const bell = flare(0.02, 0.17, 0.86, 3.2);
  b.add(sweep(path, (u) => (u < 0.03 ? 0.016 - 0.3 * u : u < 0.5 ? 0.008 + 0.014 * (u / 0.5) : bell(u)), 150, 12), BRASS);
  b.add(new TorusGeometry(0.012, 0.004, 6, 12), BRASS, [-0.1, 0.36, 0.05], [Math.PI / 2 - 0.3, 0, 0]); // mouthpiece rim
  // Three rotary valves with their slides and finger levers
  for (let i = 0; i < 3; i++) {
    const x = -0.07 + i * 0.062, y = 0.015 - i * 0.012;
    b.add(new CylinderGeometry(0.026, 0.026, 0.045, 14), SILVER, [x, y, 0.01], [Math.PI / 2, 0, 0]);
    b.add(new CylinderGeometry(0.02, 0.02, 0.055, 12), BRASS, [x, y, 0.01], [Math.PI / 2, 0, 0]);
    const drop = 0.07 + i * 0.012;
    b.add(sweep([[x - 0.018, y - 0.02, 0.0], [x - 0.02, y - drop, -0.005], [x, y - drop - 0.022, -0.008], [x + 0.02, y - drop, -0.005], [x + 0.018, y - 0.02, 0.0]], () => 0.0085, 20, 8), BRASS);
    b.rod([x, y + 0.02, 0.035], [x - 0.05, y + 0.12 - i * 0.004, 0.06], 0.0035, SILVER, 5);
    b.add(new SphereGeometry(0.014, 8, 5), SILVER, [x - 0.055, y + 0.125 - i * 0.004, 0.062], [0.5, 0, 0.4], [0.7, 1.6, 0.35]);
  }
  b.rod([-0.16, 0.05, 0.04], [0.14, -0.05, -0.02], 0.004, BRASS, 5); // brace across the coil
  b.add(new TorusGeometry(0.022, 0.004, 5, 12, Math.PI * 1.4), BRASS, [-0.2, 0.02, 0.06], [0, Math.PI / 2, 0]); // pinky hook
  return b.finish(0.4, [0.15, -0.35, 0]);
}

function trumpet(): Instrument {
  const b = new Builder();
  const yT = 0.045, yB = -0.05, zL = 0.026;
  // Mouthpiece and lead pipe forward to the tuning slide, back to the third valve.
  b.add(sweep([[-0.5, yT, zL], [-0.3, yT, zL], [0.0, yT, zL], [0.2, yT, zL], [0.25, 0, zL], [0.2, yB, zL], [0.1, yB, zL * 0.6], [0.03, yB, 0]],
    (u) => (u < 0.04 ? 0.02 - 0.3 * u : 0.0105), 70, 10), BRASS);
  b.add(new TorusGeometry(0.016, 0.005, 6, 14), SILVER, [-0.5, yT, zL], [0, Math.PI / 2, 0]);
  b.add(lathe([[0.019, 0], [0.019, 0.02], [0.009, 0.05], [0.007, 0.09]], 12), SILVER, [-0.5, yT, zL], [0, 0, -Math.PI / 2]);
  // From the first valve back, round the rear bow, then forward along the top to the bell.
  b.add(sweep([[-0.15, yB, 0], [-0.24, yB, -zL * 0.6], [-0.3, yB, -zL], [-0.345, 0, -zL], [-0.3, yT, -zL], [-0.1, yT, -zL], [0.2, yT, -zL], [0.42, yT, -zL], [0.5, yT, -zL]],
    flare(0.0115, 0.105, 0.8, 4.2), 110, 14), BRASS);
  // Three piston valves: casing, caps, stems and pearl buttons
  for (let i = 0; i < 3; i++) {
    const x = -0.13 + i * 0.062;
    b.add(new CylinderGeometry(0.021, 0.021, 0.19, 14), BRASS, [x, -0.02, 0]);
    b.add(new CylinderGeometry(0.0235, 0.0235, 0.018, 14), SILVER, [x, 0.08, 0]);
    b.add(new CylinderGeometry(0.0235, 0.02, 0.018, 14), SILVER, [x, -0.12, 0]);
    b.rod([x, 0.085, 0], [x, 0.125, 0], 0.004, SILVER, 6);
    b.add(new CylinderGeometry(0.014, 0.014, 0.007, 12), PEARL, [x, 0.128, 0]);
    if (i < 2) b.rod([x + 0.02, -0.03, 0], [x + 0.042, -0.03, 0], 0.008, BRASS, 8);
  }
  // Valve slides: the first out the back, the third forward with its finger ring
  b.add(sweep([[-0.13, -0.005, 0.02], [-0.13, -0.005, 0.07], [-0.13, -0.03, 0.085], [-0.13, -0.055, 0.07], [-0.13, -0.055, 0.02]], () => 0.008, 20, 8), BRASS);
  b.add(sweep([[-0.006, -0.01, 0.02], [0.1, -0.01, 0.055], [0.13, -0.035, 0.06], [0.1, -0.06, 0.055], [-0.006, -0.06, 0.02]], () => 0.008, 24, 8), BRASS);
  b.add(new TorusGeometry(0.016, 0.003, 5, 12), BRASS, [0.09, 0.012, 0.055]);
  b.add(new TorusGeometry(0.018, 0.0035, 5, 12, Math.PI * 1.3), BRASS, [-0.2, yT + 0.022, zL], [0, 0, -0.4]); // pinky hook
  for (const x of [-0.26, 0.16]) b.rod([x, yT, zL], [x, yT, -zL], 0.004, BRASS, 5); // braces between the pipes
  return b.finish(0.46, [0.2, -0.45, 0.1]);
}

// ---- percussion and harp ----

function timpani(): Instrument {
  const b = new Builder();
  const bowl: [number, number][] = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    return [Math.max(0.001, 0.5 * Math.sin(t * Math.PI * 0.5)), -0.44 * Math.cos(t * Math.PI * 0.5) ** 1.3] as [number, number];
  });
  b.add(lathe(bowl, 32), COPPER);
  b.add(new CylinderGeometry(0.498, 0.498, 0.012, 32), SKIN, [0, 0.006, 0]);
  b.add(new TorusGeometry(0.505, 0.017, 8, 36), SILVER, [0, 0.008, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, x = Math.cos(a) * 0.535, z = Math.sin(a) * 0.535;
    b.rod([x, -0.14, z], [x, 0.03, z], 0.009, SILVER, 6);
    b.add(new BoxGeometry(0.04, 0.03, 0.03), SILVER, [Math.cos(a) * 0.515, -0.13, Math.sin(a) * 0.515], [0, -a, 0]);
    b.add(new CylinderGeometry(0.014, 0.014, 0.018, 6), SILVER, [x, 0.035, z]);
  }
  // Three legs to a base ring, with the tuning pedal
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    b.rod([Math.cos(a) * 0.4, -0.26, Math.sin(a) * 0.4], [Math.cos(a) * 0.46, -0.8, Math.sin(a) * 0.46], 0.02, SILVER, 8, 0.014);
    b.add(new SphereGeometry(0.035, 8, 6), EBONY, [Math.cos(a) * 0.46, -0.82, Math.sin(a) * 0.46]);
  }
  b.add(new TorusGeometry(0.44, 0.012, 6, 28), SILVER, [0, -0.62, 0], [Math.PI / 2, 0, 0]);
  b.rod([0, -0.44, 0], [0, -0.62, 0], 0.03, SILVER, 8);
  b.add(new BoxGeometry(0.1, 0.02, 0.18), EBONY, [0, -0.78, 0.4], [0.3, 0, 0]);
  // A pair of mallets resting across the head
  for (const side of [-1, 1]) {
    const a: Vec3 = [0.12 * side, 0.05, 0.2], e: Vec3 = [0.3 * side, 0.09, -0.6];
    b.rod(a, e, 0.011, PALE, 6, 0.009);
    b.add(new SphereGeometry(0.05, 12, 8), FELT, a, [0, 0, 0], [1, 0.8, 1]);
  }
  return b.finish(0.4, [0.32, 0.3, 0]); // tipped forward to show the head
}

function harp(): Instrument {
  const b = new Builder();
  const colX = -0.3;
  // Fluted column with crown and capital
  b.add(new CylinderGeometry(0.022, 0.026, 1.0, 10), GOLD, [colX, 0, 0]);
  b.add(lathe([[0.026, 0.44], [0.045, 0.47], [0.04, 0.5], [0.05, 0.53], [0.03, 0.56], [0.036, 0.59], [0.001, 0.61]], 14), GOLD, [colX, 0, 0]);
  b.add(lathe([[0.05, -0.5], [0.04, -0.47], [0.03, -0.44], [0.026, -0.4]], 14), GOLD, [colX, 0, 0]);
  // Harmonic curve (neck): from the capital, dipping, then rising to the shoulder
  const neck: Vec3[] = [[colX, 0.5, 0], [-0.2, 0.44, 0], [-0.05, 0.36, 0], [0.12, 0.38, 0], [0.25, 0.46, 0], [0.31, 0.5, 0]];
  const neckCurve = new CatmullRomCurve3(neck.map((p) => new Vector3(...p)), false, 'centripetal');
  b.add(sweep(neck, () => 0.03, 40, 8), MAPLE, [0, 0, 0], [0, 0, 0], [1, 1, 0.7]);
  b.add(sweep(neck, () => 0.008, 40, 6), GOLD, [0, -0.028, 0.018]); // brass action plate
  // Soundbox: a rounded body tapering from the base up to the shoulder, with a paler soundboard on its string side
  const box: Vec3[] = [[-0.16, -0.5, 0], [0.0, -0.2, 0], [0.16, 0.1, 0], [0.3, 0.4, 0], [0.32, 0.5, 0]];
  b.add(sweep(box, (u) => 0.095 - 0.06 * u, 30, 10), MAPLE);
  b.add(sweep(box, (u) => 0.062 - 0.04 * u, 30, 4), PALE, [-0.052, 0.03, 0], [0, 0, 0], [1, 1, 0.9]);
  // Base and feet, pedals at the back
  b.add(new BoxGeometry(0.42, 0.05, 0.26), DARKWOOD, [-0.2, -0.53, 0]);
  for (const [x, z] of [[-0.39, 0.11], [-0.39, -0.11], [-0.02, 0.11], [-0.02, -0.11]]) b.add(new SphereGeometry(0.026, 8, 6), GOLD, [x, -0.565, z]);
  for (let i = 0; i < 7; i++) b.rod([-0.11 + i * 0.012, -0.52, -0.13], [-0.11 + i * 0.012 + (i - 3) * 0.012, -0.535, -0.19], 0.005, GOLD, 4);
  // Strings, vertical from the neck to the soundboard. Cs are red and Fs dark, as on a real harp.
  const n = 26, p = new Vector3();
  for (let i = 0; i < n; i++) {
    const x = -0.21 + (i / (n - 1)) * 0.45;
    // The neck's height at x, found along its curve
    let top = 0.4;
    for (let k = 0; k <= 60; k++) { neckCurve.getPoint(k / 60, p); if (p.x >= x) { top = p.y; break; } }
    const bottom = -0.5 + ((x + 0.16) / 0.48) * 1.0 + 0.085 - 0.05 * (i / (n - 1));
    if (top - 0.03 - bottom < 0.03) continue;
    const note = (n - 1 - i) % 7; // counting down from the top string
    b.string([x, top - 0.03, 0], [x - 0.012, bottom, 0], note === 0 ? '#e0483a' : note === 4 ? '#2b3350' : '#efe8d8');
  }
  return b.finish(0.48, [0, -0.5, 0]);
}

/** The instrument that stands for each section. */
export function instrument(stem: StemId): Instrument {
  switch (stem) {
    case 'vln': return violin();
    case 'vla_vc': return cello();
    case 'cb': return doubleBass();
    case 'fl': return flute();
    case 'reeds': return clarinet();
    case 'hn': return horn();
    case 'brass': return trumpet();
    case 'perc': return timpani();
    case 'harp': return harp();
  }
}

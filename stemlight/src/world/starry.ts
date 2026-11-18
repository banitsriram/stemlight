// The Starry Night world, stylised and cartoon-shaded (18 Nov; sir picked this look from three references, for the
// sky and the land alike), laid out after Vincent van Gogh's The Starry Night (1889, public domain), all in code:
// - the sky: a dark night with bold, crisp swirl strokes in teal, light blue and white, the eleven stars where the
//   painting has them as glowing yellow cores ringed with strokes, and the crescent moon high on the right;
// - the land: a village of cottages close round you on the left, right and behind (open straight ahead, so the score
//   and instruments stay readable), deep-blue walls, near-black roofs and warm windows, all with bold navy outlines;
//   beyond the open view the church spire and a few cottages far ahead, layered hills rising to the dark peak on the
//   right, and the cypress standing tall on your left like a flame;
// - fireflies blinking over the meadow.
// The swirls flow slowly and the stars' rings swell with the beat. Three draw calls (F17): the sky, the land (one
// opaque toon mesh whose outlines are an inverted hull in the same geometry), and the fireflies.
import {
  AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, FrontSide, IcosahedronGeometry, Mesh,
  type Object3D, Points, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { SEA_GLSL, SEA_UNIFORMS, glslColor } from './deepsea.ts';
import type { WorldParts } from './worldList.ts';

const NOISE = /* glsl */ `
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/** Where the painting's stars sit on the sky (azimuth, elevation in degrees) and their size, as on the canvas. */
const STARS: [number, number, number][] = [
  [-42.4, 52.2, 3.2], [-29.1, 53.8, 2.6], [-16.7, 53.3, 3.4], [-9.4, 51.4, 2.4], [12.0, 50.0, 4.0], [-28.5, 44.3, 3.8],
  [22.2, 40.6, 3.6], [-19.0, 33.6, 2.6], [-49.2, 25.3, 2.8], [-40.1, 23.2, 3.4], [-15.7, 19.8, 6.0],
];
const glslStars = `const int NSTARS = ${STARS.length};\nconst vec3 STARS[${STARS.length}] = vec3[](${STARS.map(([a, e, r]) => `vec3(${a.toFixed(1)}, ${e.toFixed(1)}, ${r.toFixed(1)})`).join(', ')});`;

/** The cartoon palette (sir: deep night blues, warm windows, bold navy outlines). */
const COL = {
  zenith: '#03060E', horizon: '#0B1628', teal: '#2A8290', light: '#6FC2CC', white: '#E8F2EC', yellow: '#FFE07A',
  cream: '#FFF4C9', moonPale: '#F8EAA8', outline: '#0E2E36', edge: '#0F3D48',
};

function sky(): Mesh {
  const g = (k: keyof typeof COL) => glslColor(COL[k]);
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + glslStars + /* glsl */ `
uniform float uTime; uniform float uFade; uniform float uPulse; varying vec3 vDir;
const vec3 ZENITH = ${g('zenith')}, HORIZON = ${g('horizon')}, TEAL = ${g('teal')}, LIGHT = ${g('light')}, WHITE = ${g('white')},
  YELLOW = ${g('yellow')}, CREAM = ${g('cream')}, MOONPALE = ${g('moonPale')}, OUTLINE = ${g('outline')}, EDGE = ${g('edge')};
const vec2 C1 = vec2(3.0, 33.0), C2 = vec2(19.4, 27.4), MOON = vec2(44.0, 44.3);
// A swirl: the canvas turned round c (degrees) by up to k radians at the centre, less further out, so straight wind
// strokes wrap into a spiral there, with no seam and no point where strokes radiate.
vec2 twist(vec2 p, vec2 c, float r, float k) {
  vec2 d = p - c; float a = k * exp(-dot(d, d) / (r * r)); float cs = cos(a), sn = sin(a);
  return c + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
}
// The flow: the wind in long waves, wrapped into the great swirl and its counter-curl (the S above the middle) and a
// few eddies elsewhere. Brush dashes are laid along it in rows.
vec2 flow(vec2 p) {
  vec2 q = twist(p, C1, 13.0, 5.6);
  q = twist(q, C2, 8.0, -4.6);
  q = twist(q, vec2(-34.0, 37.0), 9.0, 2.2);
  q = twist(q, vec2(140.0, 30.0), 18.0, 3.2);
  q = twist(q, vec2(-120.0, 38.0), 16.0, -3.0);
  q.y += 2.4 * sin(q.x * 0.07 + 1.0) + 0.9 * sin(q.x * 0.19 + q.y * 0.1);
  return q;
}
// One brush dash at q: a comma-like stroke (thick in the middle, tapered at both ends) in rows along the flow, sliding
// slowly along it; dashes appear with probability density. Returns (coverage, edge, shade 0..1, cell hash).
vec4 dash(vec2 q, float t, float density) {
  float row = floor(q.y * 0.85), across = fract(q.y * 0.85) - 0.5;
  float along = q.x * 0.24 - t * 0.3 + hash2(vec2(row, 7.0)) * 9.0;
  float cell = floor(along), ph = fract(along);
  float h = hash2(vec2(cell, row));
  if (h > density) return vec4(0.0);
  float len = 0.55 + 0.35 * hash2(vec2(row, cell + 3.0));
  float k = clamp(ph / len, 0.0, 1.0);
  float half_ = 0.32 * sin(3.14159 * k) * step(ph, len);
  float dist = abs(across + 0.08 * sin(k * 3.14159 * 2.0)) - half_; // < 0 inside; a slight S-curve, like a comma
  float aa = fwidth(dist) * 1.3;
  float cover = 1.0 - smoothstep(-aa, aa, dist);
  float edge = (1.0 - smoothstep(-aa, aa, dist + 0.07)) * cover; // the inner body; cover - edge is the dark rim
  return vec4(cover, edge, hash2(vec2(cell + 11.0, row)), h);
}
// Crisp, antialiased coverage of a ring of stroke at radius r0 (r and widths in the same units).
float ringAt(float r, float r0, float w) { float aa = fwidth(r) * 1.2; return 1.0 - smoothstep(w - aa, w + aa, abs(r - r0)); }
void main() {
  vec3 d = normalize(vDir);
  float az = degrees(atan(d.x, -d.z));
  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float squeeze = mix(1.0, cos(radians(el)), smoothstep(45.0, 80.0, el));
  vec2 p = vec2(az * squeeze, el);
  float t = uTime;
  // The night: dark navy, a little lighter toward the hills.
  vec3 c = mix(HORIZON, ZENITH, smoothstep(-2.0, 55.0, el));
  if (el > -3.0) {
    // Loose brush dashes, as in the reference: teal commas with a dark rim on the near-black sky, denser in the
    // swirls, white and cream in the pale wind band above the hills, sparse elsewhere.
    float sw = max(exp(-dot(p - C1, p - C1) / 140.0), 0.8 * exp(-dot(p - C2, p - C2) / 55.0));
    float bd = (el - (15.0 + 0.16 * az + 3.5 * sin(az * 0.06))) / 5.0;
    float band = exp(-bd * bd) * smoothstep(-60.0, -20.0, az) * (1.0 - smoothstep(55.0, 80.0, az));
    float density = (0.3 + 0.5 * sw + 0.45 * band) * smoothstep(-3.0, 4.0, el);
    vec4 dsh = dash(flow(p), t, density);
    // Behind you the azimuth wraps from +180 to -180: blend with the dashes a turn away, so there's no seam.
    float wrap = smoothstep(150.0, 180.0, abs(az));
    if (wrap > 0.0) dsh = mix(dsh, dash(flow(p - vec2(360.0 * squeeze * sign(az), 0.0)), t, density), wrap * 0.5);
    vec3 body = mix(TEAL, LIGHT, step(0.55, dsh.z));
    body = mix(body, mix(WHITE, CREAM, step(0.5, dsh.z)), band * step(0.35, dsh.w * 2.0 + 0.1));
    c = mix(c, EDGE, dsh.x * 0.9);
    c = mix(c, body, dsh.y);
    // Stars: the nearest one, a glowing yellow core outlined in navy, ringed with crisp strokes that swell on the beat.
    float best = 1e3; vec3 star = vec3(0.0);
    for (int i = 0; i < NSTARS; i++) { float dd = length(p - STARS[i].xy) / STARS[i].z; if (dd < best) { best = dd; star = STARS[i]; } }
    if (best < 2.4) {
      // A soft glowing blob (yellow-white, no hard edge), ringed with short dashes: cream and yellow near it, teal
      // further out. Dash cells go round in whole numbers per turn, so the angle's wrap leaves no seam.
      vec2 sd = (p - star.xy) / star.z; float rr = length(sd);
      float turn = atan(sd.y, sd.x) / 6.28318 + t * 0.03;
      float swell = 1.0 + 0.4 * uPulse;
      for (int k = 0; k < 2; k++) {
        float R = (k == 0 ? 0.95 : 1.55) * swell, n = k == 0 ? 9.0 : 14.0;
        float cellA = fract(turn * n + float(k) * 0.37);
        float on = step(0.3, hash2(vec2(floor(turn * n + float(k) * 0.37), float(k) + star.x)));
        float dashK = sin(3.14159 * clamp(cellA / 0.7, 0.0, 1.0)) * step(cellA, 0.7);
        float dd = abs(rr - R) - 0.1 * dashK;
        float aa = fwidth(dd) * 1.3;
        float cov = (1.0 - smoothstep(-aa, aa, dd)) * on;
        c = mix(c, k == 0 ? mix(CREAM, YELLOW, step(0.5, hash2(vec2(cellA, star.y)))) : TEAL, cov);
      }
      c += YELLOW * (0.9 * exp(-rr * rr * 7.0) + 0.25 * exp(-rr * rr * 1.4)) * (1.0 + 2.5 * uPulse);
      c = mix(c, WHITE, exp(-rr * rr * 30.0) * 0.8);
    }
    // Faint stars round the rest of the sky (on the plain azimuth, 40 cells of 9 degrees per turn: they wrap exactly).
    vec2 ga = vec2(mod(az + 180.0, 360.0), el), gi = floor(ga / 9.0);
    vec2 gc = (gi + 0.2 + 0.6 * vec2(hash2(gi), hash2(gi + 7.1))) * 9.0;
    if ((abs(az) > 58.0 || el > 58.0) && el < 76.0 && hash2(gi + 3.3) > 0.5) {
      c = mix(c, CREAM, 1.0 - smoothstep(0.25, 0.45, length(ga - gc)));
    }
    // The crescent moon high on the right: a bold yellow crescent on a pale disc, outlined, ringed with strokes.
    vec2 md = p - MOON; float mr = length(md);
    if (mr < 14.0) {
      float turn = atan(md.y, md.x) / 6.28318 + t * 0.02, swell = 1.0 + 0.25 * uPulse;
      for (int k = 0; k < 2; k++) {
        float R = (k == 0 ? 7.0 : 10.5) * swell, n = k == 0 ? 16.0 : 22.0;
        float cellA = fract(turn * n + float(k) * 0.41);
        float on = step(0.25, hash2(vec2(floor(turn * n + float(k) * 0.41), float(k) + 5.0)));
        float dashK = sin(3.14159 * clamp(cellA / 0.72, 0.0, 1.0)) * step(cellA, 0.72);
        float dd = abs(mr - R) - 0.7 * dashK;
        float aa = fwidth(dd) * 1.3;
        c = mix(c, k == 0 ? CREAM : TEAL, (1.0 - smoothstep(-aa, aa, dd)) * on);
      }
      c += YELLOW * (0.5 * exp(-mr * mr * 0.035) + 0.2 * exp(-mr * mr * 0.008)) * (1.0 + 2.0 * uPulse);
      float edge = fwidth(mr);
      float disc = 1.0 - smoothstep(4.5 - edge, 4.5, mr);
      float bite = 1.0 - smoothstep(4.0 - edge, 4.0, length(md - vec2(-2.0, 1.6)));
      c = mix(c, MOONPALE, disc);
      c = mix(c, YELLOW, disc * (1.0 - bite));
    }
  }
  c *= 0.93 + 0.14 * hash2(floor(d.xz * 900.0) + floor(d.y * 900.0)); // a faint paper grain, as on the reference
  gl_FragColor = vec4(c * uFade, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new SphereGeometry(60, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

// ---------------------------------------------------------------- the land

const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const rad = (d: number) => (d * Math.PI) / 180;
const at = (azDeg: number, r: number) => ({ x: Math.sin(rad(azDeg)) * r, z: -Math.cos(rad(azDeg)) * r });

/**
 * Ground height (y, metres): the meadow round the seat, falling away ahead toward the far village, rising a little
 * behind and to the sides. Exported for the layout tests.
 */
export function groundY(x: number, z: number): number {
  const r = Math.hypot(x, z), ahead = Math.max(0, -z / (r || 1)); // 1 straight ahead, 0 at the sides and behind
  const drop = 3.6 * smooth(7, 26, r) * ahead ** 1.5;
  const rise = 1.1 * smooth(12, 30, r) * (1 - ahead);
  return -0.6 - drop + rise + 0.18 * Math.sin(x * 0.45) * Math.sin(z * 0.38);
}

export interface House { x: number; z: number; yaw: number; w: number; d: number; h: number; roof: number; lit: number; chimney: boolean }
let seed = 1808;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Turned to face the seat (local +z toward the origin). */
const faceSeat = (x: number, z: number) => Math.atan2(-x, -z);

/**
 * The cottages close round you (azimuth, distance): left, right and behind, spaced so none overlap, and none within 35
 * degrees of straight ahead, where the score and the instruments are.
 */
const RING: [number, number][] = [
  [-60, 9.2], [-78, 12.6], [-98, 9.0], [-122, 12.4], [-146, 9.2], [-164, 13.2], [-66, 16.0],
  [56, 9.2], [76, 12.8], [98, 8.8], [122, 12.2], [146, 9.4], [164, 13.4], [180, 10.0],
];
export const COTTAGES: House[] = RING.map(([azDeg, r]) => {
  const { x, z } = at(azDeg, r);
  return {
    x, z, yaw: faceSeat(x, z) + (rnd() - 0.5) * 0.4, w: 2.4 + rnd() * 1.3, d: 2.0 + rnd() * 1.0, h: 2.0 + rnd() * 0.9,
    roof: 1.0 + rnd() * 0.7, lit: rnd() < 0.8 ? 1 + Math.round(rnd()) : 0, chimney: rnd() < 0.45,
  };
});
/** The far village beyond the open view: a few small cottages round the church. */
export const FAR_COTTAGES: House[] = ([[-6, 23], [3, 28], [16, 22], [21, 27], [-2, 31]] as [number, number][]).map(([azDeg, r]) => {
  const { x, z } = at(azDeg, r);
  return { x, z, yaw: faceSeat(x, z), w: 2.2, d: 2.0, h: 1.9, roof: 1.1, lit: 1, chimney: false };
});
/** The church ahead and a little right, its tall thin spire the focal point of the open view. */
export const CHURCH = { ...at(8, 24.5), w: 5.5, d: 3.2, h: 3.6, roof: 1.6, tower: 1.7, towerH: 6.5, spire: 7.5 };
/** The cypress, tall on your left, between the cottages. */
export const CYPRESS = { ...at(-36, 9.0), height: 9.6, radius: 1.15 };

type V3 = [number, number, number];
type Opt = { glow?: number; hull?: number; kind?: number; uv?: [number, number][] };

/**
 * Collects toon geometry: flat-shaded triangles with a colour, an emissive flag, an outline (hull) flag, a face UV and a
 * kind (0 building: faces edged in dark lines; 1 hill strip whose ridge is outlined in the shader; 2 plain toon). Triangles are counter-clockwise seen from the front.
 */
class Toon {
  pos: number[] = []; nrm: number[] = []; tint: number[] = []; glow: number[] = []; hull: number[] = []; uv: number[] = []; kind: number[] = [];
  get count() { return this.pos.length / 3; }
  tri(a: V3, b: V3, c: V3, col: Color, o: Opt = {}) {
    const n = new Vector3(...b).sub(new Vector3(...a)).cross(new Vector3(...c).sub(new Vector3(...a))).normalize();
    const uvs = o.uv ?? [[0, 0], [1, 0], [0, 1]];
    [a, b, c].forEach((p, i) => {
      this.pos.push(...p); this.nrm.push(n.x, n.y, n.z); this.tint.push(col.r, col.g, col.b);
      this.glow.push(o.glow ?? 0); this.hull.push(o.hull ?? 0); this.kind.push(o.kind ?? 0); this.uv.push(...uvs[i]);
    });
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: Color, o: Opt = {}) {
    const uv = o.uv ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.tri(a, b, c, col, { ...o, uv: [uv[0], uv[1], uv[2]] });
    this.tri(a, c, d, col, { ...o, uv: [uv[0], uv[2], uv[3]] });
  }
  /**
   * The outline: the triangles added since `from`, again, moved out by `grow` and wound the other way, so only the
   * rim that sticks out past the shape shows (an inverted hull).
   */
  hullOf(from: number, grow: (p: V3) => V3) {
    const end = this.count, ink = new Color(COL.outline);
    for (let v = from; v < end; v += 3) {
      const p = [0, 1, 2].map((k) => grow([this.pos[(v + k) * 3], this.pos[(v + k) * 3 + 1], this.pos[(v + k) * 3 + 2]]));
      this.tri(p[0], p[2], p[1], ink, { hull: 1 });
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('tint', new Float32BufferAttribute(this.tint, 3));
    g.setAttribute('glow', new Float32BufferAttribute(this.glow, 1));
    g.setAttribute('hull', new Float32BufferAttribute(this.hull, 1));
    g.setAttribute('faceUv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('kind', new Float32BufferAttribute(this.kind, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const C = (hex: string) => new Color(hex);
const WALLS = [C('#A9BDBC'), C('#B8CBCA'), C('#9DB3B3')], ROOF = C('#6E9095'), DOOR = C('#2C5C66'), WINDOW = C('#FFD36A');
const DARK_WINDOW = C('#24505A'), CHIMNEY = C('#8AA6A8');

/** Grows a shape about a centre by a fixed margin (metres), so its outline is the same width all round. */
const growAbout = (m: V3, margin: number, squashY = 1) => (p: V3): V3 => {
  const d = new Vector3(p[0] - m[0], (p[1] - m[1]) * squashY, p[2] - m[2]), l = d.length() || 1;
  return [p[0] + (d.x / l) * margin, p[1] + (d.y / l) * margin, p[2] + (d.z / l) * margin];
};

/**
 * A cottage: walls with gable ends, a pitched roof with eaves, a door and windows on the front (the side toward the
 * seat), a chimney on some; then its outline.
 */
function cottage(t: Toon, h: House) {
  const from = t.count;
  const base = groundY(h.x, h.z) - 0.15;
  const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
  // Local frame: x across the front, z toward the seat (the front face at +d/2), y up; right-handed.
  const P = (lx: number, ly: number, lz: number): V3 => [h.x + lx * cs + lz * sn, base + ly, h.z - lx * sn + lz * cs];
  const hw = h.w / 2, hd = h.d / 2, top = h.h, ridge = h.h + h.roof;
  const wall = WALLS[(((Math.round(h.x * 13 + h.z * 7)) % 3) + 3) % 3];
  t.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, top, hd), P(-hw, top, hd), wall);                 // front
  t.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, top, -hd), P(hw, top, -hd), wall);             // back
  t.quad(P(hw, 0, hd), P(hw, 0, -hd), P(hw, top, -hd), P(hw, top, hd), wall);                 // right end
  t.quad(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, top, hd), P(-hw, top, -hd), wall);             // left end
  t.tri(P(hw, top, hd), P(hw, top, -hd), P(hw, ridge, 0), wall);                              // the gables
  t.tri(P(-hw, top, -hd), P(-hw, top, hd), P(-hw, ridge, 0), wall);
  const e = 0.25; // eaves
  t.quad(P(-hw - e, top - 0.05, hd + e), P(hw + e, top - 0.05, hd + e), P(hw + e, ridge, 0), P(-hw - e, ridge, 0), ROOF);
  t.quad(P(hw + e, top - 0.05, -hd - e), P(-hw - e, top - 0.05, -hd - e), P(-hw - e, ridge, 0), P(hw + e, ridge, 0), ROOF);
  if (h.chimney) {
    const cx = hw * 0.45, cz = -hd * 0.35, y0 = top + h.roof * 0.4, y1 = ridge + 0.55, s = 0.22;
    t.quad(P(cx - s, y0, cz + s), P(cx + s, y0, cz + s), P(cx + s, y1, cz + s), P(cx - s, y1, cz + s), CHIMNEY);
    t.quad(P(cx + s, y0, cz - s), P(cx - s, y0, cz - s), P(cx - s, y1, cz - s), P(cx + s, y1, cz - s), CHIMNEY);
    t.quad(P(cx + s, y0, cz + s), P(cx + s, y0, cz - s), P(cx + s, y1, cz - s), P(cx + s, y1, cz + s), CHIMNEY);
    t.quad(P(cx - s, y0, cz - s), P(cx - s, y0, cz + s), P(cx - s, y1, cz + s), P(cx - s, y1, cz - s), CHIMNEY);
  }
  // The outline: the cottage grown 4 cm all round from its middle (doors and windows are added after, so they get none).
  t.hullOf(from, growAbout(P(0, ridge * 0.45, 0), 0.035, 0.8));
  // Door and windows sit a hair in front of the wall.
  const f = hd + 0.02;
  t.quad(P(-0.35, 0, f), P(0.35, 0, f), P(0.35, 1.35, f), P(-0.35, 1.35, f), DOOR);
  [-hw * 0.55, hw * 0.55].forEach((wx, i) => {
    const lit = i < h.lit;
    t.quad(P(wx - 0.28, 1.05, f), P(wx + 0.28, 1.05, f), P(wx + 0.28, 1.65, f), P(wx - 0.28, 1.65, f), lit ? WINDOW : DARK_WINDOW, { glow: lit ? 1 : 0 });
  });
}

/** The church: a nave (a big cottage), a square tower and a tall thin spire with one warm window; each outlined. */
function church(t: Toon) {
  const ch = CHURCH, yaw = faceSeat(ch.x, ch.z);
  cottage(t, { x: ch.x, z: ch.z, yaw, w: ch.w, d: ch.d, h: ch.h, roof: ch.roof, lit: 2, chimney: false });
  const from = t.count;
  const cs = Math.cos(yaw), sn = Math.sin(yaw), off = ch.w / 2 + ch.tower / 2;
  const tx = ch.x + off * cs, tz = ch.z - off * sn, base = groundY(tx, tz) - 0.2;
  const P = (lx: number, ly: number, lz: number): V3 => [tx + lx * cs + lz * sn, base + ly, tz - lx * sn + lz * cs];
  const s = ch.tower / 2, H = ch.towerH, wall = WALLS[1];
  t.quad(P(-s, 0, s), P(s, 0, s), P(s, H, s), P(-s, H, s), wall);
  t.quad(P(s, 0, -s), P(-s, 0, -s), P(-s, H, -s), P(s, H, -s), wall);
  t.quad(P(s, 0, s), P(s, 0, -s), P(s, H, -s), P(s, H, s), wall);
  t.quad(P(-s, 0, -s), P(-s, 0, s), P(-s, H, s), P(-s, H, -s), wall);
  const tip = P(0, H + ch.spire, 0);
  t.tri(P(-s, H, s), P(s, H, s), tip, ROOF);
  t.tri(P(s, H, s), P(s, H, -s), tip, ROOF);
  t.tri(P(s, H, -s), P(-s, H, -s), tip, ROOF);
  t.tri(P(-s, H, -s), P(-s, H, s), tip, ROOF);
  // The tower's outline: grown out from its axis (a thin spire keeps a visible edge without swelling).
  t.hullOf(from, (p) => {
    const dx = p[0] - tx, dz = p[2] - tz, l = Math.hypot(dx, dz) || 1;
    return [p[0] + (dx / l) * 0.07, p[1] + (p[1] - base > H + ch.spire - 0.01 ? 0.15 : 0), p[2] + (dz / l) * 0.07];
  });
  t.quad(P(-0.3, H - 2.2, s + 0.02), P(0.3, H - 2.2, s + 0.02), P(0.3, H - 1.2, s + 0.02), P(-0.3, H - 1.2, s + 0.02), WINDOW, { glow: 1 });
}

/** The cypress: a tall flame, a twisting lathe with a wavy profile, flat-shaded in dark teal-greens; then its outline. */
function cypress(t: Toon) {
  const from = t.count;
  const { x, z, height, radius } = CYPRESS, base = groundY(x, z) - 0.3;
  const LEVELS = 18, SEG = 9;
  const ring = (i: number): V3[] => {
    const v = i / LEVELS, r = i === LEVELS ? 0 : radius * Math.pow(1 - v, 0.85) * (0.82 + 0.18 * Math.sin(v * 26));
    return Array.from({ length: SEG }, (_, k) => {
      const a = (k / SEG) * Math.PI * 2 + v * 1.3; // the flame twists as it climbs
      return [x + Math.cos(a) * r, base + v * height, z + Math.sin(a) * r] as V3;
    });
  };
  const greens = [C('#123E45'), C('#0F343B'), C('#164850')];
  for (let i = 0; i < LEVELS; i++) {
    const r0 = ring(i), r1 = ring(i + 1);
    for (let k = 0; k < SEG; k++) {
      const k1 = (k + 1) % SEG;
      // Counter-clockwise seen from outside: round the ring the angle grows anticlockwise seen from above.
      t.quad(r0[k1], r0[k], r1[k], r1[k1], greens[(i + k) % greens.length], { kind: 2 });
    }
  }
  t.hullOf(from, (p) => {
    const dx = p[0] - x, dz = p[2] - z, l = Math.hypot(dx, dz) || 1;
    return [p[0] + (dx / l) * 0.07, p[1] + (p[1] - base > height * 0.99 ? 0.14 : 0), p[2] + (dz / l) * 0.07];
  });
}

/** A few round bushes between the cottages: squashed low-poly blobs, outlined. */
function bushes(t: Toon) {
  const ico = new IcosahedronGeometry(1, 1).toNonIndexed().getAttribute('position');
  const spots: [number, number, number][] = [[-79, 7.0, 0.9], [-122, 7.0, 1.0], [-160, 7.2, 0.9], [79, 7.0, 0.9], [122, 7.0, 1.0], [160, 7.2, 0.85]];
  for (const [azDeg, r, s] of spots) {
    const { x, z } = at(azDeg, r), y = groundY(x, z) + s * 0.3;
    const from = t.count, col = rnd() < 0.5 ? C('#1E5A62') : C('#246A71');
    for (let i = 0; i < ico.count; i += 3) {
      const v = [0, 1, 2].map((k): V3 => [x + ico.getX(i + k) * s, y + ico.getY(i + k) * s * 0.65, z + ico.getZ(i + k) * s]);
      t.tri(v[0], v[1], v[2], col, { kind: 2 });
    }
    t.hullOf(from, (p) => [x + (p[0] - x) * 1.09, y + (p[1] - y) * 1.09, z + (p[2] - z) * 1.09]);
  }
}

/** The meadow: a faceted ground disc out to 32 m in three teal-blues, so the facets read; its rim tucks down. */
function meadow(t: Toon) {
  const RINGS = 22, SEG = 56, R = 32;
  const pt = (i: number, k: number): V3 => {
    const a = (k / SEG) * Math.PI * 2, r = R * Math.pow(i / RINGS, 1.35), x = Math.cos(a) * r, z = Math.sin(a) * r;
    return [x, groundY(x, z) - (i === RINGS ? 1.5 : 0), z];
  };
  const greens = [C('#5C9EA1'), C('#6AAAAA'), C('#548F95')];
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = pt(i, k), b = pt(i, k + 1), c = pt(i + 1, k + 1), d = pt(i + 1, k);
      const col = greens[(i * 7 + k * 3) % greens.length];
      t.tri(a, b, c, col, { kind: 2 }); // facing up; kind 2: no drawn face edges (a grid on the ground)
      t.tri(a, c, d, col, { kind: 2 });
    }
  }
}

/** The hills: three layered strips, darkest nearest, rising to the dark peak on the right as on the canvas; each ridge
 *  carries a bold outline (drawn in the shader along the strip's top edge). */
function hills(t: Toon) {
  const layers: [number, string, (az: number) => number][] = [
    [54, '#4C939B', (az) => 8 + 2.5 * Math.sin(rad(az) * 2 + 1.5) + 9 * smooth(26, 44, az) * (1 - smooth(52, 66, az))],
    [45, '#3A7F89', (az) => 6 + 2 * Math.sin(rad(az) * 3 + 0.5) + 1.2 * Math.sin(rad(az) * 7 + 2)],
    [37, '#2B6A75', (az) => 3.2 + 1.4 * Math.sin(rad(az) * 4) + 1.0 * Math.sin(rad(az) * 9 + 1)],
  ];
  const SEG = 120, peakCol = C('#1C4F5A');
  for (const [r, hex, el] of layers) {
    const col = C(hex);
    for (let k = 0; k < SEG; k++) {
      const az0 = -180 + (k / SEG) * 360, az1 = -180 + ((k + 1) / SEG) * 360;
      const p0 = at(az0, r), p1 = at(az1, r);
      const top0 = 1.6 + r * Math.tan(rad(el(az0))), top1 = 1.6 + r * Math.tan(rad(el(az1)));
      const isPeak = r === 54 && az0 > 30 && az0 < 62;
      // Counter-clockwise seen from the seat (azimuth grows to the right).
      t.quad([p0.x, -9, p0.z], [p1.x, -9, p1.z], [p1.x, top1, p1.z], [p0.x, top0, p0.z], isPeak ? peakCol : col, { kind: 1 });
    }
  }
}

function land(): Mesh {
  const t = new Toon();
  hills(t);
  meadow(t);
  for (const h of FAR_COTTAGES) cottage(t, h);
  church(t);
  for (const h of COTTAGES) cottage(t, h);
  bushes(t);
  cypress(t);
  const mat = new ShaderMaterial({
    side: FrontSide, uniforms: { ...SEA_UNIFORMS, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
attribute vec3 tint; attribute float glow; attribute float hull; attribute vec2 faceUv; attribute float kind;
varying vec3 vN; varying vec3 vW; varying vec3 vTint; varying float vGlow; varying float vHull; varying vec2 vUv; varying float vKind;
void main() {
  vN = normal; vW = position; vTint = tint; vGlow = glow; vHull = hull; vUv = faceUv; vKind = kind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: SEA_GLSL + /* glsl */ `
uniform float uTime; uniform float uFade;
varying vec3 vN; varying vec3 vW; varying vec3 vTint; varying float vGlow; varying float vHull; varying vec2 vUv; varying float vKind;
const vec3 OUTLINE = ${glslColor(COL.outline)}, SHADOW = ${glslColor('#255E68')};
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 c;
  if (vHull > 0.5) {
    c = OUTLINE;
  } else if (vKind > 0.5 && vKind < 1.5) {
    // A hill: one flat colour and a bold dark line along its ridge, the same width on screen at any distance.
    float aa = fwidth(vUv.y);
    c = mix(vTint, OUTLINE, smoothstep(1.0 - 5.0 * aa, 1.0 - 3.0 * aa, vUv.y));
  } else {
    // Toon light from the moon, as on the reference: lit faces keep their pale colour, faces turned away fall into a
    // flat dark teal; no gradients.
    float ndl = dot(normalize(vN), SEA_L);
    c = ndl > 0.25 ? vTint : ndl > -0.15 ? mix(vTint, SHADOW, 0.45) : mix(vTint, SHADOW, 0.75);
    // Trees, bushes and the meadow (kind 2) carry light speckles, like the reference's dabbed foliage.
    if (vKind > 1.5) {
      vec3 cell = floor(vW * 6.0), f = fract(vW * 6.0) - 0.5;
      float dab = step(0.82, hash3(cell)) * (1.0 - smoothstep(0.18, 0.26, length(f.xz))); // round dabs, not squares
      c = mix(c, c * 1.32 + 0.03, dab * 0.7);
    }
    if (vKind < 0.5) {
      // Buildings: a thin dark line round each face (walls, roofs, doors, windows), constant width on screen.
      float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)), ew = fwidth(e) * 1.6;
      float inner = smoothstep(ew, ew * 2.0, e);
      c = mix(OUTLINE, c, inner);
      // Warm windows glow whatever the light, flickering a little.
      c = mix(c, vTint * (1.05 + 0.08 * sin(uTime * 2.3 + vW.x * 3.0 + vW.z)), vGlow * inner);
    }
  }
  // A light night haze with distance, so the hill layers stay apart (much lighter than the sea's water).
  float dist = length(vW - cameraPosition);
  c = mix(c, SEA_HAZE * 1.4, (1.0 - exp(-dist * 0.012)) * 0.5 * (1.0 - vGlow * 0.6));
  // A faint grain in world space (the same in both eyes), like the reference's paper texture.
  c *= 0.92 + 0.16 * hash3(floor(vW * 60.0));
  gl_FragColor = vec4(c * uFade, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(t.geometry(), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- fireflies

export const FIREFLIES = 350;

/** Fireflies over the meadow and round the cottages: warm yellow-green, mostly dark, glowing in brief blinks; brighter
 *  on the beat. */
function fireflies(): Points {
  const pos: number[] = [], seeds: number[] = [];
  for (let i = 0; i < FIREFLIES; i++) {
    const r = 2.5 + rnd() * 11.5, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x, groundY(x, z) + 0.2 + rnd() * 2.0, z);
    seeds.push(rnd());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('seed', new Float32BufferAttribute(seeds, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
uniform float uTime; uniform float uPulse; attribute float seed; varying float vA; varying vec3 vC;
void main() {
  vec3 p = position;
  float t = uTime * (0.15 + seed * 0.2) + seed * 60.0;
  p += vec3(sin(t) * 0.5, sin(t * 1.3 + seed * 5.0) * 0.25, cos(t * 0.8) * 0.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float blink = smoothstep(0.55, 1.0, sin(uTime * (0.7 + seed * 0.9) + seed * 40.0));
  vA = blink * (1.0 + 2.0 * uPulse) * exp(-length(mv.xyz) * 0.05);
  gl_PointSize = clamp((6.0 + 6.0 * fract(seed * 7.0)) / -mv.z, 1.5, 9.0);
  vC = fract(seed * 3.0) < 0.6 ? vec3(0.92, 0.95, 0.45) : vec3(1.0, 0.8, 0.35);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uFade; varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC * vA * exp(-d * d * 10.0) * uFade, 1.0);
}`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export function createStarry(): WorldParts {
  const objects: Object3D[] = [sky(), land(), fireflies()];
  const mats = objects.map((o) => (o as Mesh).material as ShaderMaterial);
  return {
    objects,
    update(t: number) { for (const m of mats) m.uniforms.uTime.value = t; },
    setFade(k: number) { for (const m of mats) m.uniforms.uFade.value = k; },
    pulse(k: number) {
      const v = Math.max(0, k);
      mats[0].uniforms.uPulse.value = v;
      mats[2].uniforms.uPulse.value = v;
    },
  };
}

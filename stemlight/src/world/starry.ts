// The Starry Night world (18 Nov, sir: "as close to the painting as you can"), after Vincent van Gogh's The Starry
// Night (1889, public domain), painted in code with no image files. The canvas is laid on the sky ahead of the seat
// (azimuth -54..+54 degrees, elevation -12..+56): the crescent moon high on the right, the eleven haloed stars where
// the painting has them, the great S-shaped swirl above the middle, the pale wind flowing right above the hills,
// the dark blue hills, and the village with its spire below them. The cypress stands on the left as a tall flame
// beside the hilltop you sit on. The swirls flow slowly and the stars' halos swell with the beat. Three draw calls
// (F17): the sky, the hilltop with the cypress (one mesh), and drifting golden motes.
import {
  AdditiveBlending, BackSide, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, type Object3D, Points,
  ShaderMaterial, SphereGeometry,
} from 'three';
import { SEA_GLSL, SEA_UNIFORMS, glslColor } from './deepsea.ts';
import type { WorldParts } from './worldList.ts';

/** The painting's own colours (read from the canvas), linear for the shaders. */
const P = {
  night: glslColor('#101C4E'), blue: glslColor('#1E3A8E'), cobalt: glslColor('#3460B6'), light: glslColor('#7AA2D8'),
  pale: glslColor('#C9DDCB'), white: glslColor('#F1F0D6'), yellow: glslColor('#F3CF45'), orange: glslColor('#E39A35'),
  halo: glslColor('#C8C96A'), hill: glslColor('#1B2C66'), hillLit: glslColor('#3A5AA6'), peak: glslColor('#0E1636'),
  roof: glslColor('#131A33'), wall: glslColor('#2A3C6C'), window: glslColor('#F5C94A'), tree: glslColor('#1A2C2A'),
};

const NOISE = /* glsl */ `
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/** Where the painting's stars sit on the sky (azimuth, elevation in degrees) and their halo radius, as on the canvas. */
const STARS: [number, number, number][] = [
  [-42.4, 52.2, 3.2], [-29.1, 53.8, 2.6], [-16.7, 53.3, 3.4], [-9.4, 51.4, 2.4], [12.0, 50.0, 4.0], [-28.5, 44.3, 3.8],
  [22.2, 40.6, 3.6], [-19.0, 33.6, 2.6], [-49.2, 25.3, 2.8], [-40.1, 23.2, 3.4], [-15.7, 19.8, 6.0],
];
const glslStars = `const int NSTARS = ${STARS.length};\nconst vec3 STARS[${STARS.length}] = vec3[](${STARS.map(([a, e, r]) => `vec3(${a.toFixed(1)}, ${e.toFixed(1)}, ${r.toFixed(1)})`).join(', ')});`;

function sky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + glslStars + /* glsl */ `
uniform float uTime; uniform float uFade; uniform float uPulse; varying vec3 vDir;
const vec3 NIGHT = ${P.night}, BLUE = ${P.blue}, COBALT = ${P.cobalt}, LIGHT = ${P.light}, PALE = ${P.pale},
  WHITE = ${P.white}, YELLOW = ${P.yellow}, ORANGE = ${P.orange}, HALO = ${P.halo}, HILL = ${P.hill},
  HILLLIT = ${P.hillLit}, PEAK = ${P.peak}, ROOF = ${P.roof}, WALL = ${P.wall}, WINDOW = ${P.window}, TREE = ${P.tree};
const float PI = 3.14159265;
// A swirl: the canvas turned round c (degrees) by up to k radians at the centre, less further out (gone past
// about 2r), so straight wind strokes wrap into a spiral there, with no seam and no point where strokes radiate.
vec2 twist(vec2 p, vec2 c, float r, float k) {
  vec2 d = p - c; float a = k * exp(-dot(d, d) / (r * r)); float cs = cos(a), sn = sin(a);
  return c + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
}
// The brush strokes: the left-to-right wind in long waves, wrapped into the great swirl and its counter-curl
// (the S above the middle) and a few eddies elsewhere, so the whole sky moves. They slide slowly along the
// wind, which turns the swirls.
float strokes(vec2 p, float t) {
  vec2 q = twist(p, vec2(3.0, 33.0), 13.0, 5.6);
  q = twist(q, vec2(19.4, 27.4), 8.0, -4.6);
  q = twist(q, vec2(-34.0, 37.0), 9.0, 2.2);
  q = twist(q, vec2(140.0, 30.0), 18.0, 3.2);
  q = twist(q, vec2(-120.0, 38.0), 16.0, -3.0);
  q.y += 2.4 * sin(q.x * 0.07 + 1.0) + 0.9 * sin(q.x * 0.19 + q.y * 0.1);
  return vnoise(vec2(q.x * 0.3 - t * 0.5, q.y * 2.0)) * 0.62 + vnoise(vec2(q.x * 0.8 - t * 0.7 + 7.0, q.y * 4.4)) * 0.38;
}
// The ridge line of the hills (elevation, degrees) along the azimuth: low on the left, rising to the dark peak on
// the right, as on the canvas; lower and gentler round the sides and behind.
float ridge(float az) {
  float front = 8.0 + 3.0 * smoothstep(-54.0, 10.0, az) + 9.0 * smoothstep(26.0, 50.0, az) * (1.0 - smoothstep(52.0, 70.0, az));
  float waves = 1.4 * sin(az * 0.09) + 0.8 * sin(az * 0.23 + 1.3);
  float behind = 4.0 + 1.5 * sin(az * 0.05 + 2.0);
  float w = smoothstep(60.0, 90.0, abs(az));
  return mix(front, behind, w) + waves;
}
void main() {
  vec3 d = normalize(vDir);
  float az = degrees(atan(d.x, -d.z));
  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
  // Canvas coordinates in degrees; near the zenith the azimuth is squeezed so the strokes don't fan out.
  vec2 p = vec2(az * mix(1.0, cos(radians(el)), smoothstep(45.0, 80.0, el)), el);
  float t = uTime;
  vec3 c;
  float hillEl = ridge(az);
  if (el > hillEl) {
    // ---- the sky ----
    float s = strokes(p, t);
    // Behind you the azimuth wraps from +180 to -180: blend with the same strokes a turn away, so there's no seam.
    float wrap = smoothstep(150.0, 180.0, abs(az));
    if (wrap > 0.0) s = mix(s, strokes(p - vec2(360.0 * sign(az), 0.0), t), wrap * 0.5);
    vec2 c1 = vec2(3.0, 33.0), c2 = vec2(19.4, 27.4);
    float w1 = exp(-pow(length(p - c1) / 11.5, 2.0));
    // Sky colour by height: night blue at the top, cobalt lower, lighter toward the hills.
    vec3 lo = mix(COBALT, BLUE, smoothstep(10.0, 34.0, el));
    vec3 hi = mix(LIGHT, COBALT, smoothstep(14.0, 44.0, el));
    lo = mix(lo, NIGHT, smoothstep(40.0, 70.0, el) * 0.8);
    c = mix(lo, hi, smoothstep(0.38, 0.7, s));
    // The swirls are lighter, ringed with pale strokes.
    float swirl = max(w1, exp(-pow(length(p - c2) / 7.0, 2.0)) * 0.8);
    c = mix(c, mix(LIGHT, PALE, smoothstep(0.5, 0.8, s)), swirl * 0.75);
    // The pale wind above the hills: a band of cream and turquoise strokes flowing right, rising toward the moon.
    float band = exp(-pow((el - (15.0 + 0.16 * az + 3.5 * sin(az * 0.06))) / 5.0, 2.0)) * smoothstep(-60.0, -20.0, az) * (1.0 - smoothstep(55.0, 80.0, az));
    c = mix(c, mix(PALE, WHITE, smoothstep(0.55, 0.85, s)), band * smoothstep(0.35, 0.6, s) * 0.85);
    // Stars: the nearest one's halo (rings of yellow and cream strokes), with a bright core; halos swell on the beat.
    float best = 1e3; vec3 star = vec3(0.0);
    for (int i = 0; i < NSTARS; i++) { float dd = length(p - STARS[i].xy) / STARS[i].z; if (dd < best) { best = dd; star = STARS[i]; } }
    // Faint stars all round the rest of the sky, so looking away from the canvas there are stars too.
    vec2 g = floor(p / 9.0); vec2 gc = (g + 0.2 + 0.6 * vec2(hash2(g), hash2(g + 7.1))) * 9.0;
    float extra = (abs(az) > 58.0 || el > 58.0) && hash2(g + 3.3) > 0.55 ? length(p - gc) / 1.8 : 1e3;
    if (best < 2.6) {
      // A halo of loose concentric strokes, cream and yellow over the blue, wobbling (no atan: no seam).
      vec2 sd = p - star.xy; float rr = length(sd) / star.z;
      float wob = vnoise(sd * (1.6 / star.z) + vec2(t * 0.08, 0.0)) - 0.5;
      float rings = 0.5 + 0.5 * cos((rr + wob * 0.35) * 7.0 - t * 0.6);
      vec3 halo = mix(LIGHT, mix(PALE, YELLOW, 0.55 + 0.35 * rings), 0.35 + 0.65 * rings);
      float k = (1.0 - smoothstep(0.5, 2.5, rr)) * (0.65 + 2.2 * uPulse);
      c = mix(c, halo, clamp(k, 0.0, 0.92));
      c = mix(c, mix(WHITE, YELLOW, smoothstep(0.05, 0.4, rr)), 1.0 - smoothstep(0.28, 0.5, rr));
    } else if (extra < 1.0) {
      c = mix(c, mix(YELLOW, WHITE, 0.4), (1.0 - smoothstep(0.15, 1.0, extra)) * 0.8);
    }
    // The crescent moon high on the right, in a wide halo of yellow and green-gold rings.
    vec2 md = p - vec2(44.0, 44.3); float mr = length(md);
    if (mr < 13.0) {
      float ring = 0.5 + 0.5 * cos(mr * 1.3 - t * 0.5 + (vnoise(md * 0.45 + vec2(0.0, t * 0.05)) - 0.5) * 2.4);
      c = mix(c, mix(HALO, YELLOW, ring), (1.0 - smoothstep(4.0, 13.0, mr)) * (0.85 + 1.5 * uPulse));
      float disc = 1.0 - smoothstep(4.0, 4.6, mr);
      float bite = 1.0 - smoothstep(3.6, 4.2, length(md - vec2(-1.9, 1.5)));
      float crescent = disc * (1.0 - bite);
      // The lit crescent burns orange-yellow; the rest of the disc is a paler green-gold, as on the canvas.
      c = mix(c, mix(HALO, YELLOW, 0.35) * 0.95, disc * bite * 0.85);
      c = mix(c, mix(YELLOW * 1.08, ORANGE, smoothstep(1.5, 4.4, mr)), crescent);
    }
  } else {
    // ---- the land: hills, and in front of you the village with its spire ----
    float depth = hillEl - el;
    float s = vnoise(vec2(az * 0.55 + el * 0.4, el * 2.6)) * 0.65 + vnoise(vec2(az * 1.3 - el * 0.9, el * 5.0 + 2.0)) * 0.35;
    c = mix(HILL, HILLLIT, smoothstep(0.45, 0.8, s) * (1.0 - smoothstep(0.0, 6.0, depth)) * 0.9);
    c = mix(c, PEAK, smoothstep(40.0, 52.0, az) * (1.0 - smoothstep(58.0, 72.0, az)) * (1.0 - smoothstep(0.0, 9.0, depth)) * 0.85);
    // The village: below the ridge ahead and to the right, in the valley: low houses in uneven rows, blue walls
    // and dark roofs, a few lit windows, dark round trees between them, all in loose strokes.
    float vz = smoothstep(-24.0, -12.0, az) * (1.0 - smoothstep(50.0, 60.0, az));
    float vTop = hillEl - 3.5;
    if (vz > 0.0 && el < vTop && el > -11.0) {
      float row = floor(el / 1.7);
      vec2 cell = vec2(az / (2.4 + 1.2 * hash2(vec2(row, 3.0))) + hash2(vec2(row, 1.0)) * 7.0, el / 1.7);
      vec2 id = floor(cell), fc = fract(cell);
      float h = hash2(id);
      float houseW = 0.55 + 0.35 * hash2(id + 2.0), wallTop = 0.55 + 0.2 * hash2(id + 4.0);
      float inHouse = step(h, 0.5) * step(abs(fc.x - 0.5), houseW * 0.5) * step(fc.y, wallTop + 0.25);
      float roofK = step(wallTop, fc.y) * step(fc.y - wallTop, 0.25 - abs(fc.x - 0.5) * 0.5);
      float tree = step(0.72, h) * (1.0 - smoothstep(0.32, 0.42, length(fc - vec2(0.5, 0.45))));
      float sv = vnoise(vec2(az * 2.5, el * 3.0)) * 0.5 + 0.75;
      vec3 v = c * 0.8;
      v = mix(v, WALL * sv, inHouse * step(fc.y, wallTop));
      v = mix(v, ROOF * sv, inHouse * roofK);
      v = mix(v, TREE * sv, tree);
      float win = inHouse * step(fc.y, wallTop) * step(abs(fc.x - 0.45 + 0.1 * hash2(id + 6.0)), 0.07) * step(abs(fc.y - wallTop * 0.5), 0.09) * step(0.55, hash2(id + 9.0));
      v = mix(v, WINDOW * (0.8 + 0.2 * sin(t * 0.6 + h * 30.0)), win);
      c = mix(c, v, vz * (1.0 - smoothstep(vTop - 1.2, vTop, el)) * smoothstep(-11.0, -8.0, el));
    }
  }
  // The church spire, just right of straight ahead: it rises from the village up past the ridge into the sky.
  float sx = abs(az - 7.0);
  if (sx < 1.0) {
    float top = mix(hillEl - 6.0, hillEl + 6.0, 1.0 - smoothstep(0.0, 1.0, sx));
    if (el < top && el > hillEl - 11.0) c = mix(c, ROOF, 1.0 - smoothstep(top - 0.25, top, el));
  }
  gl_FragColor = vec4(c * 0.82 * uFade, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new SphereGeometry(60, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

export const HILL_Y = -0.6;
/** The hilltop you sit on slopes away (metres down per square metre out), so the village shows past its edge. */
const SLOPE = 0.045, HILL_R = 7.5;

/**
 * The hilltop (painterly grass strokes, falling away so the valley shows beyond it) and the cypress, one mesh and one
 * draw call: a premultiplied-alpha material, the grass opaque fading out at the edge, the cypress a flame-shaped
 * silhouette on a quad facing the seat, standing on the slope to the left (as in the painting's foreground).
 */
function hilltop(): Mesh {
  const pos: number[] = [], kind: number[] = [], uv: number[] = [], index: number[] = [];
  // The hill: a disc of rings, sloping down with the square of the distance.
  const RINGS = 14, SEG = 48;
  for (let r = 0; r <= RINGS; r++) {
    const rad = (r / RINGS) * HILL_R;
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, HILL_Y - SLOPE * rad * rad, Math.sin(a) * rad);
      kind.push(0); uv.push(s / SEG, r / RINGS);
    }
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
    const a = r * (SEG + 1) + s, b = a + SEG + 1;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // The cypress: 5 m out at azimuth -36 degrees (left of ahead), 9.5 m tall, 2.8 m wide at its foot, facing the seat.
  const az = (-36 * Math.PI) / 180, dist = 5.0, w = 2.8, hgt = 9.5;
  const cx = Math.sin(az) * dist, cz = -Math.cos(az) * dist, foot = HILL_Y - SLOPE * dist * dist - 0.3;
  const rx = Math.cos(az), rz = Math.sin(az); // the quad's right, perpendicular to the line to the seat
  const b = pos.length / 3;
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    pos.push(cx + rx * (u - 0.5) * w, foot + v * hgt, cz + rz * (u - 0.5) * w);
    kind.push(1); uv.push(u, v);
  }
  index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('kind', new Float32BufferAttribute(kind, 1));
  g.setAttribute('uvS', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, premultipliedAlpha: true, side: DoubleSide,
    uniforms: { ...SEA_UNIFORMS, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
attribute float kind; attribute vec2 uvS; varying vec3 vW; varying float vKind; varying vec2 vUv;
void main() { vW = position; vKind = kind; vUv = uvS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + SEA_GLSL + /* glsl */ `
uniform float uTime; uniform float uFade; varying vec3 vW; varying float vKind; varying vec2 vUv;
const vec3 GRASS = ${glslColor('#1C2C3A')}, GRASS2 = ${glslColor('#2C4636')}, GRASS3 = ${glslColor('#4A6A3A')}, NIGHTBLUE = ${glslColor('#22346A')};
const vec3 BARK = ${glslColor('#14200F')}, BARK2 = ${glslColor('#2F3A1E')}, BARK3 = ${glslColor('#4C4A24')}, BLACK = ${glslColor('#070B07')};
void main() {
  if (vKind > 0.5) {
    // The cypress: a flame. Its outline narrows to a point, licked by slow wavering tongues; inside, dark green and
    // brown strokes climb and curl upward.
    float u = vUv.x - 0.5, v = vUv.y;
    float width = 0.5 * pow(1.0 - v, 0.85) * (0.78 + 0.22 * sin(v * 23.0 + uTime * 0.6) * sin(v * 9.0 - uTime * 0.35));
    float lick = 0.06 * sin(v * 40.0 + u * 8.0 - uTime * 0.9);
    float inside = width - abs(u + lick * (1.0 - v));
    float a = smoothstep(0.0, 0.02, inside) * smoothstep(0.0, 0.03, v);
    if (a <= 0.0) discard;
    // Long climbing strokes, swaying like flame, darker in the core and lit olive-brown toward the edges.
    float curl = sin(v * 11.0 - uTime * 0.45 + u * 3.0) * 0.06;
    float s = vnoise(vec2((u + curl) * 26.0, v * 7.0 - uTime * 0.2)) * 0.65 + vnoise(vec2((u - curl) * 60.0, v * 22.0)) * 0.35;
    float edge = 1.0 - smoothstep(0.0, 0.09, inside);
    vec3 c = mix(BLACK, BARK, smoothstep(0.25, 0.55, s));
    c = mix(c, BARK2, smoothstep(0.55, 0.78, s) * (0.6 + 0.4 * edge));
    c = mix(c, BARK3, smoothstep(0.82, 0.96, s) * edge);
    gl_FragColor = vec4(c * uFade, a);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= a;
    return;
  }
  float r = length(vW.xz), ang = atan(vW.z, vW.x);
  // Grass strokes flowing across the hill, combed by the same wind as the sky.
  float s = vnoise(vec2(vW.x * 1.3 + sin(vW.z * 0.6) * 0.8, vW.z * 4.0 + vW.x * 0.8)) * 0.65 + vnoise(vec2(ang * 18.0, r * 3.0 - uTime * 0.05)) * 0.35;
  vec3 c = mix(GRASS, GRASS2, smoothstep(0.35, 0.7, s));
  c = mix(c, GRASS3, smoothstep(0.78, 0.95, s) * 0.6);
  c = mix(c, NIGHTBLUE, smoothstep(2.0, ${HILL_R.toFixed(1)}, r) * 0.6);
  // Moonlight on the hill: lighter toward the moon (high on the right ahead).
  c *= 0.85 + 0.25 * max(0.0, dot(normalize(vec3(vW.x, 0.0, vW.z) + 1e-4), normalize(vec3(SEA_L.x, 0.0, SEA_L.z))));
  float a = 1.0 - smoothstep(${(HILL_R * 0.7).toFixed(2)}, ${HILL_R.toFixed(2)}, r);
  gl_FragColor = vec4(c * uFade, a);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= a;
}`,
  });
  const m = new Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

export const MOTES = 700;

/** Golden motes drifting round you in slow swirls, like the painting's stars come down; brighter on the beat. */
function motes(): Points {
  const pos: number[] = [], seed: number[] = [];
  let s = 19;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < MOTES; i++) {
    const r = 1.2 + rnd() * 6.5, a = rnd() * Math.PI * 2;
    pos.push(Math.cos(a) * r, 0.2 + rnd() * 4.5, Math.sin(a) * r);
    seed.push(rnd());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('seed', new Float32BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
uniform float uTime; uniform float uPulse; attribute float seed; varying float vA; varying vec3 vC;
void main() {
  vec3 p = position;
  // Each mote circles slowly round the seat on its own small loop, as if carried by the sky's swirls.
  float t = uTime * (0.03 + seed * 0.05) + seed * 50.0;
  float ang = atan(p.z, p.x) + t * 0.2, rad = length(p.xz) + sin(t * 1.3) * 0.3;
  p.x = cos(ang) * rad; p.z = sin(ang) * rad; p.y += sin(t * 0.9 + seed * 7.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + seed) + seed * 30.0);
  vA = (0.3 + 0.7 * fract(seed * 11.0)) * twinkle * (1.0 + 2.0 * uPulse) * exp(-length(mv.xyz) * 0.06);
  gl_PointSize = clamp((5.0 + 7.0 * fract(seed * 5.0)) / -mv.z, 1.0, 10.0);
  vC = fract(seed * 3.0) < 0.6 ? vec3(1.0, 0.82, 0.32) : vec3(0.82, 0.9, 1.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uFade; varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC * vA * exp(-d * d * 12.0) * uFade, 1.0);
}`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export function createStarry(): WorldParts {
  const objects: Object3D[] = [sky(), hilltop(), motes()];
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

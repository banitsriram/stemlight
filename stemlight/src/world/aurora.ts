// Aurora over ice (18 Nov, sir picked "an arctic night"): green-violet aurora curtains ripple overhead, over a
// frozen plain, with snow drifting. Three draw calls (F17), built like the deep sea (sky.ts): the sky sphere, the ice
// as one floor mesh, and the snow as points. Everything is painted in the shaders (no images), every shader dims with
// uFade for a world change, and the curtains, their reflection in the ice and the snow brighten on the beat.
//
// Where things sit (azimuth 0 is straight ahead, -z, positive to the right; elevation above the horizon): the score
// ribbon and the instruments fill the sky ahead up to about +25 degrees, within about 35 degrees either side, so that
// stretch stays calm, as the deep sea kept its light shafts away from straight ahead. The brightest curtain arcs high
// across the front, its lower edge 47 to 57 degrees up ahead (where AURORA_PALETTE puts the light every lit material
// shares) and sinking to about 30 degrees at the sides; a lower, brighter curtain hangs behind you on the left, and a
// fainter, higher one behind you on the right.
import {
  AdditiveBlending, BackSide, BufferGeometry, Float32BufferAttribute, Mesh, type Object3D, PlaneGeometry, Points,
  ShaderMaterial, SphereGeometry,
} from 'three';
import { SEA_GLSL, SEA_UNIFORMS, glslColor } from './deepsea.ts';
import type { WorldParts } from './worldList.ts';

/** The aurora's own colours, linear for the shaders: oxygen green at a curtain's lower edge, violet higher up. */
const GREEN = glslColor('#3CFFB0'), VIOLET = glslColor('#B45CFF');

const f = (x: number) => x.toFixed(5);
const rad = (deg: number) => (deg * Math.PI) / 180;
const TAU = Math.PI * 2;

/** One curtain, in degrees round and up the sky (azimuth 0 straight ahead, positive to the right). */
interface Curtain {
  /** Azimuth of its middle, and half its length round the sky; it fades out over the outer `fade` degrees. */
  mid: number; half: number; fade: number;
  /** Elevation of its lower edge at its middle, and how far the edge sinks toward its ends (a long arc in perspective). */
  base: number; droop: number;
  /** How far its rays reach above the lower edge (the brightest rays reach a little higher). */
  tall: number;
  gain: number;
  /** The slow sway of the lower edge: degrees, waves per turn, speed (rad/s), phase. */
  bend: [number, number, number, number];
  /** Its folds: waves per turn, how tightly they bunch the rays (0..1), speed (rad/s), phase. A fold seen edge-on glows. */
  fold: [number, number, number, number];
  /** How far the lower edge kinks at a fold, degrees. */
  kink: number;
  /** How strongly the ice reflects it: a low curtain shows in the ice at grazing angles, a high one barely. */
  mirror: number;
}

const CURTAINS: Curtain[] = [
  // High across the front, above the music.
  { mid: 0, half: 115, fade: 45, base: 52, droop: 20, tall: 24, gain: 1.0, bend: [3.5, 2, 0.045, 0.7], fold: [8, 0.72, 0.07, 1.9], kink: 2, mirror: 0.35 },
  // Low and bright behind you, on the left.
  { mid: -150, half: 85, fade: 35, base: 31, droop: 8, tall: 27, gain: 1.15, bend: [3, 3, -0.04, 2.3], fold: [11, 0.8, -0.06, 0.4], kink: 1.6, mirror: 1 },
  // Fainter and higher behind you, on the right.
  { mid: 135, half: 75, fade: 35, base: 44, droop: 10, tall: 20, gain: 0.7, bend: [3.5, 2, 0.035, 4.1], fold: [7, 0.65, 0.05, 5.2], kink: 2.2, mirror: 0.6 },
];
/** Overall brightness of the curtains (linear light) and of their reflection in the ice. */
const AURORA_GAIN = 0.14;
const MIRROR_GAIN = 0.08;
/** The ice's own colour, a dusky blue-white; the sky paints the far ice below the horizon with it too. */
const ICE = 'SEA_DEEP * 1.3 + SEA_FOAM * 0.018';
/**
 * The curtains' reflection toward this azimuth (needs m, the mirror sum): streaked toward you by the rough ice as
 * their rays would be (one 1D lookup), a little calmer straight ahead, brighter on the beat. The floor and the sky's
 * band below the horizon share it, so the reflection carries on where the floor fades out.
 */
const REFL = `mix(AU_GREEN, AU_VIOLET, 0.2) * m * (0.4 + 1.2 * auRing((az * ${f(1 / TAU)} + uTime * 0.0005) * 120.0, 120.0))
    * (1.0 - 0.25 * smoothstep(0.6, 1.0, cA)) * (1.0 + 2.0 * uPulse)`;

/** Curtain i's lower edge at this azimuth, and whether this pixel is close enough to it to be lit. */
function edgeGLSL(c: Curtain, i: number): string {
  const [ba, bk, bw, bp] = c.bend, [fk, , fw, fp] = c.fold;
  return `
      float cd${i} = cA * ${f(Math.cos(rad(c.mid)))} + sA * ${f(Math.sin(rad(c.mid)))};
      float on${i} = smoothstep(${f(Math.cos(rad(c.half)))}, ${f(Math.cos(rad(c.half - c.fade)))}, cd${i});
      float fp${i} = ${f(fk)} * az + ${f(fw)} * uTime + ${f(fp)};
      float fs${i} = sin(fp${i}), fc${i} = cos(fp${i});
      float h${i} = el - (${f(rad(c.base))} + ${f(rad(c.droop))} * (cd${i} - 1.0) + ${f(rad(ba))} * sin(${f(bk)} * az + ${f(bw)} * uTime + ${f(bp)}) + ${f(rad(c.kink))} * fc${i});
      bool in${i} = on${i} > 0.0 && h${i} > -0.08 && h${i} < ${f(rad(c.tall) * 1.15 + 0.02)};
      glow += on${i} * ${f(c.gain)} * exp(-abs(h${i}) * 5.0);`;
}

/** Curtain i's light at this pixel. The fold warps where along the sheet each azimuth looks, so rays bunch at folds. */
function lightGLSL(c: Curtain, i: number): string {
  const [fk, fq] = c.fold;
  const dir = i % 2 ? -1 : 1;
  return `
        if (in${i}) {
          float s = (az + ${f(fq / fk)} * fs${i}) * ${f(1 / TAU)};
          float r1 = auRing((s + uTime * ${f(0.0009 * dir)} + ${f(0.37 * i + 0.11)}) * 90.0, 90.0);
          float r2 = auRing((s - uTime * ${f(0.0015 * dir)} + ${f(0.61 * i + 0.29)}) * 260.0, 260.0);
          lit += auCurtain(h${i}, r1, r2, ${f(rad(c.tall))}) * (1.0 + ${f(fq)} * fc${i}) * on${i} * ${f(c.gain)};
        }`;
}

/** How much of curtain c the ice reflects toward this azimuth, flickering with its folds as the sky does. */
function mirrorGLSL(c: Curtain): string {
  const [fk, fq, fw, fp] = c.fold;
  return `
  m += smoothstep(${f(Math.cos(rad(c.half + 15)))}, ${f(Math.cos(rad(c.half - c.fade)))}, cA * ${f(Math.cos(rad(c.mid)))} + sA * ${f(Math.sin(rad(c.mid)))})
    * (1.0 + ${f(fq)} * cos(${f(fk)} * az + ${f(fw)} * uTime + ${f(fp)})) * ${f(c.mirror)};`;
}

const HASH = /* glsl */ `
// Hashes without sine (after Dave Hoskins): steady for the large cell numbers the stars and the drifting rays reach,
// where sin() loses precision on mobile GPUs.
float auHash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float auHash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec4 auHash42(vec2 p) { vec4 q = fract(p.xyxy * vec4(0.1031, 0.1030, 0.0973, 0.1099)); q += dot(q, q.wzxy + 33.33); return fract((q.xxyz + q.yzzw) * q.zywx); }
// Value noise round the sky: x wraps every n cells, so there is no seam behind you.
float auRing(float x, float n) {
  float i = floor(x), f = x - i;
  return mix(auHash11(mod(i, n)), auHash11(mod(i + 1.0, n)), f * f * (3.0 - 2.0 * f));
}`;

/**
 * The night sky: the gradient, the stars, the aurora curtains, and the far ice below the horizon. At most two
 * value-noise lookups per pixel (2D, four hashes each), and those only where a curtain is; the rays and the
 * reflection streaks come from 1D hashes, the stars from one hash per pixel, and everything else from sines.
 */
function sky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false,
    uniforms: { ...SEA_UNIFORMS, uTime: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: HASH + SEA_GLSL + /* glsl */ `
uniform float uTime; uniform float uFade; uniform float uPulse; varying vec3 vDir;
const vec3 AU_GREEN = ${GREEN}, AU_VIOLET = ${VIOLET};
const float AU_TAU = 6.2831853;
// Value noise on a cylinder round the sky: x wraps every n cells, y runs free (elevation or time).
float auCyl(vec2 p, float n) {
  vec2 i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, n), x1 = mod(i.x + 1.0, n);
  return mix(mix(auHash12(vec2(x0, i.y)), auHash12(vec2(x1, i.y)), f.x),
             mix(auHash12(vec2(x0, i.y + 1.0)), auHash12(vec2(x1, i.y + 1.0)), f.x), f.y);
}
// One curtain's light at height h (radians) above its lower edge: the sharp bright green edge, fine rays rising from
// it (r1, r2: the ray pattern at two scales, 0..1), turning violet as they fade upward.
vec3 auCurtain(float h, float r1, float r2, float tall) {
  float hh = max(h, 0.0);
  float rays = smoothstep(0.15, 0.9, 0.55 * r1 + 0.45 * r2);
  float top = tall * (0.55 + 0.6 * r1);
  float k = exp(min(h, 0.0) / 0.012) * mix(0.3, 1.0, exp(-hh / 0.09)) * (1.0 - smoothstep(top * 0.45, top, hh));
  k *= mix(1.0, rays, mix(0.45, 0.85, smoothstep(0.0, 0.2, hh)));
  // Violet is about a third as bright to the eye as the green at the same strength, so it is lifted to show.
  return mix(AU_GREEN, AU_VIOLET * 1.5, smoothstep(0.02, 0.24, hh)) * k;
}
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);            // 0 straight ahead (-z), positive to the right
  float rxz = max(length(d.xz), 1e-4);   // cos(el)
  float sA = d.x / rxz, cA = -d.z / rxz; // sin and cos of the azimuth
  // Deep teal-navy at the horizon, near-black navy overhead, and a faint glow along the horizon. Below it lies the far
  // ice, nine tenths lost in the haze, as the floor looks where it fades out (24 to 40 m), so there is no seam.
  vec3 night = mix(SEA_HAZE, SEA_ABYSS * 0.85, smoothstep(0.0, 1.1, el));
  vec3 c = mix(SEA_HAZE * 0.9 + (${ICE}) * 0.1, night, smoothstep(-0.02, 0.0, el))
    + SEA_SHALLOWS * 0.09 * (el > 0.0 ? exp(-el / 0.05) : exp(el / 0.025));
  if (el < 0.0 && el > -0.08) {
    // The curtains' soft reflection in the far ice, carrying the floor's on to the horizon (below this band the
    // floor is opaque, so nothing is computed there).
    float m = 0.0;
${CURTAINS.map(mirrorGLSL).join('')}
    c += ${REFL} * ${f(MIRROR_GAIN * 0.4)} * (1.0 - smoothstep(-0.025, 0.0, el));
  }
  if (el > 0.0) {
    // Stars: one chance per cell of a grid laid in rings of elevation, each ring cut into about-square cells, so they
    // spread evenly with no pattern; each star's disc sits wholly inside its cell, so none is ever cut in half. They
    // twinkle slowly and dim toward the horizon.
    const float CELL = 0.014;
    float row = floor(el / CELL);
    float n = max(floor(AU_TAU * cos((row + 0.5) * CELL) / CELL), 1.0);
    float x = (az / AU_TAU + 0.5) * n, col = floor(x);
    vec4 hs = auHash42(vec2(mod(col, n), row));
    if (hs.x > 0.945) {
      vec2 off = vec2((x - col - 0.17 - 0.66 * hs.y) * AU_TAU / n * rxz, (el / CELL - row - 0.17 - 0.66 * hs.z) * CELL);
      float k = 1.0 - min(length(off) / mix(0.001, 0.0022, hs.w * hs.w), 1.0);
      float twinkle = 0.6 + 0.4 * sin(uTime * (0.4 + 0.9 * fract(hs.y * 7.0)) + hs.z * AU_TAU);
      vec3 tint = fract(hs.w * 13.0) > 0.8 ? vec3(1.0, 0.86, 0.68) : vec3(0.75, 0.86, 1.0);
      c += tint * (k * k * (3.0 - 2.0 * k)) * (0.045 + 0.55 * pow(hs.w, 4.0)) * twinkle * smoothstep(0.02, 0.25, el);
    }
    // Aurora curtains, only in the band of sky they can reach (16 to 84 degrees up).
    if (el > 0.28 && el < 1.47) {
      float glow = 0.0;
${CURTAINS.map(edgeGLSL).join('')}
      // The curtains light the air round them faintly; that fades in above 16 degrees, so the band has no edge.
      vec3 au = AU_GREEN * glow * 0.05 * smoothstep(0.28, 0.42, el);
      if (${CURTAINS.map((_, i) => `in${i}`).join(' || ')}) {
        vec3 lit = vec3(0.0);
${CURTAINS.map(lightGLSL).join('')}
        // The two value-noise lookups: which stretches of the curtains burn brightest (changing over about twenty
        // seconds), and brightness drifting slowly up the rays.
        float patches = auCyl(vec2(az * ${f(9 / TAU)}, uTime * 0.05), 9.0);
        float drift = auCyl(vec2(az * ${f(24 / TAU)}, el * 5.0 - uTime * 0.12), 24.0);
        au += lit * (0.4 + 1.2 * patches) * (0.7 + 0.6 * drift);
      }
      // A little calmer straight ahead, above the music; brighter on the beat; gone before the zenith, where the rays
      // would converge too finely to draw.
      c += au * ${f(AURORA_GAIN)} * (1.0 - 0.25 * smoothstep(0.6, 1.0, cA)) * (1.0 + 2.0 * uPulse) * (1.0 - smoothstep(1.26, 1.47, el));
    }
  }
  gl_FragColor = vec4(c * uFade, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new SphereGeometry(60, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

/**
 * The ice lies where the deep sea's seabed does (sky.ts FLOOR_Y), 1.8 m below a seated player's eye. It is repeated
 * here because sky.ts imports without file extensions, which the node unit tests cannot load.
 */
export const FLOOR_Y = -0.6;

/**
 * The frozen plain, one mesh: smooth ice, wind-carved snow ridges and faint cracks from sines (no noise lookups: the
 * floor fills half the view), a soft reflection of the curtains, and the haze closing in with distance. It fades
 * out from 24 to 40 m into the sky's own haze below the horizon.
 */
function ice(): Mesh {
  const g = new PlaneGeometry(80, 80).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, 0);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, premultipliedAlpha: true,
    uniforms: { ...SEA_UNIFORMS, uTime: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: `varying vec3 vW; void main() { vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: HASH + SEA_GLSL + /* glsl */ `
uniform float uTime; uniform float uFade; uniform float uPulse; varying vec3 vW;
const vec3 AU_GREEN = ${GREEN}, AU_VIOLET = ${VIOLET};
void main() {
  vec3 toEye = cameraPosition - vW;
  float dist = length(toEye);
  vec3 v = toEye / dist;
  float r = length(vW.xz);
  // The frozen plain: smooth ice, a dusky blue-white under the night sky. In patches the wind has carved the snow into
  // long ridges (sastrugi) running with it, shaded by their slope toward the light (SEA_L) so they read as relief;
  // between the patches it has swept the ice bare.
  float along = dot(vW.xz, vec2(0.8, 0.6)), across = dot(vW.xz, vec2(-0.6, 0.8));
  float q = along * 0.9 + across * 0.4;
  float ph = across * 2.1 + 1.8 * sin(along * 0.33) + 0.5 * sin(q);
  // The ice round the seat stays smooth; the ridges begin a few metres out.
  float snow = (0.5 + 0.5 * sin(along * 0.12 + 1.3) * sin(across * 0.21 - 0.4)) * smoothstep(2.5, 7.0, r);
  float cph = cos(ph) * snow;
  float dAcross = cph * (2.1 + 0.2 * cos(q)), dAlong = cph * (0.594 * cos(along * 0.33) + 0.45 * cos(q));
  vec2 slope = vec2(0.8 * dAlong - 0.6 * dAcross, 0.6 * dAlong + 0.8 * dAcross); // the ridges' slope along x and z
  float relief = 1.0 - 0.22 * dot(slope, SEA_L.xz) / max(SEA_L.y, 0.3);
  float crest = (0.5 + 0.5 * sin(ph)) * snow;
  vec3 c = (${ICE}) * relief * (0.88 + 0.25 * crest) + SEA_FOAM * 0.01 * crest;
  // Faint pale cracks: the zero lines of two warped sines with a small jag, broken into lengths, never thinner than a
  // pixel (fwidth) and fading with distance, so they never shimmer.
  float a1 = along * 0.55 + 1.4 * sin(across * 0.47 + 0.8) + 0.2 * sin(across * 3.7 + along * 1.3);
  float a2 = across * 0.42 + 1.7 * sin(along * 0.61 + 2.1) + 0.2 * sin(along * 4.1 - across * 1.1);
  float w1 = fwidth(a1) + 0.03, w2 = fwidth(a2) + 0.03;
  float crack = max((1.0 - smoothstep(0.0, w1, abs(sin(a1)))) * 0.03 / w1 * smoothstep(0.1, 0.6, sin(across * 0.23 + along * 0.05 + 1.0)),
                    (1.0 - smoothstep(0.0, w2, abs(sin(a2)))) * 0.03 / w2 * smoothstep(0.1, 0.6, sin(along * 0.19 - across * 0.07 + 2.0)));
  c += SEA_FOAM * 0.04 * crack * (1.0 - smoothstep(5.0, 12.0, r));
  // A soft reflection of the aurora: stronger toward grazing views and toward where the curtains hang, flickering
  // with their folds and brightening with the beat as they do (REFL), and weaker on the snow crests than on bare ice.
  vec2 look = -toEye.xz; // from the eye toward this point
  float lx = length(look) + 1e-5;
  float sA = look.x / lx, cA = -look.y / lx; // sin and cos of the azimuth (0 straight ahead, positive to the right)
  float az = atan(look.x, -look.y);
  float m = 0.0;
${CURTAINS.map(mirrorGLSL).join('')}
  vec3 refl = ${REFL} * pow(1.0 - v.y, 5.0) * (1.0 - 0.5 * crest);
  float fog = seaFog(dist);
  c = mix(c, SEA_HAZE, fog) + refl * ${f(MIRROR_GAIN)} * (1.0 - 0.5 * fog);
  float a = 1.0 - smoothstep(24.0, 40.0, r);
  gl_FragColor = vec4(c * uFade, a);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= a; // premultiply after the colour conversion, as three's own materials do
}`,
  });
  const m = new Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

export const SNOWFLAKES = 900;
/** Snow falls through this many metres above the ice, then comes round again at the top. */
const FALL = 5;

function snow(): Points {
  const pos: number[] = [], seed: number[] = [];
  let s = 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < SNOWFLAKES; i++) {
    const r = 0.7 + rnd() * 6, a = rnd() * Math.PI * 2;
    pos.push(Math.cos(a) * r, FLOOR_Y + rnd() * FALL, Math.sin(a) * r);
    seed.push(rnd());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('seed', new Float32BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
uniform float uTime; uniform float uPulse; attribute float seed; varying float vA;
void main() {
  vec3 p = position;
  // Each flake sways on its own slow loop as it falls, and the whole fall leans a little with the wind.
  float sway = uTime * (0.4 + 0.5 * fract(seed * 7.0)) + seed * 40.0;
  p.xz += vec2(sin(sway), cos(sway * 0.8)) * (0.12 + 0.12 * fract(seed * 5.0)) + vec2(sin(uTime * 0.07), cos(uTime * 0.05)) * 0.4;
  // It falls 0.12 to 0.3 m a second and comes round again at the top, fading in there and out on the ice.
  float y = mod(p.y - ${f(FLOOR_Y)} - uTime * (0.12 + 0.18 * fract(seed * 3.0)), ${f(FALL)});
  p.y = y + ${f(FLOOR_Y)};
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float ends = smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(${f(FALL - 0.6)}, ${f(FALL)}, y));
  vA = (0.35 + 0.65 * fract(seed * 13.0)) * ends * (1.0 + 1.5 * uPulse) * exp(-length(mv.xyz) * 0.08);
  gl_PointSize = clamp((6.0 + 8.0 * fract(seed * 11.0)) / -mv.z, 1.5, 10.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uFade; varying float vA;
void main() {
  // A snowflake: a soft white disc, cool in the night light.
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(0.32, 0.36, 0.42) * vA * (1.0 - smoothstep(0.12, 0.5, d)) * uFade, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

/** Aurora over ice as a world (worlds.ts adds its objects to the scene and shows one world at a time). */
export function createAurora(): WorldParts {
  const objects: Object3D[] = [sky(), ice(), snow()];
  const mats = objects.map((o) => (o as Mesh).material as ShaderMaterial);
  return {
    objects,
    update(t: number) {
      for (const m of mats) m.uniforms.uTime.value = t;
    },
    setFade(k: number) {
      for (const m of mats) m.uniforms.uFade.value = k;
    },
    /** The beat swell above 1 (0 between beats, about 0.15 on a downbeat): the curtains, their reflection and the snow brighten. */
    pulse(k: number) {
      const v = Math.max(0, k);
      for (const m of mats) m.uniforms.uPulse.value = v;
    },
  };
}

// Deep water, seabed with light shafts, and plankton (PLAN s8, restyled deep-sea glass on 17 Nov): three draw
// calls together (F17). Light comes from the sunlit surface far above: a bright rippling window overhead, rays
// fanning down from it, shafts slanting through the water near you and caustics dancing on the sand.
// Plankton drift on wall-clock time, so they keep moving while the music is paused, and brighten on the beat.
import {
  AdditiveBlending, BackSide, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, Object3D, Points,
  ShaderMaterial, SphereGeometry,
} from 'three';
import { SEA_GLSL } from './deepsea';

const NOISE = /* glsl */ `
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }`;

function water(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + SEA_GLSL + /* glsl */ `
uniform float uTime; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  // Abyss below, the deep haze at eye level, lighter water rising toward the surface.
  vec3 c = mix(SEA_ABYSS, SEA_HAZE, smoothstep(-0.5, 0.02, up));
  c = mix(c, SEA_DEEP * 1.5 + SEA_SHALLOWS * 0.06, smoothstep(0.08, 0.66, up));
  float win = smoothstep(0.64, 0.7, up);
  // Rays fanning down from the window (noise on the direction round the vertical, so there is no seam);
  // only above the horizon, where they show.
  if (up > 0.02 && up < 0.7) {
    vec2 around = normalize(d.xz + vec2(1e-4));
    float rays = n3(vec3(around * 7.0, uTime * 0.05)) * 0.6 + n3(vec3(around * 19.0, uTime * 0.08 + 5.0)) * 0.4;
    c += SEA_SHALLOWS * pow(rays, 3.0) * smoothstep(0.02, 0.6, up) * (1.0 - win) * 0.3;
  }
  // The window overhead: the sunlit surface seen through it, a moving web of bright ripples, with a soft rim.
  if (up > 0.6) {
    vec2 sp = d.xz / up;
    vec3 q = vec3(sp * 6.0, uTime * 0.25);
    float n = n3(q) * 0.65 + n3(q * 2.2 + 4.0) * 0.35;
    float web = pow(1.0 - abs(n * 2.0 - 1.0), 8.0);
    vec3 surf = mix(SEA_SHALLOWS * 0.35, SEA_SURFACE * 0.6, 0.12 + 0.6 * web) * (0.6 + 0.4 * smoothstep(0.7, 1.0, up));
    float rim = exp(-abs(up - 0.67) * 40.0);
    c = mix(c, surf, win) + SEA_SHALLOWS * rim * 0.35;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new SphereGeometry(60, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

export const FLOOR_Y = -0.6;
export const SHAFTS = 7;

/**
 * The seabed and the light shafts in one mesh, one draw call: a premultiplied-alpha material draws the sand
 * nearly opaque and the shafts purely additive (alpha 0). Shafts stand 3.5 to 8 m out, facing the seat, and
 * slant toward the light.
 */
function seabed(): Mesh {
  const pos: number[] = [], kind: number[] = [], uv: number[] = [], seed: number[] = [], index: number[] = [];
  const quad = (pts: number[][], k: number, s: number) => {
    const b = pos.length / 3;
    for (const [x, y, z, u, v] of pts) { pos.push(x, y, z); uv.push(u, v); kind.push(k); seed.push(s); }
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const F = 40;
  quad([[-F, FLOOR_Y, -F, 0, 0], [F, FLOOR_Y, -F, 1, 0], [F, FLOOR_Y, F, 1, 1], [-F, FLOOR_Y, F, 0, 1]], 0, 0);
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lean = [-0.19 / 0.95, 0.24 / 0.95], top = 6.5; // toward the light (SEA_L), per metre of height
  // Round the sides and behind, never within 50 degrees of straight ahead (-z), where the music happens:
  // they frame the scene rather than wash out the ribbon and the summoned instrument.
  const ANGLES = [-40, -140, 0, 180, 35, 145, 95];
  for (let i = 0; i < SHAFTS; i++) {
    const a = (ANGLES[i] * Math.PI) / 180 + (rnd() - 0.5) * 0.2, r = 3.5 + rnd() * 4, w = 0.35 + rnd() * 0.75;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, tx = (-Math.sin(a) * w) / 2, tz = (Math.cos(a) * w) / 2;
    const h = top - FLOOR_Y, ox = lean[0] * h, oz = lean[1] * h;
    quad([[cx - tx, FLOOR_Y, cz - tz, 0, 0], [cx + tx, FLOOR_Y, cz + tz, 1, 0],
      [cx + tx + ox, top, cz + tz + oz, 1, 1], [cx - tx + ox, top, cz - tz + oz, 0, 1]], 1, rnd());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('kind', new Float32BufferAttribute(kind, 1));
  g.setAttribute('uvS', new Float32BufferAttribute(uv, 2));
  g.setAttribute('seed', new Float32BufferAttribute(seed, 1));
  g.setIndex(index);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, premultipliedAlpha: true, side: DoubleSide, uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
uniform float uTime; attribute float kind; attribute vec2 uvS; attribute float seed;
varying vec3 vW; varying float vKind; varying vec2 vUv; varying float vSeed;
void main() {
  vec3 p = position;
  // A shaft's top sways slowly as the surface moves.
  if (kind > 0.5) p.xz += vec2(sin(uTime * 0.13 + seed * 6.0), cos(uTime * 0.11 + seed * 4.0)) * 0.3 * uvS.y;
  vW = p; vKind = kind; vUv = uvS; vSeed = seed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: NOISE + SEA_GLSL + /* glsl */ `
uniform float uTime; varying vec3 vW; varying float vKind; varying vec2 vUv; varying float vSeed;
void main() {
  float dist = length(vW - cameraPosition);
  if (vKind > 0.5) {
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    across = across * across * (3.0 - 2.0 * across);
    float along = smoothstep(0.0, 0.4, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
    float streak = 0.55 + 0.45 * n3(vec3(vUv.x * 4.0 + vSeed * 9.0, vUv.y * 3.0 - uTime * 0.06, vSeed * 3.0));
    float k = across * along * streak * (0.7 + 0.3 * sin(uTime * 0.37 + vSeed * 12.0)) * (1.0 - 0.6 * seaFog(dist));
    gl_FragColor = vec4(SEA_SHALLOWS * 0.2 * k, 0.0); // alpha 0: purely additive
    #include <colorspace_fragment>
    return;
  }
  float r = length(vW.xz);
  // Dark sand in soft dunes, with ripples pressed into it (sines, no noise: the floor fills half the view).
  float dune = 0.5 + 0.25 * sin(vW.x * 0.31 + sin(vW.z * 0.23) * 2.0) + 0.25 * sin(vW.z * 0.37 - vW.x * 0.11);
  vec3 c = mix(SEA_ABYSS * 1.2, SEA_DEEP * 0.6, dune);
  c *= 0.8 + 0.3 * (0.5 + 0.5 * sin(vW.x * 4.0 + vW.z * 1.5 + 2.5 * sin(vW.z * 0.9 + vW.x * 0.4)));
  // Caustics from the surface, only near the seat where they show, and a pool of light around it.
  if (r < 9.0) {
    vec3 q = vec3(vW.xz * 1.3, uTime * 0.12);
    float n = n3(q) * 0.65 + n3(q * 2.1 + 4.0) * 0.35;
    c += SEA_SHALLOWS * pow(1.0 - abs(n * 2.0 - 1.0), 16.0) * 0.22 * (1.0 - smoothstep(1.5, 9.0, r));
  }
  c += SEA_SHALLOWS * 0.035 * (1.0 - smoothstep(0.0, 6.0, r));
  c = mix(c, SEA_HAZE, seaFog(dist));
  float a = 1.0 - smoothstep(24.0, 40.0, r);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= a; // premultiply after the colour conversion, as three's own materials do
}`,
  });
  const m = new Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

export const PLANKTON = 900;

function plankton(): Points {
  const pos: number[] = [], seed: number[] = [];
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < PLANKTON; i++) {
    const r = 0.6 + rnd() * 6, a = rnd() * Math.PI * 2;
    pos.push(Math.cos(a) * r, -0.4 + rnd() * 4, Math.sin(a) * r);
    seed.push(rnd());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('seed', new Float32BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: /* glsl */ `
uniform float uTime; uniform float uPulse; attribute float seed; varying float vA; varying vec3 vC;
void main() {
  vec3 p = position;
  float t = uTime * (0.05 + seed * 0.08) + seed * 40.0;
  p += vec3(sin(t) * 0.25, sin(t * 0.7 + seed * 9.0) * 0.15, cos(t * 0.8) * 0.25);
  // Marine snow sinks slowly and comes round again at the top, fading out and in at the ends.
  float y = mod(p.y + 0.4 - uTime * (0.01 + 0.025 * fract(seed * 3.0)), 4.0);
  p.y = y - 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float ends = smoothstep(0.0, 0.4, y) * (1.0 - smoothstep(3.5, 4.0, y));
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.5 + seed) + seed * 20.0);
  vA = (0.25 + 0.75 * fract(seed * 13.0)) * twinkle * ends * (1.0 + 2.2 * uPulse) * exp(-length(mv.xyz) * 0.05);
  gl_PointSize = clamp((4.0 + 6.0 * fract(seed * 7.0)) / -mv.z, 1.0, 9.0);
  // Mostly pale snow, some cyan sparks, a few green ones.
  float hue = fract(seed * 5.0);
  vC = hue < 0.6 ? vec3(0.62, 0.86, 0.9) : hue < 0.9 ? vec3(0.3, 0.92, 1.0) : vec3(0.35, 1.0, 0.6);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC * vA * exp(-d * d * 14.0), 1.0);
}`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export function createSky(scene: Object3D): { update(): void; pulse(k: number): void; objects: Object3D[] } {
  const objects = [water(), seabed(), plankton()];
  scene.add(...objects);
  const mats = objects.map((o) => (o as Mesh).material as ShaderMaterial);
  return {
    objects,
    update() {
      const t = performance.now() / 1000;
      for (const m of mats) m.uniforms.uTime.value = t;
    },
    /** The beat swell above 1 (0 between beats, about 0.15 on a downbeat): the plankton brighten with it. */
    pulse(k: number) { mats[2].uniforms.uPulse.value = Math.max(0, k); },
  };
}

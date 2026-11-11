// Nebula sky, ocean depth and plankton (PLAN s8): three draw calls together (F17).
// Plankton drift on wall-clock time, so they keep moving while the music is paused.
import {
  AdditiveBlending, BackSide, BufferGeometry, Float32BufferAttribute, Mesh, Object3D, PlaneGeometry, Points,
  ShaderMaterial, SphereGeometry,
} from 'three';

const NOISE = /* glsl */ `
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }`;

function nebula(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + /* glsl */ `
uniform float uTime; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = smoothstep(-0.05, 0.6, d.y);
  float gas = fbm(d * 2.2 + vec3(uTime * 0.004, 0.0, uTime * 0.003));
  float wisps = fbm(d * 5.0 - vec3(0.0, uTime * 0.006, 0.0));
  vec3 voidC = vec3(0.027, 0.024, 0.059), violet = vec3(0.165, 0.106, 0.29), teal = vec3(0.055, 0.373, 0.42);
  vec3 c = mix(voidC, violet, smoothstep(0.35, 0.8, gas) * up);
  c = mix(c, teal, smoothstep(0.55, 0.85, wisps) * up * 0.6);
  float star = step(0.9985, h(floor(d * 380.0))) * up;
  gl_FragColor = vec4(c + star * 0.7, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new SphereGeometry(60, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

function ocean(): Mesh {
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vXZ; void main() { vXZ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + /* glsl */ `
uniform float uTime; varying vec2 vXZ;
void main() {
  float r = length(vXZ);
  float caust = fbm(vec3(vXZ * 0.6, uTime * 0.05));
  vec3 c = mix(vec3(0.02, 0.05, 0.09), vec3(0.055, 0.373, 0.42), smoothstep(0.55, 0.9, caust) * 0.35);
  float a = (1.0 - smoothstep(4.0, 40.0, r)) * 0.95;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new PlaneGeometry(80, 80), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.6; // below the seat: the seabed edge falls away into deep water
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
    transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
uniform float uTime; attribute float seed; varying float vA;
void main() {
  vec3 p = position;
  float t = uTime * (0.05 + seed * 0.08) + seed * 40.0;
  p += vec3(sin(t) * 0.25, sin(t * 0.7 + seed * 9.0) * 0.15, cos(t * 0.8) * 0.25);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (0.25 + 0.75 * fract(seed * 13.0)) * (0.6 + 0.4 * sin(uTime * (0.5 + seed) + seed * 20.0));
  gl_PointSize = clamp(6.0 / -mv.z, 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(0.44, 0.95, 1.0) * vA * (1.0 - d * 2.0), 1.0);
}`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export function createSky(scene: Object3D): { update(): void; objects: Object3D[] } {
  const objects = [nebula(), ocean(), plankton()];
  scene.add(...objects);
  const mats = objects.map((o) => (o as Mesh).material as ShaderMaterial);
  return {
    objects,
    update() {
      const t = performance.now() / 1000;
      for (const m of mats) m.uniforms.uTime.value = t;
    },
  };
}

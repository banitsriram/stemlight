// Obsidian (18 Nov, banit): the black world. A black void with drifting graphite smoke and faint stars; ahead and
// high, an eclipsed black sun whose silver corona breathes with the music; underfoot, a floor of black cubes that
// ripples on the beat and wherever your hands move over it (the start page's wave grid, src/world/waveGrid.ts);
// silver dust in the air that brightens on the beat. Three draw calls (F17), like the other worlds. The corona sits
// above the ribbon and the instruments (they fill the sky ahead up to about 25 degrees), at 35 degrees up.
import { AdditiveBlending, BackSide, BufferGeometry, Float32BufferAttribute, Mesh, Points, ShaderMaterial, SphereGeometry } from 'three';
import type { Vec3 } from '../contracts';
import { OBSIDIAN_PALETTE, type WorldParts } from './worldList';
import { createWaveFloor } from './waveGrid';

/** Where the corona is: the light every lit material shares. */
const SUN_DIR = OBSIDIAN_PALETTE.light;
const FLOOR_Y = -0.5;

const NOISE = /* glsl */ `
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }`;

function sky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 }, uSun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + /* glsl */ `
uniform float uTime, uFade, uPulse; uniform vec3 uSun; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  // Graphite smoke drifting through the void, a little lighter toward the horizon.
  float smoke = fbm(d * 2.2 + vec3(uTime * 0.012, 0.0, uTime * 0.008));
  vec3 c = vec3(0.0015, 0.0016, 0.0019) + vec3(0.011, 0.012, 0.014) * smoothstep(0.5, 0.9, smoke);
  c += vec3(0.018, 0.019, 0.021) * exp(-abs(d.y) * 14.0); // a faint silver line where the floor meets the sky
  // Stars: few and small, only above the horizon.
  vec3 sp = floor(d * 160.0);
  float star = step(0.9965, h(sp)) * smoothstep(0.02, 0.2, d.y);
  c += vec3(0.75, 0.78, 0.82) * star * (0.5 + 0.5 * sin(uTime * (0.8 + h(sp + 3.0) * 2.0) + h(sp) * 40.0));
  // The eclipse: a black disc, a thin bright rim, and a silver corona with slow streamers that swell on the beat.
  float a = acos(clamp(dot(d, uSun), -1.0, 1.0));
  float disc = 0.075;
  vec3 side = normalize(cross(uSun, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(side, uSun);
  float ang = atan(dot(d, upv), dot(d, side));
  float streak = 0.55 + 0.45 * n3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * 0.05)) + 0.35 * n3(vec3(cos(ang) * 9.0, sin(ang) * 9.0, uTime * 0.09));
  float out_ = max(a - disc, 0.0);
  float corona = exp(-out_ * (16.0 - 5.0 * uPulse * 4.0)) * streak * (0.9 + 2.5 * uPulse);
  float rim = exp(-abs(a - disc) * 260.0) * (1.1 + 3.0 * uPulse);
  vec3 silver = vec3(0.86, 0.89, 0.93);
  c += silver * (corona * 0.55 + rim) * step(disc, a);
  c *= step(disc - 0.002, a) * 0.98 + 0.02; // the moon itself: black
  gl_FragColor = vec4(c * uFade, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new Mesh(new SphereGeometry(60, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

const DUST = 700;

function dust(): Points {
  const pos: number[] = [], seed: number[] = [];
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < DUST; i++) {
    const r = 0.8 + rnd() * 7, a = rnd() * Math.PI * 2;
    pos.push(Math.cos(a) * r, FLOOR_Y + 0.2 + rnd() * 4.5, Math.sin(a) * r);
    seed.push(rnd());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('seed', new Float32BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: /* glsl */ `
uniform float uTime, uPulse; attribute float seed; varying float vA;
void main() {
  vec3 p = position;
  // Rising slowly through a 4.5 m column above the floor, wrapping round to the bottom.
  p.y = ${(FLOOR_Y + 0.2).toFixed(2)} + mod(position.y - ${(FLOOR_Y + 0.2).toFixed(2)} + uTime * (0.03 + seed * 0.04), 4.5);
  p.xz += vec2(sin(uTime * 0.2 + seed * 30.0), cos(uTime * 0.17 + seed * 21.0)) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (0.25 + 0.75 * seed) * (0.55 + 3.0 * uPulse) * smoothstep(0.0, 0.5, p.y - ${FLOOR_Y.toFixed(2)}) * smoothstep(4.7, 4.0, p.y - ${FLOOR_Y.toFixed(2)});
  gl_PointSize = (2.0 + 3.0 * seed) * (1.0 + uPulse * 2.0) * 3.0 / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uFade; varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r) * vA * uFade;
  gl_FragColor = vec4(vec3(0.85, 0.88, 0.92) * a, 1.0);
}`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

/** The black world. `hands` gives the fingertips (world space) so the floor can ripple under them. */
export function createObsidian(hands: () => Vec3[] = () => []): WorldParts {
  const floor = createWaveFloor({ grid: 64, cube: 0.34, base: '#030304', high: '#4E545B', fade: '#000000', fadeFrom: 5, fadeTo: 10, beat: 1.6, glint: 0.25 });
  floor.mesh.position.y = FLOOR_Y;
  const s = sky(), d = dust();
  const mats = [s.material as ShaderMaterial, d.material as ShaderMaterial];
  const last: Vec3[] = [];
  let prevT = 0, prevPulse = 0;
  return {
    objects: [s, floor.mesh, d],
    update(t: number) {
      const dt = prevT ? Math.min(t - prevT, 0.05) : 0;
      prevT = t;
      for (const m of mats) m.uniforms.uTime.value = t;
      // Hands moving over the floor send ripples out from under them.
      hands().forEach((tip, i) => {
        const l = last[i];
        if (!l || Math.hypot(tip[0] - l[0], tip[2] - l[2]) > 0.06) {
          if (l) floor.push(tip[0], tip[2], 1);
          last[i] = [tip[0], tip[1], tip[2]];
        }
      });
      floor.update(dt);
    },
    setFade(k: number) {
      for (const m of mats) m.uniforms.uFade.value = k;
      floor.dim(k);
    },
    /** The beat swell above 1 (0 between beats, about 0.15 on a downbeat): corona, dust and crests answer it. */
    pulse(k: number) {
      const p = Math.max(0, k);
      for (const m of mats) m.uniforms.uPulse.value = p;
      floor.glint(0.25 + p * 2.5);
      // A downbeat sends a ring out across the floor ahead of you.
      if (p > 0.08 && prevPulse <= 0.08) floor.push((Math.random() - 0.5) * 4, -2 - Math.random() * 3, 1);
      prevPulse = p;
    },
  };
}

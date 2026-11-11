// Nine creature silhouettes (PLAN s8), their glide to the reach spot, and the mute / solo / envelope look.
// Each creature is two draw calls: a glowing body mesh and one LineSegments for its threads.
import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  IcosahedronGeometry, LatheGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D,
  RingGeometry, ShaderMaterial, SphereGeometry, TubeGeometry, Vector2, Vector3, CatmullRomCurve3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AppContext, Envelopes, MuteState, StemId, Vec3 } from '../contracts';

export const GLIDE_SEC = 0.6;
export const ACCENT: Record<StemId, string> = {
  vln: '#5EE6FF', vla_vc: '#2FC6B0', cb: '#3D6BFF', fl: '#C9B6FF', reeds: '#E05BD8',
  hn: '#7CF0A0', brass: '#F4F1C9', perc: '#EEF2FF', harp: '#FF8FC8',
};

/** easeInOutCubic glide from a to b; k is 0..1 of GLIDE_SEC. */
export function glideAt(a: Vec3, b: Vec3, k: number): Vec3 {
  const x = Math.min(1, Math.max(0, k));
  const e = x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
}

/** Target brightness: muted 20 %, outside a solo 25 %, otherwise 1. */
export function dimFor(stem: StemId, mute: MuteState | undefined, solo: StemId | null): number {
  if (mute === 'held' || mute === 'locked') return 0.2;
  if (solo !== null && solo !== stem) return 0.25;
  return 1;
}

// ---- silhouettes ----

type Pts = number[]; // flat x,y,z pairs for LineSegments

const lathe = (profile: [number, number][], seg = 20) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), seg);
const bell = (r: number, h: number) => lathe([[0.001, h], [r * 0.55, h * 0.92], [r * 0.9, h * 0.6], [r, h * 0.2], [r * 0.85, 0]]);
const tube = (pts: Vec3[], r: number, seg = 40) => new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), seg, r, 6);

function threads(n: number, ringR: number, len: number, wave: number, out: Pts, y0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let px = Math.cos(a) * ringR, pz = Math.sin(a) * ringR, py = y0;
    for (let s = 1; s <= 8; s++) {
      const nx = Math.cos(a) * ringR * (1 - s * 0.06) + Math.sin(s * 0.9 + i) * wave;
      const nz = Math.sin(a) * ringR * (1 - s * 0.06) + Math.cos(s * 0.8 + i) * wave;
      const ny = y0 - (len * s) / 8;
      out.push(px, py, pz, nx, ny, nz);
      [px, py, pz] = [nx, ny, nz];
    }
  }
}

function spiral(turns: number, r0: number, grow: number, steps: number, lift = 0): Vec3[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / (steps - 1)) * turns * Math.PI * 2;
    const r = r0 * Math.exp(grow * a);
    return [Math.cos(a) * r, Math.sin(a) * r, lift * i / steps] as Vec3;
  });
}

/** Body geometry and thread points per family, sized to sit inside the 25 cm collider. */
export function silhouette(stem: StemId): { body: BufferGeometry; lines: Pts } {
  const lines: Pts = [];
  switch (stem) {
    case 'vln': { // tall slender bell, many fine threads
      threads(18, 0.07, 0.24, 0.012, lines);
      return { body: bell(0.08, 0.2), lines };
    }
    case 'vla_vc': { // wide bell, thick ribbon tendrils (paired lines read as ribbons)
      threads(6, 0.1, 0.18, 0.03, lines);
      threads(6, 0.112, 0.18, 0.03, lines);
      return { body: bell(0.15, 0.11), lines };
    }
    case 'cb': { // heavy manta: flat diamond body with a tail
      const g = new SphereGeometry(0.2, 18, 8);
      g.scale(1, 0.16, 0.6);
      lines.push(0, 0, 0.1, 0, 0, 0.32);
      return { body: g, lines };
    }
    case 'fl': { // bead-chain siphonophore
      const beads = Array.from({ length: 7 }, (_, i) => {
        const b = new IcosahedronGeometry(0.028 - i * 0.002, 1);
        b.translate(Math.sin(i * 0.9) * 0.03, 0.12 - i * 0.04, 0);
        if (i) lines.push(Math.sin((i - 1) * 0.9) * 0.03, 0.12 - (i - 1) * 0.04, 0, Math.sin(i * 0.9) * 0.03, 0.12 - i * 0.04, 0);
        return b;
      });
      return { body: mergeGeometries(beads), lines };
    }
    case 'reeds': { // coiled nautilus spiral
      const g = tube(spiral(2.2, 0.02, 0.17, 48), 0.022, 64);
      return { body: g, lines };
    }
    case 'hn': { // curled ammonite with a glowing flare at the mouth
      const coil = spiral(1.6, 0.03, 0.2, 36);
      const end = coil[coil.length - 1];
      const flare = new CylinderGeometry(0.07, 0.025, 0.06, 16, 1, true);
      flare.rotateX(Math.PI / 2);
      flare.translate(end[0], end[1], 0.03);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        lines.push(end[0], end[1], 0.06, end[0] + Math.cos(a) * 0.1, end[1] + Math.sin(a) * 0.1, 0.12);
      }
      return { body: mergeGeometries([tube(coil, 0.03, 48).toNonIndexed(), flare.toNonIndexed()]), lines };
    }
    case 'brass': { // branching coral fan, bright tips
      const parts: BufferGeometry[] = [];
      const branch = (x: number, y: number, a: number, len: number, depth: number) => {
        const x2 = x + Math.sin(a) * len, y2 = y + Math.cos(a) * len;
        parts.push(tube([[x, y, 0], [(x + x2) / 2, (y + y2) / 2, 0.005], [x2, y2, 0]], 0.016 - depth * 0.003, 6).toNonIndexed());
        if (depth < 3) { branch(x2, y2, a - 0.45, len * 0.72, depth + 1); branch(x2, y2, a + 0.45, len * 0.72, depth + 1); }
        else lines.push(x2, y2, 0, x2 + Math.sin(a) * 0.02, y2 + Math.cos(a) * 0.02, 0);
      };
      branch(0, -0.2, 0, 0.15, 0);
      return { body: mergeGeometries(parts), lines };
    }
    case 'perc': { // anemone sphere with spines
      const g = new IcosahedronGeometry(0.1, 2);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i += 3) lines.push(p.getX(i), p.getY(i), p.getZ(i), p.getX(i) * 1.7, p.getY(i) * 1.7, p.getZ(i) * 1.7);
      return { body: g, lines };
    }
    case 'harp': { // comb jelly: an egg with 8 shimmering cilia rows
      const g = new SphereGeometry(0.09, 16, 12);
      g.scale(0.8, 1.3, 0.8);
      for (let r = 0; r < 8; r++) {
        const a = (r / 8) * Math.PI * 2;
        for (let s = 0; s < 10; s++) {
          const v0 = (s / 10) * Math.PI, v1 = ((s + 1) / 10) * Math.PI;
          const pt = (v: number) => [Math.sin(v) * Math.cos(a) * 0.078, -Math.cos(v) * 0.125, Math.sin(v) * Math.sin(a) * 0.078];
          lines.push(...pt(v0), ...pt(v1));
        }
      }
      return { body: g, lines };
    }
  }
}

const BODY_VERT = /* glsl */ `
uniform float uFlap; uniform float uTime;
varying vec3 vN; varying vec3 vView;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 2.2) * abs(p.x) * p.x * uFlap * 3.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BODY_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uBright;
varying vec3 vN; varying vec3 vView;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), vView)), 2.0);
  gl_FragColor = vec4(uColor * uBright * (0.25 + 1.4 * rim), 1.0);
  #include <colorspace_fragment>
}`;

interface Creature {
  stem: StemId; home: Vec3; obj: Group; body: ShaderMaterial; lines: LineBasicMaterial;
  from: Vec3; to: Vec3; glideStart: number; gliding: boolean; pos: Vec3; bright: number;
}

/** The camera's eye and level yaw, for the reach spot. */
export type HeadFn = () => { eye: Vec3; yaw: number };

export function createCreatures(ctx: AppContext, scene: Object3D, head: HeadFn, reachSpot: (eye: Vec3, yaw: number) => Vec3, radius: number) {
  let creatures: Creature[] = [];
  let mute: Partial<Record<StemId, MuteState>> = {};
  let lock = 0;
  let solo: StemId | null = null;
  let summoned: StemId | null = null;
  let env: Envelopes | null = null;
  let request = 0;

  const ring = new Mesh(new RingGeometry(radius + 0.02, radius + 0.035, 64, 1),
    new MeshBasicMaterial({ color: '#6FF3FF', transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const ringCount = ring.geometry.index!.count;
  ring.visible = false;
  scene.add(ring);

  const clear = () => { mute = {}; solo = null; summoned = null; lock = 0; };

  ctx.bus.on('piece:ready', ({ id, manifest }) => {
    creatures.forEach((c) => { scene.remove(c.obj); ctx.registry.remove(`creature:${c.stem}`); });
    clear();
    env = null;
    const r = ++request;
    fetch(`/pieces/${id}/envelopes.json`).then((res) => res.json()).then((e: Envelopes) => { if (r === request) env = e; }).catch(() => {});
    creatures = manifest.stems.map(({ id: stem, homeSeat }) => {
      const { body, lines } = silhouette(stem);
      const color = new Color(ACCENT[stem]);
      const bodyMat = new ShaderMaterial({
        vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
        uniforms: { uColor: { value: color }, uBright: { value: 1 }, uFlap: { value: stem === 'cb' ? 0.5 : 0 }, uTime: { value: 0 } },
      });
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new Float32BufferAttribute(lines, 3));
      const lineMat = new LineBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false });
      const obj = new Group();
      obj.add(new Mesh(body, bodyMat));
      if (lines.length) obj.add(new LineSegments(lineGeo, lineMat));
      obj.position.set(...homeSeat);
      scene.add(obj);
      ctx.registry.set({ id: `creature:${stem}`, kind: 'creature', stem, center: homeSeat, radius });
      return { stem, home: homeSeat, obj, body: bodyMat, lines: lineMat, from: homeSeat, to: homeSeat, glideStart: 0, gliding: false, pos: homeSeat, bright: 1 };
    });
  });

  const glideTo = (c: Creature, to: Vec3, now: number) => { c.from = c.pos; c.to = to; c.glideStart = now; c.gliding = true; };

  ctx.bus.on('gaze:summon', ({ stem }) => {
    const now = performance.now() / 1000;
    const prev = creatures.find((c) => c.stem === summoned);
    if (prev) glideTo(prev, prev.home, now);
    const c = creatures.find((x) => x.stem === stem);
    if (!c) return;
    const { eye, yaw } = head();
    glideTo(c, reachSpot(eye, yaw), now);
    c.obj.rotation.y = yaw;
    summoned = stem;
  });
  ctx.bus.on('stem:mute', ({ stem, state, lockProgress }) => {
    mute[stem] = state;
    if (stem === summoned) lock = state === 'locked' ? 1 : state === 'held' ? lockProgress : 0;
  });
  ctx.bus.on('stem:solo', ({ stem }) => { solo = stem; });
  ctx.bus.on('app:reset', () => { mute = {}; solo = null; lock = 0; });

  return {
    /** The creature's live centre (notes are born at its mouth). */
    position: (stem: StemId): Vec3 | undefined => creatures.find((c) => c.stem === stem)?.pos,
    muteOf: (stem: StemId) => mute[stem],
    solo: () => solo,
    update(dt: number) {
      const now = performance.now() / 1000;
      const frame = env ? Math.floor(ctx.transport.time() * env.rate) : -1;
      for (const c of creatures) {
        if (c.gliding) {
          const k = (now - c.glideStart) / GLIDE_SEC;
          c.pos = glideAt(c.from, c.to, k);
          c.gliding = k < 1;
          ctx.registry.set({ id: `creature:${c.stem}`, kind: 'creature', stem: c.stem, center: c.pos, radius });
        }
        const amp = env?.stems[c.stem]?.[frame] ?? 0;
        const bob = Math.sin(now * 0.8 + c.home[0] * 3) * 0.02;
        c.obj.position.set(c.pos[0], c.pos[1] + bob, c.pos[2]);
        c.obj.scale.setScalar(0.9 + 0.35 * amp);
        c.bright += (dimFor(c.stem, mute[c.stem], solo) - c.bright) * Math.min(1, dt * 6);
        c.body.uniforms.uBright.value = c.bright * (0.35 + 0.9 * amp);
        c.body.uniforms.uTime.value = now;
        c.lines.opacity = c.bright * (0.25 + 0.6 * amp);
      }
      const s = creatures.find((c) => c.stem === summoned);
      ring.visible = !!s && lock > 0;
      if (s && ring.visible) {
        ring.position.copy(s.obj.position);
        const { eye } = head();
        ring.lookAt(eye[0], eye[1], eye[2]);
        ring.geometry.setDrawRange(0, Math.ceil((lock * ringCount) / 6) * 6);
        (ring.material as MeshBasicMaterial).opacity = lock >= 1 ? 1 : 0.6;
      }
    },
  };
}

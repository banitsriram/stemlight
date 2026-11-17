// The nine sections as instruments (built in instruments.ts), their glide to the reach spot, and the
// mute / solo / envelope look. Each is two draw calls: a glass body mesh and one LineSegments for its strings.
// They keep the registry id creature:<stem> and kind 'creature'.
import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LineSegments, Mesh, MeshBasicMaterial,
  Object3D, RingGeometry, ShaderMaterial,
} from 'three';
import type { AppContext, Envelopes, MuteState, StemId, Vec3 } from '../contracts';
import { endCardUp } from '../story/sequencer';
import { SEA, SEA_GLSL } from './deepsea';
import { instrument } from './instruments';

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


/** The section's instrument (kept under the old name: checks and tests import it). */
export const silhouette = instrument;

// Deep-sea glass (17 Nov): each instrument is glass in its own material (wood turns amber glass, brass gold,
// silver pale aqua), lit only by the surface far above, in world space. Alive, it glows from within in the
// section's colour, more as it plays, with a rim of that colour; silenced (muted, or outside a solo) it frosts
// over, its colour and glow draining to pale ice. Far instruments fade into the deep haze. tint.a is metal 0..1.
const BODY_VERT = /* glsl */ `
attribute vec4 tint;
varying vec3 vN; varying vec4 vTint; varying vec3 vWorld; varying vec3 vToEye; varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec3 eye = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz); // this eye's position: under multiview cameraPosition is shared by both eyes
  vToEye = eye - w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vTint = tint;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BODY_FRAG = SEA_GLSL + /* glsl */ `
uniform vec3 uColor; uniform float uBright; uniform float uPulse; uniform float uTime;
varying vec3 vN; varying vec4 vTint; varying vec3 vWorld; varying vec3 vToEye; varying float vDist;
void main() {
  vec3 V = normalize(vToEye);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N; // inside of a bell
  float metal = vTint.a, fres;
  vec3 c = seaGlass(N, V, mix(vTint.rgb, vTint.rgb * vec3(0.78, 1.0, 1.1), 0.35), metal, fres);
  // uBright is 0.35 for a quiet section, more as it plays, about 0.07 when silenced.
  float awake = clamp(uBright / 0.35, 0.0, 1.0), loud = max(uBright - 0.35, 0.0);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0); // broader than fres, so thin parts show it
  c += uColor * rim * (0.35 + 1.4 * loud) * awake;
  c += uColor * (0.03 + 0.12 * loud + 0.06 * uPulse) * awake;
  vec3 frost = vec3(dot(c, vec3(0.3, 0.6, 0.1))) * vec3(0.75, 0.9, 1.0) * 0.55 + SEA_FOAM * rim * 0.22;
  c = mix(frost, c, awake);
  c *= 1.0 + 0.18 * max(N.y, 0.0) * dapple(vWorld, uTime);
  c = mix(c, SEA_HAZE, seaFog(vDist));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
// Strings swing across the instrument while its section plays; vib is 0 at their ends.
const LINE_VERT = /* glsl */ `
uniform float uTime; uniform float uPulse;
attribute vec3 tint; attribute float vib;
varying vec3 vTint;
void main() {
  vec3 p = position;
  p.z += sin(uTime * 70.0 + p.x * 400.0) * vib * uPulse * 0.003;
  vTint = tint;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// Strings glow like filaments, tinted toward the section's colour.
const LINE_FRAG = /* glsl */ `
uniform float uOpacity; uniform vec3 uColor; varying vec3 vTint;
void main() {
  gl_FragColor = vec4(mix(vTint, uColor, 0.3) * 1.15 * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;
// One billboarded glow per creature, all nine in one draw call: four corners share a centre attribute.
const HALO_VERT = /* glsl */ `
attribute vec3 center; attribute vec3 tint; attribute float glow; attribute float size;
varying vec2 vUv; varying vec3 vTint; varying float vGlow;
void main() {
  vUv = position.xy;
  vTint = tint; vGlow = glow;
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  vGlow *= exp(-length(mv.xyz) * 0.05); // far glows fade into the haze
  mv.xyz *= 1.0 + 0.3 / max(0.3, -mv.z); // sits 0.3 m behind the instrument along the line of sight, so it never cuts through it
  mv.xy += position.xy * size;
  vGlow *= smoothstep(0.15, 0.45, -mv.z); // no glow fog right at the face
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FRAG = /* glsl */ `
varying vec2 vUv; varying vec3 vTint; varying float vGlow;
void main() {
  float d = length(vUv);
  float f = max(0.0, 1.0 - d);
  float a = f * f * f * f * vGlow; // reaches zero at the quad's circle, so no visible edge after sRGB encoding
  if (a < 0.001) discard;
  gl_FragColor = vec4(vTint * a, 1.0);
  #include <colorspace_fragment>
}`;

function halos(n: number) {
  const g = new BufferGeometry();
  const corner: number[] = [], index: number[] = [];
  for (let i = 0; i < n; i++) {
    corner.push(-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  g.setAttribute('position', new Float32BufferAttribute(corner, 3));
  g.setIndex(index);
  const attr = (name: string, size: number) => {
    const a = new Float32BufferAttribute(new Float32Array(n * 4 * size), size);
    g.setAttribute(name, a);
    return a;
  };
  const center = attr('center', 3), tint = attr('tint', 3), glow = attr('glow', 1), size = attr('size', 1);
  const mesh = new Mesh(g, new ShaderMaterial({
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return {
    mesh,
    set(i: number, pos: Vec3, color: Color, g: number, s: number) {
      for (let k = i * 4; k < i * 4 + 4; k++) {
        center.setXYZ(k, pos[0], pos[1], pos[2]);
        tint.setXYZ(k, color.r, color.g, color.b);
        glow.setX(k, g);
        size.setX(k, s);
      }
    },
    commit(count: number) {
      g.setDrawRange(0, count * 6);
      center.needsUpdate = tint.needsUpdate = glow.needsUpdate = size.needsUpdate = true;
    },
  };
}

interface Creature {
  stem: StemId; home: Vec3; obj: Group; body: ShaderMaterial; lines: ShaderMaterial; color: Color;
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
    new MeshBasicMaterial({ color: SEA.cyan, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const ringCount = ring.geometry.index!.count;
  ring.visible = false;
  scene.add(ring);
  const glow = halos(9);
  scene.add(glow.mesh);

  const clear = () => { mute = {}; solo = null; summoned = null; lock = 0; };

  ctx.bus.on('piece:ready', ({ id, manifest }) => {
    creatures.forEach((c) => { scene.remove(c.obj); ctx.registry.remove(`creature:${c.stem}`); });
    clear();
    env = null;
    const r = ++request;
    fetch(`/pieces/${id}/envelopes.json`).then((res) => res.json()).then((e: Envelopes) => { if (r === request) env = e; }).catch(() => {});
    creatures = manifest.stems.map(({ id: stem, homeSeat }) => {
      const { body, lines, lineColors, vib } = instrument(stem);
      const color = new Color(ACCENT[stem]);
      const bodyMat = new ShaderMaterial({
        vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, side: DoubleSide,
        uniforms: { uColor: { value: color }, uBright: { value: 1 }, uPulse: { value: 0 }, uTime: { value: 0 } },
      });
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new Float32BufferAttribute(lines, 3));
      lineGeo.setAttribute('tint', new Float32BufferAttribute(lineColors, 3));
      lineGeo.setAttribute('vib', new Float32BufferAttribute(vib, 1));
      const lineMat = new ShaderMaterial({
        vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
        uniforms: { uOpacity: { value: 1 }, uTime: { value: 0 }, uPulse: { value: 0 }, uColor: { value: color } },
      });
      const obj = new Group();
      obj.add(new Mesh(body, bodyMat));
      if (lines.length) obj.add(new LineSegments(lineGeo, lineMat));
      obj.position.set(...homeSeat);
      scene.add(obj);
      ctx.registry.set({ id: `creature:${stem}`, kind: 'creature', stem, center: homeSeat, radius });
      return { stem, home: homeSeat, obj, body: bodyMat, lines: lineMat, color, from: homeSeat, to: homeSeat, glideStart: 0, gliding: false, pos: homeSeat, bright: 1 };
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
      // The end card needs the space ahead: send the summoned creature home while it shows.
      const held = endCardUp() && creatures.find((c) => c.stem === summoned);
      if (held) { glideTo(held, held.home, now); summoned = null; }
      const { eye } = head();
      const frame = env ? Math.floor(ctx.transport.time() * env.rate) : -1;
      for (const c of creatures) {
        if (c.gliding) {
          const k = (now - c.glideStart) / GLIDE_SEC;
          c.pos = glideAt(c.from, c.to, k);
          c.gliding = k < 1;
          ctx.registry.set({ id: `creature:${c.stem}`, kind: 'creature', stem: c.stem, center: c.pos, radius });
        }
        // The envelopes ignore mute and solo, so a silenced section's score must not wake it: its loudness
        // fades out with its brightness (1 when sounding, 0 at the muted 0.2 and outside-solo 0.25).
        const amp = (env?.stems[c.stem]?.[frame] ?? 0) * Math.min(1, Math.max(0, (c.bright - 0.25) / 0.75));
        const bob = Math.sin(now * 0.8 + c.home[0] * 3) * 0.02;
        c.obj.position.set(c.pos[0], c.pos[1] + bob, c.pos[2]);
        c.obj.scale.setScalar(0.97 + 0.08 * amp);
        // Face the listener, with a slow turn so the shape reads in the round.
        c.obj.rotation.y = Math.atan2(eye[0] - c.pos[0], eye[2] - c.pos[2]) + 0.3 * Math.sin(now * 0.4 + c.home[0] * 5);
        c.obj.rotation.z = 0.05 * Math.sin(now * 0.55 + c.home[0] * 3);
        c.bright += (dimFor(c.stem, mute[c.stem], solo) - c.bright) * Math.min(1, dt * 6);
        c.body.uniforms.uBright.value = c.bright * (0.35 + 0.9 * amp);
        c.body.uniforms.uPulse.value = amp;
        c.body.uniforms.uTime.value = now;
        c.lines.uniforms.uTime.value = now;
        c.lines.uniforms.uPulse.value = amp;
        c.lines.uniforms.uOpacity.value = Math.min(1, c.bright) * (0.75 + 0.5 * amp);
        glow.set(creatures.indexOf(c), [c.pos[0], c.pos[1] + bob, c.pos[2]], c.color, c.bright * (0.22 + 0.55 * amp), 0.3 + 0.12 * amp);
      }
      glow.commit(creatures.length);
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

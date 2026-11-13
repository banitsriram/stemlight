// Ghost hands (biyon-54): translucent hands that loop the gesture for the current tutorial step,
// with its caption above. Both hands are one InstancedMesh of bones, so one draw call.
import {
  AdditiveBlending, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Object3D, Quaternion, ShaderMaterial, Vector3,
} from 'three';
import type { TutorialStep, Vec3 } from '../contracts';
import { textSprite } from './card.ts';

export interface HandPose { at: Vec3; curl: number; pinch: number; tap?: number } // at: palm, local to the reach spot
type Rig = { left?: HandPose; right?: HandPose };

const PERIOD = 2.4;
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
/** 0→1→0 bump between a and b of the loop. */
const bump = (u: number, a: number, b: number) => (u < a || u > b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI));

/** What each step's hands do, u = 0..1 through the loop. Exported for the check page. */
export function poseFor(step: TutorialStep, u: number): Rig {
  const R: Vec3 = [0.02, 0, 0.05];
  switch (step) {
    case 'silence': return { right: { at: R, curl: ease(u * 2.5), pinch: 0 } };
    case 'return': return { right: { at: R, curl: 1 - ease(u * 2.5), pinch: 0 } };
    case 'lock': return { right: { at: R, curl: ease(u * 6), pinch: 0 } };
    case 'solo': return { right: { at: [0.02, 0.06, 0.05], curl: 0.1, pinch: Math.max(bump(u, 0.1, 0.3), bump(u, 0.35, 0.55)) } };
    case 'cut': {
      const spread = 0.08 + 0.1 * ease((u - 0.3) * 2);
      const pinch = u > 0.15 && u < 0.9 ? 1 : 0;
      return { left: { at: [-spread, 0.05, 0.1], curl: 0.1, pinch }, right: { at: [spread, 0.05, 0.1], curl: 0.1, pinch } };
    }
    case 'pads': return { right: { at: [0.02, 0.1 - 0.08 * bump(u, 0.2, 0.45), 0.05], curl: 0.15, pinch: 0, tap: 1 } };
    default: return {};
  }
}

const BONES = 16; // per hand: palm, 4 fingers × 3, thumb × 2, wrist
const dummy = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), dir = new Vector3(), mid = new Vector3(), scl = new Vector3();

function bone(mesh: InstancedMesh, i: number, a: Vector3, b: Vector3, r: number) {
  dir.subVectors(b, a);
  const len = dir.length();
  q.setFromUnitVectors(up, dir.normalize());
  mid.addVectors(a, b).multiplyScalar(0.5);
  mesh.setMatrixAt(i, dummy.compose(mid, q, scl.set(r, len, r)));
}

/** Writes one hand's bones into instances [base, base + BONES). Palm down, fingers pointing away (-z). */
function writeHand(mesh: InstancedMesh, base: number, side: 1 | -1, p: HandPose | undefined) {
  if (!p) {
    for (let i = 0; i < BONES; i++) mesh.setMatrixAt(base + i, dummy.makeScale(0, 0, 0));
    return;
  }
  const palm = new Vector3(...p.at);
  let i = base;
  mesh.setMatrixAt(i++, dummy.compose(palm, q.identity(), scl.set(3.4, 0.018, 4))); // flat palm disc, about 7 by 8 cm
  bone(mesh, i++, palm.clone().add(new Vector3(0, 0, 0.09)), palm.clone().add(new Vector3(0, 0, 0.03)), 2.2); // wrist
  const tips: Vector3[] = [];
  [-0.026, -0.009, 0.009, 0.026].forEach((x, f) => {
    // index is nearest the thumb: thumb sits on the inner side, -x for the right hand
    const curl = f === 0 ? (p.tap ? 0 : p.curl * (1 - p.pinch * 0.5) + p.pinch * 0.45) : Math.max(p.curl, p.tap ? 0.8 : 0);
    let a = palm.clone().add(new Vector3(x * side, 0, -0.04));
    let ang = 0;
    [0.04, 0.028, 0.022].forEach((len, s) => {
      ang += curl * [1.2, 1.4, 1.0][s];
      const b = a.clone().add(new Vector3(0, -Math.sin(ang) * len, -Math.cos(ang) * len));
      bone(mesh, i++, a, b, 0.75 - s * 0.1);
      a = b;
    });
    tips.push(a);
  });
  const thumbBase = palm.clone().add(new Vector3(-0.035 * side, -0.005, -0.01));
  const open = thumbBase.clone().add(new Vector3(-0.03 * side, -0.005, -0.04));
  const tip = open.clone().lerp(tips[0], p.pinch).lerp(palm.clone().add(new Vector3(-0.01 * side, -0.03, -0.03)), p.curl * (1 - p.pinch));
  const knuckle = thumbBase.clone().lerp(tip, 0.5).add(new Vector3(-0.012 * side, 0, 0));
  bone(mesh, i++, thumbBase, knuckle, 0.8);
  bone(mesh, i++, knuckle, tip, 0.7);
}

// Glass bones: bright at the silhouette, nearly clear face-on, so the hand reads as light, not a solid.
const GHOST_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const GHOST_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float opacity;
varying vec3 vN; varying vec3 vView;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.5) * (0.15 + 1.3 * rim) * opacity * 2.0, 1.0);
  #include <colorspace_fragment>
}`;

export function createGhost(parent: Object3D) {
  const group = new Group();
  const mat = new ShaderMaterial({
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, blending: AdditiveBlending, depthWrite: false,
    uniforms: { uColor: { value: new Color('#6FF3FF') }, opacity: { value: 0.35 } },
  });
  const mesh = new InstancedMesh(new CylinderGeometry(0.01, 0.01, 1, 16, 1), mat, BONES * 2);
  mesh.frustumCulled = false;
  const caption = textSprite(0.36);
  caption.sprite.position.set(0, 0.16, 0);
  group.add(mesh, caption.sprite);
  group.visible = false;
  parent.add(group);

  return {
    group,
    /** Places the rig at `spot` facing yaw; `glow` 0..1 brightens it for a nudge. */
    update(step: TutorialStep, words: string, now: number, spot: Vec3, yaw: number, glow: number) {
      group.visible = step !== 'free' && words !== '';
      if (!group.visible) return;
      group.position.set(...spot);
      group.rotation.y = yaw;
      const rig = poseFor(step, (now % PERIOD) / PERIOD);
      writeHand(mesh, 0, -1, rig.left);
      writeHand(mesh, BONES, 1, rig.right);
      mesh.instanceMatrix.needsUpdate = true;
      mat.uniforms.opacity.value = 0.3 + 0.35 * glow;
      caption.set([words]);
      caption.sprite.material.opacity = 0.75 + 0.25 * glow;
    },
  };
}

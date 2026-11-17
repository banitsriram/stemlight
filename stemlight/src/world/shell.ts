import { Float32BufferAttribute, IcosahedronGeometry, Mesh, Object3D, ShaderMaterial } from 'three';
import type { AppContext, Vec3 } from '../contracts';
import { createCreatures, type HeadFn } from './creatures';
import { SEA_GLSL } from './deepsea';
import { createSky } from './sky';

export const CREATURE_RADIUS = 0.25;

/** The spot a summoned creature glides to: 0.45 m ahead of the eye and 0.15 m below it. */
export function reachSpot(eye: Vec3, yaw: number): Vec3 {
  return [eye[0] - Math.sin(yaw) * 0.45, eye[1] - 0.15, eye[2] - Math.cos(yaw) * 0.45];
}

/** The rock you sit on: dark stone catching the surface's caustics on its top (deep-sea look, 17 Nov). */
function rockSeat(): Mesh {
  const geometry = new IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute('position');
  const glow: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const lump = 1 + 0.08 * Math.sin(x * 7 + z * 3) + 0.05 * Math.sin(z * 11 - y * 5);
    position.setXYZ(i, x * lump * 0.9, y * lump * 0.22, z * lump * 0.9);
    glow.push(Math.max(0, y) ** 2);
  }
  geometry.setAttribute('glow', new Float32BufferAttribute(glow, 1));
  geometry.computeVertexNormals();
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
attribute float glow; varying float vGlow; varying vec3 vW; varying vec3 vN;
void main() {
  vGlow = glow;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: SEA_GLSL + /* glsl */ `
uniform float uTime; varying float vGlow; varying vec3 vW; varying vec3 vN;
void main() {
  vec3 c = mix(SEA_ABYSS, SEA_DEEP, vGlow);
  // Caustics as warped sines (no noise lookups: the rock fills the bottom of the view).
  vec2 p = vW.xz * 6.0;
  p += 0.7 * vec2(sin(p.y * 0.9 + uTime * 0.7), sin(p.x * 1.1 - uTime * 0.6));
  float v = sin(p.x * 1.3 + uTime * 0.3) * sin(p.y * 1.5 - uTime * 0.25);
  c += SEA_SHALLOWS * pow(1.0 - abs(v), 10.0) * 0.3 * max(vN.y, 0.0);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const rock = new Mesh(geometry, material);
  rock.position.y = 0.2;
  return rock;
}

/** Adds the seat, sky and creatures; the creatures keep one target per stem of the loaded piece in the registry. */
export function initShell(ctx: AppContext, scene: Object3D, head: HeadFn) {
  const rock = rockSeat();
  scene.add(rock);
  const sky = createSky(scene);
  const creatures = createCreatures(ctx, scene, head, reachSpot, CREATURE_RADIUS);
  return {
    creatures,
    update(dt: number) {
      sky.update();
      (rock.material as ShaderMaterial).uniforms.uTime.value = performance.now() / 1000;
      creatures.update(dt);
    },
    /** The beat swell above 1, from the notes layer: the plankton brighten on the beat. */
    pulse(k: number) { sky.pulse(k); },
  };
}

import { Color, Float32BufferAttribute, IcosahedronGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import type { AppContext, Vec3 } from '../contracts';
import { createCreatures, type HeadFn } from './creatures';
import { createSky } from './sky';

export const CREATURE_RADIUS = 0.25;

/** The spot a summoned creature glides to: 0.45 m ahead of the eye and 0.15 m below it. */
export function reachSpot(eye: Vec3, yaw: number): Vec3 {
  return [eye[0] - Math.sin(yaw) * 0.45, eye[1] - 0.15, eye[2] - Math.cos(yaw) * 0.45];
}

function rockSeat(): Mesh {
  const geometry = new IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute('position');
  const low = new Color('#07060F'), high = new Color('#0E5F6B');
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const lump = 1 + 0.08 * Math.sin(x * 7 + z * 3) + 0.05 * Math.sin(z * 11 - y * 5);
    position.setXYZ(i, x * lump * 0.9, y * lump * 0.22, z * lump * 0.9);
    const glow = low.clone().lerp(high, Math.max(0, y) ** 2);
    colors.push(glow.r, glow.g, glow.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const rock = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
  rock.position.y = 0.2;
  return rock;
}

/** Adds the seat, sky and creatures; the creatures keep one target per stem of the loaded piece in the registry. */
export function initShell(ctx: AppContext, scene: Object3D, head: HeadFn) {
  scene.add(rockSeat());
  const sky = createSky(scene);
  const creatures = createCreatures(ctx, scene, head, reachSpot, CREATURE_RADIUS);
  return {
    creatures,
    update(dt: number) {
      sky.update();
      creatures.update(dt);
    },
  };
}

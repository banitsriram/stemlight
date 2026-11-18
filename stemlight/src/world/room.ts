// Passthrough (18 Nov, sir): the player's own room. Nothing is drawn: the frame is cleared see-through (worlds.ts
// clears with alpha 0 and no background) and only the instruments, notes and creatures float in the room. Its one
// object is a dark veil, so a world change still fades through dark; once the room is up the veil stops drawing.
import { BackSide, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { WorldParts } from './worldList';

export function createRoom(): WorldParts {
  const material = new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, depthWrite: false, opacity: 0 });
  material.visible = false;
  const veil = new Mesh(new SphereGeometry(30, 16, 8), material);
  veil.renderOrder = -10; // before the other see-through things, so it never hides the instruments
  veil.frustumCulled = false;
  return {
    objects: [veil],
    update() {},
    pulse() {},
    setFade(k) { material.opacity = 1 - k; material.visible = k < 1; },
  };
}

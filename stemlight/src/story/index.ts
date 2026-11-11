// Opening, tutorial with ghost hands and idle nudges (biyon-54, 55, 56). Starts when the music first plays;
// a returning user (tutorialDone saved) goes straight to free play.
import type { Object3D } from 'three';
import type { AppContext, StemId, Vec3 } from '../contracts';
import type { HeadFn } from '../world/creatures';
import { createGhost } from './ghost.ts';
import { createTutorial } from './tutorial.ts';

export function initStory(
  ctx: AppContext, scene: Object3D, head: HeadFn,
  reachSpot: (eye: Vec3, yaw: number) => Vec3, creatureAt: (stem: StemId) => Vec3 | undefined,
) {
  const tutorial = createTutorial(ctx.bus, ctx.save);
  const ghost = createGhost(scene);
  let first: StemId | null = null; // the opening points at the first stem (violins in both pieces)
  ctx.bus.on('piece:ready', ({ manifest }) => { first = manifest.stems[0]?.id ?? null; });
  ctx.bus.on('transport:state', ({ playing }) => { if (playing) tutorial.start(performance.now() / 1000); });

  return {
    tutorial,
    update() {
      const now = performance.now() / 1000;
      const nudges = tutorial.tick(now);
      const step = tutorial.step();
      const { eye, yaw } = head();
      // Look: the word floats over the creature to look at. Every other step: hands at the reach spot.
      const at = step === 'summon' && first ? creatureAt(first) : undefined;
      const spot: Vec3 = at ? [at[0], at[1] + 0.12, at[2]] : reachSpot(eye, yaw);
      const glow = nudges > 0 ? 0.5 + 0.5 * Math.sin(now * 6) : 0;
      ghost.update(step, tutorial.words(), now, spot, step === 'summon' ? Math.atan2(eye[0] - spot[0], eye[2] - spot[2]) : yaw, glow);
    },
  };
}

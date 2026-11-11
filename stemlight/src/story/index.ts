// Opening, tutorial with ghost hands and idle nudges (biyon-54, 55, 56). Starts when the music first plays;
// a returning user (tutorialDone saved) goes straight to free play.
import type { Object3D } from 'three';
import type { AppContext, MixState, StemId, Vec3 } from '../contracts';
import type { HeadFn } from '../world/creatures';
import { textSprite } from './card.ts';
import { createGhost } from './ghost.ts';
import { createTutorial } from './tutorial.ts';

const BACK_SEC = 5;

/** True when a saved mix differs from a fresh piece: anything locked, soloed, EQ'd, cut or played. */
export function hasSavedChanges(m: MixState | undefined): boolean {
  if (!m) return false;
  return Object.values(m.mute).some((s) => s !== 'on') || m.solo !== null || m.cuts.length > 0 || m.parts.length > 0
    || Object.values(m.eq).some((e) => e.low !== 0 || e.mid !== 0 || e.high !== 0);
}

export function initStory(
  ctx: AppContext, scene: Object3D, head: HeadFn,
  reachSpot: (eye: Vec3, yaw: number) => Vec3, creatureAt: (stem: StemId) => Vec3 | undefined,
) {
  const tutorial = createTutorial(ctx.bus, ctx.save);
  const ghost = createGhost(scene);
  let first: StemId | null = null; // the opening points at the first stem (violins in both pieces)
  // A returning user's saved mix comes back on piece:ready; say so for a few seconds (biyon-58).
  const back = textSprite(0.5);
  back.set(['Your mix is back']);
  back.sprite.visible = false;
  scene.add(back.sprite);
  let backUntil = 0;
  ctx.bus.on('piece:ready', ({ id, manifest }) => {
    first = manifest.stems[0]?.id ?? null;
    if (hasSavedChanges(ctx.save.load().perPiece[id])) backUntil = performance.now() / 1000 + BACK_SEC;
  });
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
      // Shown once the music plays, 1.2 m ahead and above the eye, clear of the tutorial caption.
      back.sprite.visible = now < backUntil && ctx.transport.playing();
      if (back.sprite.visible) back.sprite.position.set(eye[0] - Math.sin(yaw) * 1.2, eye[1] + 0.35, eye[2] - Math.cos(yaw) * 1.2);
      else if (!ctx.transport.playing() && backUntil > now) backUntil = now + BACK_SEC; // hold it until playback starts
    },
  };
}

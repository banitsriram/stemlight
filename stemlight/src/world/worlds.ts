// The worlds (18 Nov, sir's design). All three are built at start and drawn together for the first two frames, so
// every shader compiles behind the landing page and a change never stutters; after that only the current world is
// drawn (three draw calls, F17). set(id) fades the current world to dark, swaps in the new one and fades it up,
// while the shared palette re-lights the instruments and creatures (deepsea.ts setPalette). The choice is kept
// on this device.
import { Color, type Object3D, type Scene } from 'three';
import { WORLD_GLOW, setPalette } from './deepsea';
import { createSea } from './sky';
import { createStarry } from './starry';
import { createAurora } from './aurora';
import { WORLDS, fadeAt, loadWorld, saveWorld, worldInfo, type WorldId, type WorldParts } from './worldList';

export interface Worlds {
  list: typeof WORLDS;
  current(): WorldId;
  /** True while a change is fading. */
  changing(): boolean;
  set(id: WorldId): void;
  update(dt: number): void;
  pulse(k: number): void;
}

export function initWorlds(scene: Object3D): Worlds {
  const parts: Record<WorldId, WorldParts> = { sea: createSea(), starry: createStarry(), aurora: createAurora() };
  const ids = Object.keys(parts) as WorldId[];
  for (const id of ids) scene.add(...parts[id].objects);
  const show = (id: WorldId, on: boolean) => { for (const o of parts[id].objects) o.visible = on; };
  const setBackground = (id: WorldId) => {
    const s = scene as Scene;
    if (s.isScene) s.background = new Color(worldInfo(id).palette.abyss);
  };
  let current: WorldId = loadWorld();
  let shown: WorldId = current; // the world in the scene (lags `current` during the first half of a change)
  let change: { from: WorldId; to: WorldId; at: number } | null = null;
  let warm = 2;
  setPalette(worldInfo(current).palette);
  WORLD_GLOW.value = worldInfo(current).glow;
  setBackground(current);
  for (const id of ids) { show(id, true); parts[id].setFade(id === current ? 1 : 0); }

  return {
    list: WORLDS,
    current: () => current,
    changing: () => change !== null,
    set(id) {
      if (id === current) return;
      const from = change ? shown : current;
      change = { from, to: id, at: performance.now() / 1000 };
      current = id;
      saveWorld(id);
    },
    update() {
      const t = performance.now() / 1000;
      if (warm > 0 && --warm === 0) for (const id of ids) show(id, id === shown);
      if (change) {
        const f = fadeAt(t - change.at);
        setPalette(worldInfo(change.from).palette, worldInfo(change.to).palette, f.palette);
        WORLD_GLOW.value = worldInfo(change.from).glow + (worldInfo(change.to).glow - worldInfo(change.from).glow) * f.palette;
        if (f.swapped && shown !== change.to) {
          show(change.from, false);
          shown = change.to;
          show(shown, true);
          setBackground(shown);
        }
        parts[change.from].setFade(f.old);
        parts[change.to].setFade(f.next);
        if (f.next >= 1) { setPalette(worldInfo(change.to).palette); WORLD_GLOW.value = worldInfo(change.to).glow; change = null; }
      }
      for (const id of ids) if (warm > 0 || id === shown) parts[id].update(t);
    },
    pulse(k) { parts[shown].pulse(k); },
  };
}

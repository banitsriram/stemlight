// The worlds (18 Nov, sir's design). All three are built at start; only the current world is drawn (three draw
// calls, F17). set(id) fades the current world to dark, swaps in the new one and fades it up, while the shared palette
// re-lights the instruments and creatures (deepsea.ts setPalette); asked again part way, it carries on from where the
// screen is (worldList.ts createSwitch). The choice is kept on this device.
//
// Warm-up: the hidden worlds are drawn for a few frames with colour writes off, so their shaders compile without
// showing anything. It runs at start (the 2D page) and again when the XR session starts (warm()), because in VR the
// renderer uses multiview, a separate shader variant: without it the first change in the headset would stutter.
import { Color, type Material, type Mesh, type Object3D, type Scene } from 'three';
import { WORLD_GLOW, livePalette, setPalette } from './deepsea';
import { createSea } from './sky';
import { createStarry } from './starry';
import { createAurora } from './aurora';
import { WORLDS, createSwitch, loadWorld, saveWorld, worldInfo, type WorldId, type WorldParts } from './worldList';

export interface Worlds {
  list: typeof WORLDS;
  current(): WorldId;
  /** True while a change is fading. */
  changing(): boolean;
  set(id: WorldId): void;
  /** Compile the hidden worlds' shaders for the current render mode (call when the XR session starts). */
  warm(): void;
  update(dt: number): void;
  pulse(k: number): void;
}

const WARM_FRAMES = 3;

export function initWorlds(scene: Object3D): Worlds {
  const parts: Record<WorldId, WorldParts> = { sea: createSea(), starry: createStarry(), aurora: createAurora() };
  const ids = Object.keys(parts) as WorldId[];
  for (const id of ids) scene.add(...parts[id].objects);
  const mats = (id: WorldId) => parts[id].objects.map((o) => (o as Mesh).material as Material);
  const sw = createSwitch(loadWorld());
  let shown = sw.shown();
  let warming = 0;
  const setBackground = (id: WorldId) => {
    const s = scene as Scene;
    if (s.isScene) s.background = new Color(worldInfo(id).palette.abyss);
  };
  /** Shown worlds draw normally; during a warm-up the hidden ones are drawn too, writing no colour. */
  const applyVisibility = () => {
    for (const id of ids) {
      const on = id === shown;
      for (const o of parts[id].objects) o.visible = on || warming > 0;
      for (const m of mats(id)) m.colorWrite = on;
    }
  };
  const look = () => ({ palette: livePalette(), glow: WORLD_GLOW.value });
  setPalette(worldInfo(shown).palette);
  WORLD_GLOW.value = worldInfo(shown).glow;
  setBackground(shown);
  for (const id of ids) parts[id].setFade(id === shown ? 1 : 0);
  const worlds: Worlds = {
    list: WORLDS,
    current: () => sw.current(),
    changing: () => sw.changing(),
    set(id) {
      if (id === sw.current()) return;
      sw.request(id, performance.now() / 1000, look());
      saveWorld(id);
    },
    warm() { warming = WARM_FRAMES; applyVisibility(); },
    update() {
      const t = performance.now() / 1000;
      const f = sw.step(t);
      if (f.shown !== shown) { shown = f.shown; setBackground(shown); }
      for (const [id, k] of f.fades) parts[id].setFade(k);
      if (!f.done || f.fades.length) {
        setPalette(f.palette[0], f.palette[1], f.palette[2]);
        WORLD_GLOW.value = f.glow;
      }
      if (warming > 0) warming--;
      applyVisibility();
      for (const id of ids) if (warming > 0 || id === shown) parts[id].update(t);
    },
    pulse(k) { parts[shown].pulse(k); },
  };
  worlds.warm();
  return worlds;
}

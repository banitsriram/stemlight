// The worlds (18 Nov, sir's design). All three are built at start; only the current world is drawn (three draw
// calls, F17). set(id) fades the current world to dark, swaps in the new one and fades it up, while the shared palette
// re-lights the instruments and creatures (deepsea.ts setPalette); asked again part way, it carries on from where the
// screen is (worldList.ts createSwitch). The choice is kept on this device.
//
// Warm-up: the hidden worlds are drawn for a few frames with colour writes off, so their shaders compile without
// showing anything. It runs at start (the 2D page) and again when the XR session starts (warm()), because in VR the
// renderer uses multiview, a separate shader variant: without it the first change in the headset would stutter.
import { Color, type Material, type Mesh, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { WORLD_GLOW, livePalette, setPalette } from './deepsea';
import { createSea } from './sky';
import { createStarry } from './starry';
import { createAurora } from './aurora';
import { createRoom } from './room';
import { createObsidian } from './obsidian';
import type { Vec3 } from '../contracts';
import { WORLDS, availableWorlds, createSwitch, loadWorld, saveWorld, worldInfo, type WorldId, type WorldParts } from './worldList';

export interface Worlds {
  list: typeof WORLDS;
  current(): WorldId;
  /** True while a change is fading. */
  changing(): boolean;
  set(id: WorldId): void;
  /** The world in the scene now (a change swaps it half way). */
  shown(): WorldId;
  /** The worlds this session offers: Passthrough only in a passthrough session. */
  available(): WorldId[];
  /** Call when a session starts: a passthrough session opens on the room, a VR one never does. */
  setMode(ar: boolean): void;
  /** Hide every world (the song picker's lobby is up); changes still run behind it. */
  hide(on: boolean): void;
  /** Compile the hidden worlds' shaders for the current render mode (call when the XR session starts). */
  warm(): void;
  update(dt: number): void;
  pulse(k: number): void;
}

const WARM_FRAMES = 3;

export function initWorlds(scene: Object3D, renderer?: WebGLRenderer, hands?: () => Vec3[]): Worlds {
  const parts: Record<WorldId, WorldParts> = { obsidian: createObsidian(hands), sea: createSea(), starry: createStarry(), aurora: createAurora(), room: createRoom() };
  let ar = false;
  const ids = Object.keys(parts) as WorldId[];
  for (const id of ids) scene.add(...parts[id].objects);
  const mats = (id: WorldId) => parts[id].objects.map((o) => (o as Mesh).material as Material);
  const sw = createSwitch(loadWorld());
  let shown = sw.shown();
  let warming = 0;
  let hidden = false;
  const setBackground = (id: WorldId) => {
    const s = scene as Scene;
    // Passthrough: no background and a see-through clear, so the room shows wherever nothing is drawn.
    if (s.isScene) s.background = id === 'room' ? null : new Color(worldInfo(id).palette.abyss);
    renderer?.setClearColor(0x000000, id === 'room' ? 0 : 1);
  };
  // Each material's own depth write, restored when its world shows (an opaque world's land writes depth).
  const depth0 = new Map<Material, boolean>();
  for (const id of ids) for (const m of mats(id)) depth0.set(m, m.depthWrite);
  /** Shown worlds draw normally; during a warm-up the hidden ones are drawn too, writing no colour and no depth. */
  const applyVisibility = () => {
    for (const id of ids) {
      const on = id === shown && !hidden;
      for (const o of parts[id].objects) o.visible = on || warming > 0;
      for (const m of mats(id)) { m.colorWrite = on; m.depthWrite = on && (depth0.get(m) ?? true); }
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
    shown: () => shown,
    available: () => availableWorlds(ar),
    setMode(on) {
      ar = on;
      const id = on ? 'room' : sw.current() === 'room' ? loadWorld() : null;
      if (!id || id === sw.current()) return;
      sw.jump(id);
      shown = id;
      setBackground(id);
      for (const w of ids) parts[w].setFade(w === id ? 1 : 0);
      setPalette(worldInfo(id).palette);
      WORLD_GLOW.value = worldInfo(id).glow;
      applyVisibility();
    },
    set(id) {
      if (id === sw.current() || !availableWorlds(ar).includes(id)) return;
      sw.request(id, performance.now() / 1000, look());
      saveWorld(id);
    },
    hide(on) { if (on !== hidden) { hidden = on; applyVisibility(); } },
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

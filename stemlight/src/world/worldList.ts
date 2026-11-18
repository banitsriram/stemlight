// The three worlds to choose from (18 Nov, sir): the deep sea (the default), Starry Night after Vincent van Gogh's
// painting (1889, public domain; painted in code, no image files), and Aurora over ice. Pure data and helpers, no
// three.js objects, so node tests can load it; worlds.ts builds the worlds and switches between them.
import type { Object3D } from 'three';
import { SEA, SEA_PALETTE, type Palette } from './deepsea.ts';

export type WorldId = 'sea' | 'starry' | 'aurora';

/** What a world builds: its sky, its floor and its particles, three draw calls in all (F17). */
export interface WorldParts {
  objects: Object3D[];
  /** Wall-clock seconds, so the world keeps moving while the music is paused. */
  update(t: number): void;
  /** The beat swell above 1 (0 between beats, about 0.15 on a downbeat). */
  pulse(k: number): void;
  /** 1 shown, 0 faded to dark (a world change fades through dark). */
  setFade(k: number): void;
}

/**
 * A world for the picker: its name, its light, its orb (the glass tint and the small pearl inside it), and how
 * strongly additive glows draw over it (deepsea.ts WORLD_GLOW).
 */
export interface WorldInfo { id: WorldId; name: string; palette: Palette; orb: [string, string]; glow: number }

/** Night blues of the painting; the light comes from the crescent moon, high on the right ahead. */
export const STARRY_PALETTE: Palette = { abyss: '#0A1430', deep: '#1D3478', shallows: '#3E6DB5', surface: '#F4DB6A', foam: '#FFF4CC', light: [0.533, 0.5, -0.682] };
/** An arctic night; the light is the aurora, high ahead. */
export const AURORA_PALETTE: Palette = { abyss: '#02070F', deep: '#0B2233', shallows: '#1E6E6A', surface: '#8CFFD2', foam: '#F0FBFF', light: [0, 0.8, -0.6] };

export const WORLDS: readonly WorldInfo[] = [
  { id: 'sea', name: 'Deep sea', palette: SEA_PALETTE, orb: [SEA.shallows, SEA.surface], glow: 1 },
  { id: 'starry', name: 'Starry Night', palette: STARRY_PALETTE, orb: ['#2E4E9E', '#F5D33E'], glow: 0.34 },
  { id: 'aurora', name: 'Aurora', palette: AURORA_PALETTE, orb: ['#0B2233', '#3CFFB0'], glow: 0.8 },
];
export const DEFAULT_WORLD: WorldId = 'sea';
export const WORLD_KEY = 'stemlight.world';
/** A world change: the old world fades out over the first half, the new one in over the second. */
export const FADE_SEC = 1.0;

export const isWorld = (x: unknown): x is WorldId => WORLDS.some((w) => w.id === x);
export const worldInfo = (id: WorldId): WorldInfo => WORLDS.find((w) => w.id === id) ?? WORLDS[0];

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The world this device chose last (a per-device preference, like the tutorial step), else the deep sea. */
export function loadWorld(storage: Pick<Storage, 'getItem'> | null = safeStorage()): WorldId {
  try {
    const v = storage?.getItem(WORLD_KEY);
    return isWorld(v) ? v : DEFAULT_WORLD;
  } catch {
    return DEFAULT_WORLD;
  }
}

export function saveWorld(id: WorldId, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(WORLD_KEY, id); } catch { /* private mode: the choice lasts this visit */ }
}

/**
 * Where a world change stands `t` seconds in: how bright the old world and the new one are, how far the shared
 * palette has glided (eased), and whether the new world has taken over the scene.
 */
export function fadeAt(t: number): { old: number; next: number; palette: number; swapped: boolean } {
  const k = Math.min(1, Math.max(0, t / FADE_SEC));
  return { old: k < 0.5 ? 1 - k / 0.5 : 0, next: k < 0.5 ? 0 : (k - 0.5) / 0.5, palette: k * k * (3 - 2 * k), swapped: k >= 0.5 };
}

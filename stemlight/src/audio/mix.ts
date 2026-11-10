// Pure mix rules: which stems are audible, and the EQ in dB. No Web Audio here, so node tests can run it.
import type { MuteState, StemId } from '../contracts';

export const STEMS: StemId[] = ['vln', 'vla_vc', 'cb', 'fl', 'reeds', 'hn', 'brass', 'perc', 'harp'];
export const EQ_LIMIT_DB = 12;
export const RAMP_SEC = 0.03;

export interface Mix {
  mute: Record<StemId, MuteState>;
  solo: StemId | null;
  eq: Record<StemId, { low: number; mid: number; high: number }>;
}

export function emptyMix(): Mix {
  const mute = {} as Mix['mute'], eq = {} as Mix['eq'];
  for (const s of STEMS) {
    mute[s] = 'on';
    eq[s] = { low: 0, mid: 0, high: 0 };
  }
  return { mute, solo: null, eq };
}

/** 1 = audible, 0 = silent. A muted stem stays silent even when it is the solo. */
export function stemGain(mix: Mix, stem: StemId): number {
  if (mix.mute[stem] !== 'on') return 0;
  if (mix.solo && mix.solo !== stem) return 0;
  return 1;
}

export const clampDb = (db: number) => Math.max(-EQ_LIMIT_DB, Math.min(EQ_LIMIT_DB, Number.isFinite(db) ? db : 0));

/** Beats crossed going from `from` (exclusive) to `to` (inclusive). Empty when time went backwards. */
export function beatsCrossed(beats: number[], downbeats: number[], from: number, to: number) {
  const out: { index: number; t: number; downbeat: boolean }[] = [];
  if (to <= from) return out;
  const down = new Set(downbeats.map((d) => Math.round(d * 1000)));
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i];
    if (t > from && t <= to) out.push({ index: i, t, downbeat: down.has(Math.round(t * 1000)) });
    if (t > to) break;
  }
  return out;
}

/** Length of the beat that contains t (falls back to the nearest known beat, then 0.5 s). */
function beatLenAt(beats: number[], k: number): number {
  if (beats.length < 2) return 0.5;
  const i = Math.max(0, Math.min(beats.length - 2, k));
  return beats[i + 1] - beats[i];
}

/** Index of the last beat at or before t (−1 when t is before the first beat). */
export function beatIndexAt(beats: number[], t: number): number {
  let lo = 0, hi = beats.length - 1, k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (beats[m] <= t + 1e-9) { k = m; lo = m + 1; } else hi = m - 1;
  }
  return k;
}

/** Nearest beat time to t, extrapolating past either end of the beat list. */
export function snapBeat(beats: number[], t: number): number {
  if (!beats.length) return t;
  const k = beatIndexAt(beats, t);
  if (k < 0) return beats[0] - Math.round((beats[0] - t) / beatLenAt(beats, 0)) * beatLenAt(beats, 0);
  const len = beatLenAt(beats, k);
  const a = beats[k], b = k + 1 < beats.length ? beats[k + 1] : a + len;
  return t - a <= b - t ? a : b;
}

/** Nearest eighth-note time to t: beats plus the midpoints between them. */
export function snapEighth(beats: number[], t: number): number {
  if (!beats.length) return t;
  const k = Math.max(0, beatIndexAt(beats, t));
  const len = beatLenAt(beats, k);
  const a = beats[k] ?? 0;
  const grid = [a, a + len / 2, a + len];
  return grid.reduce((best, g) => (Math.abs(g - t) < Math.abs(best - t) ? g : best), grid[0]);
}

/** A cut snapped to beats and at least one beat long. */
export function snapCut(beats: number[], t0: number, t1: number): { t0: number; t1: number } {
  let a = snapBeat(beats, Math.min(t0, t1)), b = snapBeat(beats, Math.max(t0, t1));
  if (b - a < 1e-6) {
    const k = beatIndexAt(beats, a);
    b = k + 1 < beats.length && k >= 0 ? beats[k + 1] : a + beatLenAt(beats, k);
  }
  return { t0: a, t1: b };
}

/** The `count` beats just before t (the count-in bar), oldest first. */
export function beatsBefore(beats: number[], t: number, count: number): number[] {
  const out: number[] = [];
  let k = beatIndexAt(beats, t - 1e-6);
  const len = beatLenAt(beats, Math.max(0, k));
  let last = t;
  for (let i = 0; i < count; i++) {
    const b = k >= 0 ? beats[k--] : last - len;
    if (b < 0) break;
    out.unshift(b);
    last = b;
  }
  return out;
}

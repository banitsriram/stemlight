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

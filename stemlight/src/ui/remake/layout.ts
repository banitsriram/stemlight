// Remake surfaces (biyon-45, 46, 47, 58 shell): pure placement and target maths, no three.js, so node tests load it.
//
// Everything is placed in a seated "frame": the eye position and a level yaw. Local axes: x to the right,
// y up, z ahead (the way the head faces at that yaw). Everything here (the score ribbon, its lane, the pads,
// harp, keyboard and reset shell) uses the summoned creature's frame (taken at summon time, like
// world/shell.ts reachSpot), so it all flanks the creature wherever it was summoned. Looking around never moves
// any of it; a summon glides it.
import type { Cut, Instrument, PieceManifest, StemId, Target, Vec3 } from '../../contracts';
import { scaleNote } from '../../audio/synth.ts';

export interface Frame { eye: Vec3; yaw: number }

/**
 * The score ribbon: a band 56 cm wide, 42 cm ahead and 16 cm ABOVE the eye (`below` is negative), showing ±8 s.
 * It floats over the summoned creature against the sky: lower, it sat inside the creature's 25 cm body at the
 * reach spot (0.45 m ahead, 0.15 m below the eye) and couldn't be seen (IWER shots, 12 Nov).
 */
export const RIBBON = { ahead: 0.42, below: -0.16, halfWidth: 0.28, windowSec: 8, laneRadius: 0.035 } as const;
/** Seconds of piece time per metre along the ribbon. */
export const SEC_PER_M = RIBBON.windowSec / RIBBON.halfWidth;
/**
 * The playhead bead: 7 cm below the lane and 11 cm nearer the user, so a pinch on the lane next to "now"
 * still takes the lane (the input engine tries the playhead first), the bead stays inside the 33° upper
 * edge of the view, and it sits just outside the summoned creature's body.
 */
export const PLAYHEAD = { up: -0.07, toward: 0.11, radius: 0.06 } as const;
/**
 * Two pads (the timpani pair: tonic and dominant), one each side of the summoned creature, so a strike can
 * never land inside its 25 cm fist sphere (reach spot 0.45 m ahead, 0.15 m below the eye), and both sit
 * inside the 70×66° view and 0.61 m reach that F27 checks.
 */
export const PADS = { ahead: 0.42, below: 0.15, side: 0.27, radius: 0.065, count: 2 } as const;
/** The quiet-reset shell: right of the view at eye level (inside 70×66° and reach), clear of pads and lane. */
export const RESET = { right: 0.27, below: 0.02, ahead: 0.42, radius: 0.05 } as const;
/** Pad pitches are the piece's tonic and dominant, kept as near this MIDI range as possible (timpani). */
export const PAD_RANGE: [number, number] = [40, 52];

/**
 * The harp (biyon-26): 8 upright strings, 5 cm apart, in a plane facing the seat 32 cm ahead and 15 cm below
 * the eye, so a sideways sweep of the index tip plucks them in turn. Graded like a real harp (15 Nov): the bass
 * string 15 cm long, the treble 8 cm, their bottoms rising along a sloping soundbox and their tops falling
 * under a curved neck. Every string spans the same 8 cm band (halfLength either side of 14 cm below the eye),
 * so a sweep anywhere in that band plucks all 8. In front of the summoned
 * creature and lower: outermost string 29° to the side, the bottoms 32° down (inside 70×66°), all within 0.4 m.
 * The creature's 25 cm fist sphere overlaps them, so while a harp or keyboard is up the input engine only
 * arms a fist with the index finger curled too (a pointing hand playing them is not a fist).
 */
export const HARP = { ahead: 0.32, below: 0.14, spacing: 0.05, halfLength: 0.04, longest: 0.15, shortest: 0.08, radius: 0.03, depthTol: 0.03, count: 8 } as const;
/** String i's ends in the frame (local y, metres): the bass (i = 0) longest and lowest, the treble shortest. */
export function harpString(i: number, n: number = HARP.count): { lo: number; hi: number } {
  const k = n > 1 ? i / (n - 1) : 0;
  const len = HARP.longest - (HARP.longest - HARP.shortest) * k;
  // Centred on the band: every string's middle is HARP.below under the eye, so the 8 cm band is shared.
  return { lo: -HARP.below - len / 2, hi: -HARP.below + len / 2 };
}
/**
 * The keyboard (biyon-27): one key-locked octave of 8 big keys (5 cm wide, 8 cm deep, 4 mm gaps), flat, 34 cm
 * ahead and 17 cm below the eye: the outer front corners 33.4° to the side, the front edge 29.5° down.
 */
export const KEYS = { ahead: 0.34, below: 0.17, spacing: 0.05, width: 0.046, depth: 0.08, count: 8 } as const;

export const IDS = {
  playhead: 'playhead', reset: 'reset', lane: (s: StemId) => `lane:${s}`, region: (id: string) => `region:${id}`, pad: (i: number) => `pad:${i}`,
  string: (i: number) => `string:${i}`, key: (i: number) => `key:${i}`,
};

export const forwardOf = (f: Frame): Vec3 => [-Math.sin(f.yaw), 0, -Math.cos(f.yaw)];
export const rightOf = (f: Frame): Vec3 => [Math.cos(f.yaw), 0, -Math.sin(f.yaw)];

/** A frame-local point (x right, y up, z ahead) in world metres. */
export function toWorld(f: Frame, [x, y, z]: Vec3): Vec3 {
  const r = rightOf(f), fw = forwardOf(f);
  return [f.eye[0] + r[0] * x + fw[0] * z, f.eye[1] + y, f.eye[2] + r[2] * x + fw[2] * z];
}

/** Shortest-way blend between two frames, k 0..1. */
export function lerpFrame(a: Frame, b: Frame, k: number): Frame {
  const x = Math.min(1, Math.max(0, k));
  const e = x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; // the creatures' glide easing
  let dy = b.yaw - a.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return {
    eye: [a.eye[0] + (b.eye[0] - a.eye[0]) * e, a.eye[1] + (b.eye[1] - a.eye[1]) * e, a.eye[2] + (b.eye[2] - a.eye[2]) * e],
    yaw: a.yaw + dy * e,
  };
}

/** Local x on the ribbon of piece time t, with `now` at the centre. */
export const ribbonX = (t: number, now: number) => (t - now) / SEC_PER_M;
/** The lane's centre line, frame-local. */
export const laneLocal = (x = 0): Vec3 => [x, -RIBBON.below, RIBBON.ahead];
export const playheadLocal = (): Vec3 => [0, -RIBBON.below + PLAYHEAD.up, RIBBON.ahead - PLAYHEAD.toward];

function along(f: Frame): Record<'dx' | 'dy' | 'dz', number> {
  const r = rightOf(f);
  return { dx: r[0], dy: r[1], dz: r[2] };
}

/** The playhead: a 6 cm sphere; dragging along the ribbon scrubs at SEC_PER_M. */
export function playheadTarget(f: Frame): Target {
  return { id: IDS.playhead, kind: 'playhead', center: toWorld(f, playheadLocal()), radius: PLAYHEAD.radius, extra: { ...along(f), secPerM: SEC_PER_M } };
}

/** The summoned stem's lane: a capsule along the ribbon whose centre is the piece time `now`. */
export function laneTarget(f: Frame, stem: StemId, now: number): Target {
  return {
    id: IDS.lane(stem), kind: 'lane', stem, center: toWorld(f, laneLocal()), radius: RIBBON.laneRadius,
    extra: { ...along(f), halfLength: RIBBON.halfWidth, secPerM: SEC_PER_M, tCenter: now },
  };
}

/** The visible part of [t0, t1] as local x, clipped to the ribbon; null when it is out of the window. */
export function spanX(t0: number, t1: number, now: number): { x0: number; x1: number } | null {
  const x0 = Math.max(-RIBBON.halfWidth, ribbonX(t0, now)), x1 = Math.min(RIBBON.halfWidth, ribbonX(t1, now));
  return x1 > x0 ? { x0, x1 } : null;
}

/** A hollow region's collider: a capsule over its visible span (so pulling it away undoes the cut). */
export function regionTarget(f: Frame, cut: Cut, now: number): Target | null {
  const s = spanX(cut.t0, cut.t1, now);
  if (!s) return null;
  const mid = (s.x0 + s.x1) / 2;
  return {
    id: IDS.region(cut.id), kind: 'region', stem: cut.stem, center: toWorld(f, laneLocal(mid)), radius: RIBBON.laneRadius,
    extra: { ...along(f), halfLength: (s.x1 - s.x0) / 2, secPerM: SEC_PER_M, tCenter: now + mid * SEC_PER_M },
  };
}

/**
 * Three timpani-like pad pitches from the tonic: every tonic and dominant (fifth) pitch, nearest to
 * PAD_RANGE first (inside counts as 0), the closest three in ascending order. Dvořák (E) → 40, 47, 52;
 * Beethoven (C) → 43, 48, 55.
 */
export function padPitches(tonic: number): number[] {
  const cands: number[] = [];
  for (let p = 24; p <= 72; p++) {
    const pc = ((p - tonic) % 12 + 12) % 12;
    if (pc === 0 || pc === 7) cands.push(p);
  }
  const [lo, hi] = PAD_RANGE;
  const away = (p: number) => (p < lo ? lo - p : p > hi ? p - hi : 0);
  return cands.sort((a, b) => away(a) - away(b) || a - b).slice(0, 3).sort((a, b) => a - b);
}

export const padLocal = (i: number, n: number = PADS.count): Vec3 => {
  const x = n <= 1 ? 0 : (i / (n - 1) * 2 - 1) * PADS.side;
  return [x, -PADS.below, PADS.ahead];
};

/** One pad per pitch, low to high from the left; facing straight up (a strike is the index tip going down). */
/** The timpani pair the pads play: the highest two candidates inside PAD_RANGE (Dvořák E → 47, 52; Beethoven C → 43, 48). */
export function padPair(candidates: number[]): number[] {
  const inside = candidates.filter((p) => p >= PAD_RANGE[0] && p <= PAD_RANGE[1]);
  return (inside.length >= PADS.count ? inside.slice(-PADS.count) : candidates.slice(0, PADS.count));
}

export function padTargets(f: Frame, pitches: number[]): Target[] {
  return pitches.map((pitch, i) => ({
    id: IDS.pad(i), kind: 'pad', center: toWorld(f, padLocal(i, pitches.length)), radius: PADS.radius,
    extra: { pitch, dx: 0, dy: 1, dz: 0 },
  }));
}

export const resetLocal = (): Vec3 => [RESET.right, -RESET.below, RESET.ahead];
export function resetTarget(f: Frame): Target {
  return { id: IDS.reset, kind: 'reset', center: toWorld(f, resetLocal()), radius: RESET.radius };
}

export const instrumentFor = (m: PieceManifest | null, stem: StemId): Instrument | null =>
  m?.replace.find((r) => r.stem === stem)?.instrument ?? null;

/** The pads show while a pads take runs, or once any cut exists on a stem the pads replace. */
export function padsWanted(
  parts: { cuts(): Cut[]; taking(): { instrument: Instrument } | null },
  manifest: PieceManifest | null,
): boolean {
  if (parts.taking()?.instrument === 'pads') return true;
  return parts.cuts().some((c) => instrumentFor(manifest, c.stem) === 'pads');
}

/**
 * The 8 notes (one octave, scale degrees 1..8) a harp or keyboard plays: the octave of the piece's scale that
 * fits the replaced stem's range, preferring one wholly inside it and then the one centred nearest. Dvořák (E
 * minor): flutes 64–95 → 76..88, reeds 35–86 → 52..64; Beethoven (C minor): flutes 70–92 → 72..84, reeds → 60..72.
 */
export function octaveFor(scale: PieceManifest['scale'], range: [number, number] | undefined, count = 8): number[] {
  const n = scale.steps.length;
  const octave = (k: number) => Array.from({ length: count }, (_, i) => scaleNote(scale, k * n + i));
  if (!range) return octave(0);
  const mid = (range[0] + range[1]) / 2;
  let best = octave(0), score = Infinity;
  for (let k = -4; k <= 4; k++) {
    const o = octave(k), lo = o[0], hi = o[o.length - 1];
    const s = (lo >= range[0] && hi <= range[1] ? 0 : 1000) + Math.abs((lo + hi) / 2 - mid);
    if (s < score) { score = s; best = o; }
  }
  return best;
}

const spreadX = (i: number, n: number, spacing: number) => (i - (n - 1) / 2) * spacing;

/** One string per pitch, low to high from the left. The axis (dx, dy, dz) runs up the string; (nx, ny, nz) is
 *  the sweep direction across the strings; halfLength is half the string; depthTol how far in front of or
 *  behind the plane a crossing still counts. */
export function harpTargets(f: Frame, pitches: number[]): Target[] {
  const r = rightOf(f);
  return pitches.map((pitch, i) => ({
    id: IDS.string(i), kind: 'string', center: toWorld(f, [spreadX(i, pitches.length, HARP.spacing), -HARP.below, HARP.ahead]), radius: HARP.radius,
    extra: { pitch, dx: 0, dy: 1, dz: 0, nx: r[0], ny: r[1], nz: r[2], halfLength: (harpString(i, pitches.length).hi - harpString(i, pitches.length).lo) / 2, depthTol: HARP.depthTol },
  }));
}

/** One key per pitch, low to high from the left. center is the middle of the key top; (dx, dy, dz) its normal
 *  (up); (nx, ny, nz) the direction along the row; halfW and halfD half the key's width and depth. */
export function keyTargets(f: Frame, pitches: number[]): Target[] {
  const r = rightOf(f);
  return pitches.map((pitch, i) => ({
    id: IDS.key(i), kind: 'key', center: toWorld(f, [spreadX(i, pitches.length, KEYS.spacing), -KEYS.below, KEYS.ahead]), radius: KEYS.width / 2,
    extra: { pitch, dx: 0, dy: 1, dz: 0, nx: r[0], ny: r[1], nz: r[2], halfW: KEYS.width / 2, halfD: KEYS.depth / 2 },
  }));
}

/** The stem a piece's manifest gives to an instrument, if any. */
export const stemFor = (m: PieceManifest | null, inst: Instrument): StemId | null =>
  m?.replace.find((r) => r.instrument === inst)?.stem ?? null;

/**
 * Which melodic instrument shows in front of the seat (they share the spot): the one a take is running for,
 * else the one replacing the most recently cut stem, else none.
 */
export function melodicWanted(
  parts: { cuts(): Cut[]; taking(): { instrument: Instrument } | null },
  manifest: PieceManifest | null,
): 'harp' | 'keys' | null {
  const t = parts.taking()?.instrument;
  if (t === 'harp' || t === 'keys') return t;
  const cuts = parts.cuts();
  for (let i = cuts.length - 1; i >= 0; i--) {
    const inst = instrumentFor(manifest, cuts[i].stem);
    if (inst === 'harp' || inst === 'keys') return inst;
  }
  return null;
}

export interface CountIn { cutId: string; total: number; beatsLeft: number; at: number; beatLen: number }

/**
 * The count-in ring: `fill` grows smoothly from 0 to 1 over the bar (each beat adds 1/total, eased in
 * over that beat), `pulse` is 1 on each tick decaying fast. null once the bar has passed.
 */
export function countInLook(c: CountIn | null, clock: number): { fill: number; pulse: number } | null {
  if (!c) return null;
  const since = clock - c.at;
  const len = c.beatLen > 0 ? c.beatLen : 0.5;
  if (c.beatsLeft <= 1 && since > len * 1.5) return null; // the last tick's beat is over: the region has started
  if (since > len * 4) return null; // ticks stopped (seek, removal): let it go
  const done = c.total - c.beatsLeft; // whole beats before this tick
  const fill = Math.min(1, (done + Math.min(1, since / len)) / c.total);
  return { fill, pulse: Math.exp(-since * 9) };
}

/** Height in the lane (local y offset) for a pitch over a stem's range: ±70 % of the lane radius. */
export function pitchY(pitch: number, range: [number, number] | undefined): number {
  if (!range || range[1] <= range[0]) return 0;
  const u = Math.min(1, Math.max(0, (pitch - range[0]) / (range[1] - range[0])));
  return (u - 0.5) * 2 * RIBBON.laneRadius * 0.7;
}

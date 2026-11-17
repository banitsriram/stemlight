import { Color } from 'three';
import type { AppContext, Beats, NoteEvent, PieceManifest, StemId, Vec3 } from '../../contracts';
import { NOTE_CAP, type NoteGlyphs } from './NoteGlyphs';

const LIFE = 4; // seconds. At SPEED a note travels under 2 m, so the plan's 3 m limit can't be reached.
const FADE = 1;
const SPEED = 0.45;
const HEIGHT = 0.4;
const TRAIL_MIN_DUR = 1; // seconds: notes this long leave outline copies behind while they sound
const TRAIL = [0.12, 0.24, 0.36]; // seconds back along the path
const POP_MAX_DUR = 0.25; // shorter notes pop: a size burst at birth

/** Size factor at birth for a short note: 1.5× decaying to 1 within about 0.3 s. */
export const popScale = (age: number, dur: number) => (dur < POP_MAX_DUR ? 1 + 0.5 * Math.exp(-age * 12) : 1);

const ACCENT: Record<StemId, Color> = {
  vln: new Color('#5EE6FF'), vla_vc: new Color('#2FC6B0'), cb: new Color('#3D6BFF'),
  fl: new Color('#C9B6FF'), reeds: new Color('#E05BD8'), hn: new Color('#7CF0A0'),
  brass: new Color('#F4F1C9'), perc: new Color('#EEF2FF'), harp: new Color('#FF8FC8'),
};

export interface Placed { x: number; y: number; z: number; size: number; alpha: number }

/** Where a note is, age seconds after its onset. Depends only on its arguments, so pause and seek need no state. */
export function placeNote(age: number, note: NoteEvent, seat: Vec3, range: [number, number], out: Placed): void {
  const [sx, sy, sz] = seat;
  const reach = Math.hypot(sx, sz) || 1;
  const side = sx < 0 ? -1 : 1;
  // Flow around the listener, away from the middle of the arc and slightly closer.
  const fx = (-sz / reach) * side - (sx / reach) * 0.35;
  const fz = (sx / reach) * side - (sz / reach) * 0.35;
  const travel = age * SPEED;
  const wobble = 0.12 * Math.min(age, 1);
  const pitch = range[1] > range[0] ? (note.pitch - range[0]) / (range[1] - range[0]) : 0.5;
  const loud = note.vel / 127;
  const fade = Math.min(1, (LIFE - age) / FADE);

  out.x = sx + fx * travel + wobble * Math.sin(age * 0.9 + note.id * 2.4);
  out.y = sy + (pitch - 0.5) * 2 * HEIGHT + travel * 0.12 + wobble * Math.sin(age * 0.7 + note.id * 1.7);
  out.z = sz + fz * travel + wobble * Math.cos(age * 0.8 + note.id * 3.1);
  out.size = (0.05 + 0.07 * loud) * fade;
  out.alpha = (0.35 + 0.65 * loud) * fade;
}

/** Index of the first value >= t. */
function lowerBound<T>(items: T[], t: number, key: (item: T) => number): number {
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const self = (n: number) => n;
const onset = (n: NoteEvent) => n.t;

/** 8 % on a beat and 15 % on a downbeat, decaying until the next. */
export function beatSwell(now: number, beats: number[], downbeats: Set<number>): number {
  const i = lowerBound(beats, now + 1e-9, self) - 1;
  if (i < 0) return 1;
  return 1 + (downbeats.has(beats[i]) ? 0.15 : 0.08) * Math.exp(-(now - beats[i]) * 8);
}

interface Piece {
  notes: NoteEvent[];
  beats: number[];
  downbeats: Set<number>;
  stems: Map<StemId, PieceManifest['stems'][number]>;
}

/**
 * Call update() every frame. Each frame is drawn from transport time alone.
 * seatOf gives a creature's live centre, so notes are born at its mouth wherever it has glided to.
 */
export function createNotesLayer(ctx: AppContext, glyphs: NoteGlyphs, seatOf?: (stem: StemId) => Vec3 | undefined): { update(): number } {
  let piece: Piece | null = null;
  let latest = 0;
  const p: Placed = { x: 0, y: 0, z: 0, size: 0, alpha: 0 };
  // Transport time each muted stem went silent: its notes stop there as glass, and new ones are born still.
  // ponytail: frozen notes still leave after LIFE seconds from onset; keep them longer if a long hold looks empty.
  const frozen = new Map<StemId, number>();
  let solo: StemId | null = null;
  ctx.bus.on('stem:mute', ({ stem, state }) => {
    if (state === 'on') frozen.delete(stem);
    else if (!frozen.has(stem)) frozen.set(stem, ctx.transport.time());
  });
  ctx.bus.on('stem:solo', ({ stem }) => { solo = stem; });
  ctx.bus.on('app:reset', () => { frozen.clear(); solo = null; });

  ctx.bus.on('piece:ready', async ({ id, manifest }) => {
    const request = ++latest;
    piece = null;
    frozen.clear();
    solo = null;
    const [notes, beats]: [NoteEvent[], Beats] = await Promise.all(
      ['notes', 'beats'].map((f) => fetch(`/pieces/${id}/${f}.json`).then((r) => r.json())) as [Promise<NoteEvent[]>, Promise<Beats>],
    );
    if (request !== latest) return; // another piece was picked while this one loaded
    piece = { notes, beats: beats.beats, downbeats: new Set(beats.downbeats), stems: new Map(manifest.stems.map((s) => [s.id, s])) };
  });

  return {
    /** Draws this frame's notes; returns the beat swell (1 between beats) so the sea can pulse with it. */
    update() {
      glyphs.begin();
      let pulse = 1;
      if (piece) {
        const now = ctx.transport.time();
        const end = lowerBound(piece.notes, now + 1e-9, onset);
        const start = Math.max(lowerBound(piece.notes, now - LIFE, onset), end - NOTE_CAP); // oldest culled first
        const swell = beatSwell(now, piece.beats, piece.downbeats);
        pulse = swell;
        const glow = 1 + (swell - 1) * 4; // brighter on the beat: about 1.3 on a beat, 1.6 on a downbeat
        for (let i = start; i < end; i++) {
          const note = piece.notes[i];
          const stem = piece.stems.get(note.stem)!;
          const stop = frozen.get(note.stem);
          const age = stop === undefined ? now - note.t : Math.max(0, Math.min(now, stop) - note.t);
          const seat = seatOf?.(note.stem) ?? stem.homeSeat;
          placeNote(age, note, seat, stem.pitchRange, p);
          const c = ACCENT[note.stem];
          const dim = solo !== null && solo !== note.stem ? 0.25 : 1;
          if (stop !== undefined) {
            glyphs.push('glass', note.glyph, p.x, p.y, p.z, p.size, c.r, c.g, c.b, p.alpha * dim);
            continue;
          }
          const k = dim < 1 ? 1 : glow; // a section outside a solo doesn't flare on the beat
          glyphs.push('normal', note.glyph, p.x, p.y, p.z, p.size * swell * popScale(age, note.dur), c.r * k, c.g * k, c.b * k, p.alpha * dim);
          if (note.dur >= TRAIL_MIN_DUR && age < note.dur) {
            const alpha = p.alpha;
            TRAIL.forEach((back, k) => {
              if (age < back) return;
              placeNote(age - back, note, seat, stem.pitchRange, p);
              glyphs.push('ghost', note.glyph, p.x, p.y, p.z, p.size * (0.8 - 0.15 * k), c.r, c.g, c.b, alpha * dim * (0.5 - 0.14 * k));
            });
          }
        }
      }
      glyphs.end();
      return pulse;
    },
  };
}

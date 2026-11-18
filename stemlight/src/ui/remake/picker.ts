// The song picker's logic (18 Nov, sir's design), kept free of three.js so node tests can drive it. When the
// tutorial song ends, and after every song, a low arc of glass bubbles floats ahead, one per song: a fingertip
// entering one plays it. While a song plays, a small bubble on the left of the view (the reset shell's mirror)
// brings the picker back when touched and held. songs.ts wires it in; pickerView.ts draws it.
import type { Hand, PieceId, Target, Vec3 } from '../../contracts';
import { toWorld, type Frame } from './layout.ts';

export interface SongInfo { id: PieceId; title: string; composer: string; durationSec?: number }
export interface Tip { hand: Hand; at: Vec3; ok: boolean }

/**
 * The arc: bubbles 45 cm from the eye and 17 cm below it, 26° apart, so three sit inside the 70×66° view (the
 * outer two at 26°) and the 0.61 m reach F27 checks. A touch counts a little outside the glass (touch > radius).
 * Touches count only `armSec` after the picker opens, and only from a fingertip that came in from outside, so a
 * hand already resting where a bubble appears never picks a song by accident.
 */
export const PICKER = { reach: 0.45, below: 0.17, stepDeg: 26, radius: 0.055, touch: 0.07, armSec: 0.8 } as const;
/** The songs bubble: the reset shell's mirror, left of the view at eye level (layout.ts RESET), held to open. */
export const SONGS_BUBBLE = { left: 0.27, below: 0.02, ahead: 0.42, radius: 0.035, touch: 0.05, holdSec: 0.8 } as const;
export const SONGS_ID = 'songs';
export const songTargetId = (id: PieceId) => `song:${id}`;

/** Frame-local centre (x right, y up, z ahead) of song i of n. */
export function bubbleLocal(i: number, n: number): Vec3 {
  const a = ((i - (n - 1) / 2) * PICKER.stepDeg * Math.PI) / 180;
  return [Math.sin(a) * PICKER.reach, -PICKER.below, Math.cos(a) * PICKER.reach];
}
export const songsBubbleLocal = (): Vec3 => [-SONGS_BUBBLE.left, -SONGS_BUBBLE.below, SONGS_BUBBLE.ahead];

/** "1:24" from seconds. */
export function mmss(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** A song's label: its title, then the composer and length. */
export const songLabel = (s: SongInfo): string[] => [s.title, s.durationSec ? `${s.composer}, ${mmss(s.durationSec)}` : s.composer];

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export interface Picker {
  isOpen(): boolean;
  /** Opens at a frame (the seat, or the head when there is no seat yet), fixed until it closes. */
  open(now: number, frame: Frame): void;
  close(): void;
  /** World centres of the open picker's bubbles, in song order; empty while closed. */
  bubbles(): Vec3[];
  /** What the input engine should know about: the open picker's bubbles, else the songs bubble if shown. */
  targets(songsAt: Vec3 | null): Target[];
  /** One frame of fingertips: the song whose bubble a fingertip just entered (armed, from outside), or null. */
  touch(now: number, tips: Tip[]): PieceId | null;
  /** One frame on the songs bubble: hold progress 0..1, and fire once when a held touch completes. */
  hold(dt: number, at: Vec3 | null, tips: Tip[]): { progress: number; fire: boolean };
}

export function createPicker(songs: readonly SongInfo[]): Picker {
  let open = false, openedAt = 0, frame: Frame | null = null;
  const inside = new Map<string, boolean>(); // `${hand}:${i}` → that fingertip was inside bubble i last frame
  let held = 0, spent = false;
  const bubbles = (): Vec3[] => (frame ? songs.map((_, i) => toWorld(frame as Frame, bubbleLocal(i, songs.length))) : []);

  return {
    isOpen: () => open,
    open(now, f) { open = true; openedAt = now; frame = f; inside.clear(); held = 0; spent = false; },
    close() { open = false; frame = null; inside.clear(); },
    bubbles,
    targets(songsAt) {
      if (open) return bubbles().map((center, i) => ({ id: songTargetId(songs[i].id), kind: 'song' as const, center, radius: PICKER.radius }));
      return songsAt ? [{ id: SONGS_ID, kind: 'song' as const, center: songsAt, radius: SONGS_BUBBLE.radius }] : [];
    },
    touch(now, tips) {
      if (!open) return null;
      const cs = bubbles();
      let picked: PieceId | null = null;
      for (const t of tips) {
        cs.forEach((c, i) => {
          const key = `${t.hand}:${i}`, was = inside.get(key), is = t.ok && dist(t.at, c) < PICKER.touch;
          inside.set(key, is);
          // First sight counts as "was": a fingertip already inside has to leave and come back.
          if (was === undefined) return;
          if (is && !was && now - openedAt >= PICKER.armSec && picked === null) picked = songs[i].id;
        });
      }
      return picked;
    },
    hold(dt, at, tips) {
      const on = !open && !!at && tips.some((t) => t.ok && dist(t.at, at) < SONGS_BUBBLE.touch);
      if (!on) { held = 0; spent = false; return { progress: 0, fire: false }; }
      if (spent) return { progress: 0, fire: false }; // let go before it can fire again
      held += dt;
      if (held < SONGS_BUBBLE.holdSec) return { progress: held / SONGS_BUBBLE.holdSec, fire: false };
      held = 0; spent = true;
      return { progress: 1, fire: true };
    },
  };
}

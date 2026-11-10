// Pure collider maths over the TargetRegistry's targets. B registers them; A hit-tests hands against them.
//
// Every target is a sphere (center, radius) unless its `extra` says more:
// - `dx, dy, dz`: a direction. For a `playhead` or `lane`, the direction of increasing piece time along the ribbon;
//   for a `pad`, the face normal (default straight up).
// - `halfLength` (with a direction): the collider is a capsule, `radius` around the segment center ± halfLength
//   along the direction, for long lanes and regions.
// - `secPerM`: seconds of piece time per metre along the direction; `tCenter`: piece time at the center (lanes).
// - `pitch`: a pad's MIDI pitch.
import type { Target, Vec3 } from '../contracts';
import { dist } from './handmath.ts';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The target's unit direction from extra.dx/dy/dz, or null when it has none. */
export function axisOf(t: Target): Vec3 | null {
  const e = t.extra;
  if (!e || (e.dx === undefined && e.dy === undefined && e.dz === undefined)) return null;
  const v: Vec3 = [e.dx ?? 0, e.dy ?? 0, e.dz ?? 0];
  const len = Math.hypot(...v);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : null;
}

/** Distance from p to the collider's surface: negative inside. */
export function surfaceDist(t: Target, p: Vec3): number {
  const axis = axisOf(t), half = t.extra?.halfLength;
  if (!axis || !half) return dist(p, t.center) - t.radius;
  const along = Math.max(-half, Math.min(half, dot([p[0] - t.center[0], p[1] - t.center[1], p[2] - t.center[2]], axis)));
  const closest: Vec3 = [t.center[0] + axis[0] * along, t.center[1] + axis[1] * along, t.center[2] + axis[2] * along];
  return dist(p, closest) - t.radius;
}

export const inside = (t: Target, p: Vec3) => surfaceDist(t, p) <= 0;

/** Piece time at p along a playhead or lane: tCenter + (p - center) · direction × secPerM. */
export function timeAt(t: Target, p: Vec3): number {
  const axis = axisOf(t) ?? [1, 0, 0];
  const secPerM = t.extra?.secPerM ?? 0;
  return (t.extra?.tCenter ?? 0) + dot([p[0] - t.center[0], p[1] - t.center[1], p[2] - t.center[2]], axis) * secPerM;
}

/** Seconds of piece time for a hand movement `delta` along the target's direction. */
export function timeDelta(t: Target, delta: Vec3): number {
  return dot(delta, axisOf(t) ?? [1, 0, 0]) * (t.extra?.secPerM ?? 0);
}

/** A pad's face: signed height of p above it, and p's distance from the normal through the center. */
export function padLocal(t: Target, p: Vec3): { height: number; radial: number } {
  const n = axisOf(t) ?? [0, 1, 0];
  const d: Vec3 = [p[0] - t.center[0], p[1] - t.center[1], p[2] - t.center[2]];
  const height = dot(d, n);
  return { height, radial: Math.hypot(d[0] - n[0] * height, d[1] - n[1] * height, d[2] - n[2] * height) };
}

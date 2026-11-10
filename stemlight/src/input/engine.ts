// Gesture recognisers (PLAN section 3) as one pure state machine: a per-frame InputFrame in, bus events out.
// No framework imports, so node can test it; src/input/system.ts feeds it from WebXR.
import type { Bus, Hand, MuteState, StemId, Target, Vec3 } from '../contracts';
import { dist, handCurl, mid } from './handmath.ts';
import type { HandFrame, HeadFrame, InputFrame } from './types';

/** The thresholds from PLAN section 3. Seconds and metres. */
export const SPEC = {
  gapHold: 0.3, // a tracking gap up to this long holds the last state; longer is a quiet release
  summonAngleDeg: 12,
  summonDwell: 0.5,
  fistCurl: 0.75, // 3 of 4 fingers at or above
  fistExitCurl: 0.45,
  fistDebounce: 0.08,
  lockTime: 1.5,
  pinchEnter: 0.015,
  pinchExit: 0.03,
  pinchOtherCurlMax: 0.6, // middle, ring and pinky
  doublePinchWindow: 0.45,
  doublePinchMove: 0.04,
  reachAhead: 0.45, // where B glides the summoned creature: ahead of and below the eye
  reachBelow: 0.15,
} as const;

const HANDS: Hand[] = ['left', 'right'];
const other = (h: Hand): Hand => (h === 'left' ? 'right' : 'left');

type FistPhase = 'idle' | 'arming' | 'held' | 'lockedHold' | 'spent';

interface HandState {
  last: HandFrame | null; // last tracked frame
  lostAt: number | null; // when tracking was lost, while it is lost
  released: boolean; // the gap outlasted gapHold and the hand was quietly released
  gapSerial: number; // bumps on every tracking loss, however short
  fist: FistPhase;
  fistSince: number;
  fistStem: StemId | null;
  pinching: boolean;
  lastDown: { t: number; pos: Vec3; gapSerial: number; stem: StemId } | null;
}

const freshHand = (): HandState => ({
  last: null, lostAt: null, released: true, gapSerial: 0,
  fist: 'idle', fistSince: 0, fistStem: null, pinching: false, lastDown: null,
});

/** The reach spot for a head pose: 0.45 m ahead (level) and 0.15 m below the eye. Matches world/shell.ts reachSpot. */
export function reachSpotFor(head: HeadFrame): Vec3 {
  const yaw = Math.atan2(-head.dir[0], -head.dir[2]);
  return [head.pos[0] - Math.sin(yaw) * SPEC.reachAhead, head.pos[1] - SPEC.reachBelow, head.pos[2] - Math.cos(yaw) * SPEC.reachAhead];
}

function angleToDeg(head: HeadFrame, p: Vec3): number {
  const d: Vec3 = [p[0] - head.pos[0], p[1] - head.pos[1], p[2] - head.pos[2]];
  const len = Math.hypot(...d) * Math.hypot(...head.dir);
  if (len === 0) return 180;
  const c = (d[0] * head.dir[0] + d[1] * head.dir[1] + d[2] * head.dir[2]) / len;
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

export interface GestureEngine {
  step(frame: InputFrame, targets: readonly Target[]): void;
  /** Read-only view for dev tools and tests. */
  debug(): { summoned: StemId | null; solo: StemId | null; mute: Partial<Record<StemId, MuteState>>; fist: Record<Hand, FistPhase>; pinching: Record<Hand, boolean> };
}

export function createGestureEngine(bus: Pick<Bus, 'emit' | 'on'>): GestureEngine {
  const hands: Record<Hand, HandState> = { left: freshHand(), right: freshHand() };
  let mute: Partial<Record<StemId, MuteState>> = {};
  let solo: StemId | null = null;
  let summoned: StemId | null = null;
  let reach: Vec3 | null = null; // reach spot taken when the creature was summoned
  let dwell: { stem: StemId; since: number } | null = null;

  // A new piece starts with every stem on, nothing soloed and nothing summoned.
  bus.on('piece:ready', () => {
    mute = {}; solo = null; summoned = null; reach = null; dwell = null;
    for (const h of HANDS) Object.assign(hands[h], { fist: 'idle', fistStem: null, lastDown: null });
  });

  const setMute = (stem: StemId, state: MuteState, lockProgress: number) => {
    mute[stem] = state;
    bus.emit('stem:mute', { stem, state, lockProgress });
  };

  const creature = (targets: readonly Target[], stem: StemId | null) =>
    stem ? targets.find((t) => t.kind === 'creature' && t.stem === stem) : undefined;

  /** Inside the summoned creature's sphere: at its live centre, or at the reach spot in case it hasn't moved there. */
  const insideSummoned = (targets: readonly Target[], p: Vec3): boolean => {
    const t = creature(targets, summoned);
    if (!t) return false;
    return dist(p, t.center) <= t.radius || (reach !== null && dist(p, reach) <= t.radius);
  };

  const idle = (h: Hand) => !hands[h].pinching && hands[h].fist === 'idle';

  /** Tracking lost for longer than gapHold: end whatever the hand was doing without triggering anything new. */
  function quietRelease(h: Hand) {
    const s = hands[h];
    // A hold in progress ends the way an open hand would end it (the part comes back); it never locks.
    if (s.fist === 'held' && s.fistStem) setMute(s.fistStem, 'on', 0);
    s.fist = 'idle'; s.fistStem = null; s.pinching = false; s.lastDown = null;
  }

  function updateFist(h: Hand, f: HandFrame, t: number, targets: readonly Target[]) {
    const s = hands[h];
    const curl = handCurl(f.curls);
    const ownedByOther = hands[other(h)].fist !== 'idle';
    switch (s.fist) {
      case 'idle':
        if (curl >= SPEC.fistCurl && summoned && !ownedByOther && insideSummoned(targets, f.palm)) {
          s.fist = 'arming'; s.fistSince = t; s.fistStem = summoned;
        }
        break;
      case 'arming':
        if (curl < SPEC.fistCurl || summoned !== s.fistStem || !insideSummoned(targets, f.palm)) {
          s.fist = 'idle'; s.fistStem = null;
        } else if (t - s.fistSince >= SPEC.fistDebounce) {
          const stem = s.fistStem!;
          if (mute[stem] === 'locked') {
            setMute(stem, 'on', 0); // a fist on a locked creature returns it
            s.fist = 'spent';
          } else {
            setMute(stem, 'held', 0);
            s.fist = 'held'; s.fistSince = t;
          }
        }
        break;
      case 'held': {
        const stem = s.fistStem!;
        if (curl <= SPEC.fistExitCurl) {
          setMute(stem, 'on', 0); // opened before the lock: back
          s.fist = 'idle'; s.fistStem = null;
          break;
        }
        const progress = (t - s.fistSince) / SPEC.lockTime;
        if (progress >= 1) {
          setMute(stem, 'locked', 1);
          s.fist = 'lockedHold';
        } else {
          setMute(stem, 'held', progress);
        }
        break;
      }
      case 'lockedHold':
      case 'spent':
        if (curl <= SPEC.fistExitCurl) { s.fist = 'idle'; s.fistStem = null; }
        break;
    }
  }

  function updatePinch(h: Hand, f: HandFrame, t: number, targets: readonly Target[]) {
    const s = hands[h];
    if (s.pinching) {
      if (f.pinchDist >= SPEC.pinchExit) s.pinching = false;
      return;
    }
    const othersOpen = Math.max(f.curls[1], f.curls[2], f.curls[3]) <= SPEC.pinchOtherCurlMax;
    if (f.pinchDist > SPEC.pinchEnter || !othersOpen) return;
    s.pinching = true;

    // Pinch-down: candidate for a double-pinch solo on the summoned creature.
    const pos = mid(f.tip, f.thumbTip);
    if (!summoned || !idle(other(h)) || !insideSummoned(targets, pos)) { s.lastDown = null; return; }
    const prev = s.lastDown;
    if (prev && prev.stem === summoned && prev.gapSerial === s.gapSerial
      && t - prev.t <= SPEC.doublePinchWindow && dist(pos, prev.pos) < SPEC.doublePinchMove) {
      solo = solo === null ? summoned : null; // a second double-pinch clears
      bus.emit('stem:solo', { stem: solo });
      s.lastDown = null;
    } else {
      s.lastDown = { t, pos, gapSerial: s.gapSerial, stem: summoned };
    }
  }

  function updateSummon(head: HeadFrame, t: number, targets: readonly Target[]) {
    let best: Target | undefined, bestAngle = Infinity;
    for (const target of targets) {
      if (target.kind !== 'creature' || !target.stem || target.stem === summoned) continue;
      const a = angleToDeg(head, target.center);
      if (a < bestAngle) { best = target; bestAngle = a; }
    }
    if (!best || bestAngle > SPEC.summonAngleDeg) { dwell = null; return; }
    if (!dwell || dwell.stem !== best.stem) { dwell = { stem: best.stem!, since: t }; return; }
    // A held fist keeps its creature close until the hand opens.
    const busy = HANDS.some((h) => hands[h].fist === 'held' || hands[h].fist === 'arming');
    if (t - dwell.since >= SPEC.summonDwell && !busy) {
      summoned = best.stem!;
      reach = reachSpotFor(head);
      dwell = null;
      for (const h of HANDS) hands[h].lastDown = null;
      bus.emit('gaze:summon', { stem: summoned });
    }
  }

  function emitNear(h: Hand, f: HandFrame, targets: readonly Target[]) {
    let best: Target | undefined, bestDist = Infinity;
    for (const target of targets) {
      const d = Math.min(dist(f.palm, target.center), dist(f.tip, target.center)) - target.radius;
      if (d < bestDist) { best = target; bestDist = d; }
    }
    // dist: palm or index tip to the collider's surface, 0 when inside.
    if (best) bus.emit('hand:near', { hand: h, targetId: best.id, dist: Math.max(0, bestDist) });
  }

  return {
    step({ t, hands: raw, head }, targets) {
      const live: Partial<Record<Hand, HandFrame>> = {};
      for (const h of HANDS) {
        const s = hands[h], f = raw[h];
        if (f && f.tracked) {
          s.last = f; s.lostAt = null; s.released = false;
          live[h] = f;
          continue;
        }
        if (s.lostAt === null) { s.lostAt = t; s.gapSerial++; }
        if (!s.released && s.last && t - s.lostAt <= SPEC.gapHold) live[h] = s.last; // hold the last state
        else if (!s.released) { quietRelease(h); s.released = true; }
      }

      if (head) updateSummon(head, t, targets);
      for (const h of HANDS) {
        const f = live[h];
        if (f) {
          updatePinch(h, f, t, targets);
          updateFist(h, f, t, targets);
        }
        // The other hand doing anything spoils a pending double-pinch.
        if (!idle(other(h))) hands[h].lastDown = null;
      }

      for (const h of HANDS) {
        const f = live[h], s = hands[h], shown = f ?? s.last;
        bus.emit('hand:pose', {
          hand: h,
          tracked: !!f,
          confidence: f ? f.confidence : 0,
          palm: shown ? shown.palm : [0, 0, 0],
          tip: shown ? shown.tip : [0, 0, 0],
          curl: shown ? handCurl(shown.curls) : 0,
          pinching: s.pinching,
        });
        if (f) emitNear(h, f, targets);
      }
    },
    debug: () => ({
      summoned, solo, mute: { ...mute },
      fist: { left: hands.left.fist, right: hands.right.fist },
      pinching: { left: hands.left.pinching, right: hands.right.pinching },
    }),
  };
}

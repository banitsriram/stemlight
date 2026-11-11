// Gesture recognisers (PLAN section 3) as one pure state machine: a per-frame InputFrame in, bus events out.
// No framework imports, so node can test it; src/input/system.ts feeds it from WebXR.
import type { Bus, Hand, Instrument, MuteState, PieceId, StemId, Target, Transport, Vec3 } from '../contracts';
import { snapCut } from '../audio/mix.ts';
import { dist, handCurl, mid } from './handmath.ts';
import { inside, padLocal, surfaceDist, timeAt, timeDelta } from './targets.ts';
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
  eqWindow: 0.5, // both hands pinch inside the creature within this
  eqDbPerM: 40, // hand separation change → dB (30 cm = the full ±12 dB)
  eqLimitDb: 12,
  eqResetDist: 0.06, // both pinches brought this close → EQ reset
  eqResetArm: 0.08, // ...after having been at least this far apart
  emitInterval: 1 / 30, // continuous streams (stem:eq, cut:preview, reset:progress) at about 30 Hz
  tapTime: 0.25, // a ribbon pinch shorter than this and moving less than tapMove toggles pause
  tapMove: 0.01,
  trimWindow: 0.6,
  undoPull: 0.1,
  padMinSpeed: 0.4,
  padMaxSpeed: 2.5,
  padVelMin: 30,
  padVelMax: 127,
  padLockout: 0.09,
  padPitch: 50,
  resetHold: 2,
} as const;

const HANDS: Hand[] = ['left', 'right'];
const other = (h: Hand): Hand => (h === 'left' ? 'right' : 'left');
/**
 * Throttle for the continuous streams: true about 30 times a second on average, whatever the frame rate.
 * `o.lastEmit` holds the current slot; it advances one interval per emit (or jumps to now after a pause).
 */
function due(o: { lastEmit: number }, t: number): boolean {
  const next = o.lastEmit + SPEC.emitInterval;
  if (t < next) return false;
  o.lastEmit = t - next < SPEC.emitInterval ? next : t;
  return true;
}

const clampDb = (db: number) => Math.max(-SPEC.eqLimitDb, Math.min(SPEC.eqLimitDb, db));

type FistPhase = 'idle' | 'arming' | 'held' | 'lockedHold' | 'spent';

/** What a pinch took hold of when it closed. */
type Grab =
  | { kind: 'creature'; used: boolean } // solo and EQ; `used` once it has started an EQ
  | { kind: 'playhead'; target: Target; startTime: number; wasPlaying: boolean; lastSeek: number; maxMove: number }
  | { kind: 'lane'; target: Target; used: boolean }
  | { kind: 'region'; target: Target; done: boolean }
  | { kind: 'reset'; target: Target; done: boolean; lastEmit: number };

interface HandState {
  last: HandFrame | null; // last tracked frame
  lostAt: number | null; // when tracking was lost, while it is lost
  released: boolean; // the gap outlasted gapHold and the hand was quietly released
  gapSerial: number; // bumps on every tracking loss, however short
  fist: FistPhase;
  fistSince: number;
  fistStem: StemId | null;
  pinching: boolean;
  downAt: number;
  downPos: Vec3;
  grab: Grab | null;
  lastDown: { t: number; pos: Vec3; gapSerial: number; stem: StemId } | null;
  padPrev: Map<string, { t: number; height: number }>; // last fresh index-tip height per pad
}

const freshHand = (): HandState => ({
  last: null, lostAt: null, released: true, gapSerial: 0,
  fist: 'idle', fistSince: 0, fistStem: null, pinching: false,
  downAt: 0, downPos: [0, 0, 0], grab: null, lastDown: null, padPrev: new Map(),
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

const pinchPoint = (f: HandFrame): Vec3 => mid(f.tip, f.thumbTip);

/** Pad strike speed (m/s) → MIDI velocity: 0.4–2.5 m/s maps to 30–127. */
export function padVelocity(speed: number): number {
  const s = Math.max(SPEC.padMinSpeed, Math.min(SPEC.padMaxSpeed, speed));
  return Math.round(SPEC.padVelMin + ((s - SPEC.padMinSpeed) / (SPEC.padMaxSpeed - SPEC.padMinSpeed)) * (SPEC.padVelMax - SPEC.padVelMin));
}

type Eq = { low: number; mid: number; high: number };

export interface GestureOptions {
  /** Ribbon pause / scrub. Without it the playhead does nothing. */
  transport?: Pick<Transport, 'time' | 'playing' | 'play' | 'pause' | 'seek' | 'duration'>;
  /** Pad strikes go to parts.strike. */
  parts?: { strike(instrument: Instrument, pitch: number, vel: number, from: Vec3): void };
  /** The piece's beat times, so trims are previewed already snapped (the audio side snaps again on cut:add). */
  beats?: () => number[];
  /** Id for a new cut. */
  newId?: () => string;
}

export interface GestureEngine {
  step(frame: InputFrame, targets: readonly Target[]): void;
  /** Read-only view for dev tools and tests. */
  debug(): {
    summoned: StemId | null; solo: StemId | null; mute: Partial<Record<StemId, MuteState>>;
    fist: Record<Hand, FistPhase>; pinching: Record<Hand, boolean>;
    grab: Record<Hand, Grab['kind'] | null>; eq: StemId | null; trim: StemId | null;
    strikes: number; lastStrike: { pad: string; pitch: number; vel: number } | null;
  };
}

export function createGestureEngine(bus: Pick<Bus, 'emit' | 'on'>, opts: GestureOptions = {}): GestureEngine {
  const { transport, parts, beats } = opts;
  const newId = opts.newId ?? (() => `cut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  const hands: Record<Hand, HandState> = { left: freshHand(), right: freshHand() };
  let mute: Partial<Record<StemId, MuteState>> = {};
  let eqs: Partial<Record<StemId, Eq>> = {};
  let solo: StemId | null = null;
  let summoned: StemId | null = null;
  let piece: PieceId | null = null;
  let reach: Vec3 | null = null; // reach spot taken when the creature was summoned
  let dwell: { stem: StemId; since: number } | null = null;
  let eq: { stem: StemId; xz0: number; y0: number; base: Eq; cur: Eq; sent: Eq; lastEmit: number; armed: boolean; done: boolean } | null = null;
  let trim: { target: Target; stem: StemId; t0: number; t1: number; sent: string; lastEmit: number } | null = null;
  const padLastHit = new Map<string, number>();
  let strikes = 0, lastStrike: { pad: string; pitch: number; vel: number } | null = null;

  // A new piece starts with every stem on and flat, nothing soloed and nothing summoned.
  bus.on('piece:ready', ({ id }) => {
    piece = id;
    mute = {}; eqs = {}; solo = null; summoned = null; reach = null; dwell = null; eq = null; trim = null;
    for (const h of HANDS) Object.assign(hands[h], { fist: 'idle', fistStem: null, lastDown: null, grab: null });
  });
  // EQ from anywhere (saved mixes included) is the base a new stretch starts from.
  bus.on('stem:eq', ({ stem, low, mid: m, high }) => void (eqs[stem] = { low, mid: m, high }));

  const setMute = (stem: StemId, state: MuteState, lockProgress: number) => {
    mute[stem] = state;
    bus.emit('stem:mute', { stem, state, lockProgress });
  };
  const sendEq = (stem: StemId, v: Eq) => bus.emit('stem:eq', { stem, ...v });

  const creature = (targets: readonly Target[], stem: StemId | null) =>
    stem ? targets.find((t) => t.kind === 'creature' && t.stem === stem) : undefined;

  /** Inside the summoned creature's sphere: at its live centre, or at the reach spot in case it hasn't moved there. */
  const insideSummoned = (targets: readonly Target[], p: Vec3): boolean => {
    const t = creature(targets, summoned);
    if (!t) return false;
    return dist(p, t.center) <= t.radius || (reach !== null && dist(p, reach) <= t.radius);
  };

  const idle = (h: Hand) => !hands[h].pinching && hands[h].fist === 'idle';

  // ---- release paths ----

  /** A pinch opening. `quiet`: it ended by a long tracking gap, so nothing new is triggered. */
  function endPinch(h: Hand, t: number, quiet: boolean) {
    const s = hands[h], g = s.grab;
    s.pinching = false;
    s.grab = null;
    bus.emit('hand:pinch', { hand: h, down: false, targetId: grabId(g) });
    if (!g) return;
    switch (g.kind) {
      case 'playhead': {
        if (!transport) break;
        const tap = !quiet && t - s.downAt < SPEC.tapTime && g.maxMove < SPEC.tapMove;
        if (tap && g.lastSeek !== g.startTime) transport.seek(g.startTime); // undo a tap's jitter
        if (tap ? !g.wasPlaying : g.wasPlaying) transport.play(); // a tap toggles; a hold or drag resumes
        break;
      }
      case 'reset':
        if (!g.done) bus.emit('reset:progress', { progress: 0 }); // released early: cancelled
        break;
      case 'lane':
        if (trim && trim.target.id === g.target.id) {
          if (!quiet) bus.emit('cut:add', { cut: { id: newId(), stem: trim.stem, t0: trim.t0, t1: trim.t1 } });
          bus.emit('cut:preview', null);
          trim = null;
        }
        break;
      case 'creature':
        if (eq) {
          // Releasing either hand commits the stretch (a reset already sent its zeros).
          if (!eq.done) { eqs[eq.stem] = eq.cur; sendEq(eq.stem, eq.cur); }
          eq = null;
        }
        break;
    }
  }

  /** Tracking lost for longer than gapHold: end whatever the hand was doing without triggering anything new. */
  function quietRelease(h: Hand, t: number) {
    const s = hands[h];
    // A hold in progress ends the way an open hand would end it (the part comes back); it never locks.
    if (s.fist === 'held' && s.fistStem) setMute(s.fistStem, 'on', 0);
    s.fist = 'idle'; s.fistStem = null;
    if (s.pinching) endPinch(h, t, true);
    s.lastDown = null;
  }

  // ---- fist ----

  function updateFist(h: Hand, f: HandFrame, t: number, targets: readonly Target[]) {
    const s = hands[h];
    const curl = handCurl(f.curls);
    const ownedByOther = hands[other(h)].fist !== 'idle';
    switch (s.fist) {
      case 'idle':
        if (curl >= SPEC.fistCurl && summoned && !ownedByOther && !s.pinching && !eq && insideSummoned(targets, f.palm)) {
          s.fist = 'arming'; s.fistSince = t; s.fistStem = summoned;
        }
        break;
      case 'arming':
        if (curl < SPEC.fistCurl || summoned !== s.fistStem || s.pinching || eq || !insideSummoned(targets, f.palm)) {
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

  // ---- pinch: what it grabs, and the double-pinch solo ----

  /** The pinch-able target under p, by priority: reset shell, playhead, hollow region, lane, summoned creature. */
  function grabAt(p: Vec3, targets: readonly Target[]): Grab | null {
    const find = (kind: Target['kind']) => targets.find((t) => t.kind === kind && inside(t, p));
    let t: Target | undefined;
    if ((t = find('reset'))) return { kind: 'reset', target: t, done: false, lastEmit: -Infinity };
    if ((t = find('playhead')) && transport) {
      const wasPlaying = transport.playing();
      if (wasPlaying) transport.pause(); // hold = pause
      const startTime = transport.time();
      return { kind: 'playhead', target: t, startTime, wasPlaying, lastSeek: startTime, maxMove: 0 };
    }
    if ((t = find('region'))) return { kind: 'region', target: t, done: false };
    if ((t = find('lane'))) return { kind: 'lane', target: t, used: false };
    if (summoned && insideSummoned(targets, p)) return { kind: 'creature', used: false };
    return null;
  }

  /** The registry id a grab refers to, for hand:pinch (null when the pinch closed on nothing). */
  const grabId = (g: Grab | null): string | null =>
    !g ? null : g.kind === 'creature' ? (summoned ? `creature:${summoned}` : null) : g.target.id;

  function updatePinch(h: Hand, f: HandFrame, t: number, targets: readonly Target[]) {
    const s = hands[h];
    if (s.pinching) {
      if (f.pinchDist >= SPEC.pinchExit) endPinch(h, t, false);
      return;
    }
    const othersOpen = Math.max(f.curls[1], f.curls[2], f.curls[3]) <= SPEC.pinchOtherCurlMax;
    if (f.pinchDist > SPEC.pinchEnter || !othersOpen) return;
    const pos = pinchPoint(f);
    s.pinching = true;
    s.downAt = t;
    s.downPos = pos;
    s.grab = grabAt(pos, targets);
    bus.emit('hand:pinch', { hand: h, down: true, targetId: grabId(s.grab) });

    // Double-pinch solo: only a pinch that took hold of the summoned creature, with the other hand idle.
    if (s.grab?.kind !== 'creature' || !idle(other(h))) { s.lastDown = null; return; }
    const prev = s.lastDown;
    if (prev && prev.stem === summoned && prev.gapSerial === s.gapSerial
      && t - prev.t <= SPEC.doublePinchWindow && dist(pos, prev.pos) < SPEC.doublePinchMove) {
      solo = solo === null ? summoned : null; // a second double-pinch clears
      bus.emit('stem:solo', { stem: solo });
      s.lastDown = null;
    } else {
      s.lastDown = { t, pos, gapSerial: s.gapSerial, stem: summoned! };
    }
  }

  /** One-hand grabs that run while the pinch is held: ribbon scrub, region pull, reset hold. */
  function holdGrab(h: Hand, f: HandFrame, t: number) {
    const s = hands[h], g = s.grab;
    if (!g) return;
    const pos = pinchPoint(f);
    if (g.kind === 'playhead' && transport) {
      // Time follows the hand from the first frame; a pinch that turns out to be a tap seeks back on release.
      g.maxMove = Math.max(g.maxMove, dist(pos, s.downPos));
      const delta: Vec3 = [pos[0] - s.downPos[0], pos[1] - s.downPos[1], pos[2] - s.downPos[2]];
      const to = Math.max(0, Math.min(transport.duration(), g.startTime + timeDelta(g.target, delta)));
      if (Math.abs(to - g.lastSeek) > 1e-3) { transport.seek(to); g.lastSeek = to; }
    } else if (g.kind === 'region' && !g.done && dist(pos, s.downPos) >= SPEC.undoPull) {
      g.done = true;
      bus.emit('cut:remove', { id: g.target.id.replace(/^region:/, '') });
    } else if (g.kind === 'reset' && !g.done) {
      const progress = Math.min(1, (t - s.downAt) / SPEC.resetHold);
      if (progress >= 1) {
        g.done = true;
        bus.emit('reset:progress', { progress: 1 });
        if (piece) bus.emit('app:reset', { piece });
      } else if (due(g, t)) {
        bus.emit('reset:progress', { progress });
      }
    }
  }

  /** Two-hand gestures: EQ stretch / reset on the summoned creature, trim on a lane. */
  function updateTwoHands(t: number, live: Partial<Record<Hand, HandFrame>>) {
    const L = hands.left, R = hands.right, fl = live.left, fr = live.right;
    if (!fl || !fr || !L.grab || !R.grab) return;
    const pl = pinchPoint(fl), pr = pinchPoint(fr);
    const together = Math.abs(L.downAt - R.downAt);

    if (L.grab.kind === 'creature' && R.grab.kind === 'creature') {
      if (!eq && !L.grab.used && !R.grab.used && together <= SPEC.eqWindow && summoned) {
        L.grab.used = R.grab.used = true;
        const base = eqs[summoned] ?? { low: 0, mid: 0, high: 0 };
        eq = {
          stem: summoned, xz0: Math.hypot(pl[0] - pr[0], pl[2] - pr[2]), y0: Math.abs(pl[1] - pr[1]),
          base, cur: base, sent: base, lastEmit: -Infinity, armed: false, done: false,
        };
      }
      if (eq && !eq.done) {
        const sep = dist(pl, pr);
        if (sep > SPEC.eqResetArm) eq.armed = true;
        if (eq.armed && sep <= SPEC.eqResetDist) {
          eq.done = true; // both pinches brought together: flat again
          eq.sent = { low: 0, mid: 0, high: 0 };
          eqs[eq.stem] = eq.sent;
          sendEq(eq.stem, eq.sent);
          return;
        }
        // Wider apart = more bass, taller apart = more treble.
        const next: Eq = {
          low: clampDb(eq.base.low + (Math.hypot(pl[0] - pr[0], pl[2] - pr[2]) - eq.xz0) * SPEC.eqDbPerM),
          mid: eq.base.mid,
          high: clampDb(eq.base.high + (Math.abs(pl[1] - pr[1]) - eq.y0) * SPEC.eqDbPerM),
        };
        eq.cur = next;
        const changed = Math.abs(next.low - eq.sent.low) > 0.05 || Math.abs(next.high - eq.sent.high) > 0.05;
        if (changed && due(eq, t)) {
          eq.sent = next;
          sendEq(eq.stem, next);
        }
      }
    }

    if (L.grab.kind === 'lane' && R.grab.kind === 'lane' && L.grab.target.id === R.grab.target.id) {
      const lane = L.grab.target;
      if (!trim && !L.grab.used && !R.grab.used && together <= SPEC.trimWindow && lane.stem) {
        L.grab.used = R.grab.used = true;
        trim = { target: lane, stem: lane.stem, t0: 0, t1: 0, sent: '', lastEmit: -Infinity };
      }
      if (trim && trim.target.id === lane.id) {
        const end = transport?.duration() ?? Infinity;
        const clampT = (x: number) => Math.max(0, Math.min(end, x));
        let t0 = clampT(Math.min(timeAt(lane, pl), timeAt(lane, pr)));
        let t1 = clampT(Math.max(timeAt(lane, pl), timeAt(lane, pr)));
        const grid = beats?.();
        if (grid && grid.length) ({ t0, t1 } = snapCut(grid, t0, t1));
        trim.t0 = t0; trim.t1 = t1;
        const key = `${t0.toFixed(4)}|${t1.toFixed(4)}`;
        if (key !== trim.sent && due(trim, t)) {
          trim.sent = key;
          bus.emit('cut:preview', { stem: trim.stem, t0, t1 });
        }
      }
    }
  }

  // ---- pads ----

  /** Index tip crossing a pad's face downward fast enough: a hit. Only fresh frames count; a gap is never a hit. */
  function updatePads(h: Hand, f: HandFrame | undefined, fresh: boolean, t: number, targets: readonly Target[]) {
    const s = hands[h];
    if (!f || !fresh) { s.padPrev.clear(); return; }
    for (const pad of targets) {
      if (pad.kind !== 'pad') continue;
      const { height, radial } = padLocal(pad, f.tip);
      const prev = s.padPrev.get(pad.id);
      s.padPrev.set(pad.id, { t, height });
      if (!prev || !(prev.height > 0 && height <= 0) || radial > pad.radius || t <= prev.t) continue;
      const speed = (prev.height - height) / (t - prev.t);
      const last = padLastHit.get(pad.id);
      if (speed < SPEC.padMinSpeed || (last !== undefined && t - last < SPEC.padLockout)) continue;
      padLastHit.set(pad.id, t);
      const pitch = pad.extra?.pitch ?? SPEC.padPitch, vel = padVelocity(speed);
      strikes++; lastStrike = { pad: pad.id, pitch, vel };
      parts?.strike('pads', pitch, vel, f.tip);
    }
  }

  // ---- summon and near ----

  function updateSummon(head: HeadFrame, t: number, targets: readonly Target[]) {
    let best: Target | undefined, bestAngle = Infinity;
    for (const target of targets) {
      if (target.kind !== 'creature' || !target.stem || target.stem === summoned) continue;
      const a = angleToDeg(head, target.center);
      if (a < bestAngle) { best = target; bestAngle = a; }
    }
    if (!best || bestAngle > SPEC.summonAngleDeg) { dwell = null; return; }
    if (!dwell || dwell.stem !== best.stem) { dwell = { stem: best.stem!, since: t }; return; }
    // A held fist or a running stretch keeps its creature close until the hands let go.
    const busy = !!eq || HANDS.some((h) => hands[h].fist === 'held' || hands[h].fist === 'arming');
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
      const d = Math.min(surface(target, f.palm), surface(target, f.tip));
      if (d < bestDist) { best = target; bestDist = d; }
    }
    // dist: palm or index tip to the collider's surface, 0 when inside.
    if (best) bus.emit('hand:near', { hand: h, targetId: best.id, dist: Math.max(0, bestDist) });
  }
  const surface = (t: Target, p: Vec3) => Math.max(0, surfaceDist(t, p));

  return {
    step({ t, hands: raw, head }, targets) {
      const live: Partial<Record<Hand, HandFrame>> = {};
      const fresh: Record<Hand, boolean> = { left: false, right: false };
      for (const h of HANDS) {
        const s = hands[h], f = raw[h];
        if (f && f.tracked) {
          s.last = f; s.lostAt = null; s.released = false;
          live[h] = f; fresh[h] = true;
          continue;
        }
        if (s.lostAt === null) { s.lostAt = t; s.gapSerial++; }
        if (!s.released && s.last && t - s.lostAt <= SPEC.gapHold) live[h] = s.last; // hold the last state
        else if (!s.released) { quietRelease(h, t); s.released = true; }
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
      updateTwoHands(t, live);
      for (const h of HANDS) {
        const f = live[h];
        if (f && hands[h].pinching) holdGrab(h, f, t);
        updatePads(h, f, fresh[h], t, targets);
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
      grab: { left: hands.left.grab?.kind ?? null, right: hands.right.grab?.kind ?? null },
      eq: eq?.stem ?? null, trim: trim?.stem ?? null, strikes, lastStrike,
    }),
  };
}

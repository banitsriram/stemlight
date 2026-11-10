// Cuts and the user's own parts (audio side of biyon-23, 24, 25): beat-snapped cut regions go silent;
// a cut on a replaceable stem starts a take: one bar of count-in ticks, then the region loops while the
// user plays. Hits snap to the 1/8 grid, are recorded, and are scheduled back on every later pass.
// The original part plays at −18 dB under the first pass only (the guide track).
import type { Bus, Cut, Instrument, PieceManifest, StemId, UserHit, UserPart, Vec3 } from '../contracts';
import type { Engine } from './engine.ts';
import { beatIndexAt, beatsBefore, snapCut, snapEighth } from './mix.ts';
import { playTick, playVoice } from './synth.ts';

export const GUIDE_GAIN = 10 ** (-18 / 20); // −18 dB
const LOOKAHEAD = 0.12;
const LOCKOUT = 0.09;
const MAX_PASSES = 6;
const EARLY_GRACE = 0.06; // a hit this close before the region start counts as its first beat

interface Take {
  cut: Cut;
  instrument: Instrument;
  countBeats: number[];
  passHits: number;
  totalHits: number;
}

export interface Parts {
  /** A live hit from the hand input. Plays at once; recorded when a take for that instrument is running. */
  strike(instrument: Instrument, pitch: number, vel: number, from: Vec3): void;
  update(): void;
  cuts(): Cut[];
  parts(): UserPart[];
  taking(): { cutId: string; instrument: Instrument; pass: number } | null;
  /** Replaces all cuts and parts (used by saving); no take is started. */
  restore(cuts: Cut[], parts: UserPart[]): void;
  log: { kind: string; data: Record<string, unknown> }[];
}

export function createParts(engine: Engine, bus: Bus): Parts {
  let manifest: PieceManifest | null = null;
  const cuts = new Map<string, Cut>();
  const parts = new Map<string, UserPart>();
  let take: Take | null = null;
  let scheduledTo = 0; // piece time up to which part hits have been scheduled
  let nextPassTo = -1; // offset into the next loop pass already scheduled (−1 = none)
  const recent = new Set<string>(); // hits recorded this pass, so the scheduler doesn't double them
  const lastHit = new Map<string, number>();
  const log: Parts['log'] = [];
  const note = (kind: string, data: Record<string, unknown>) => {
    log.push({ kind, data });
    if (log.length > 300) log.splice(0, log.length - 300);
  };
  const ctx = () => engine.audio.context();
  const key = (cutId: string, h: UserHit) => `${cutId}|${h.pitch}|${h.tOffset.toFixed(4)}`;

  const regions = (stem: StemId, pass: number) => {
    const out = [...cuts.values()].filter((c) => c.stem === stem).map((c) => {
      const guide = take?.cut.id === c.id && pass === 0;
      return { t0: c.t0, t1: c.t1, gain: guide ? GUIDE_GAIN : 0 };
    });
    if (take && take.cut.stem === stem) note('trim', { stem, pass, gain: out.find((r) => r.t0 === take!.cut.t0)?.gain ?? 1 });
    return out;
  };
  const replan = () => engine.setRegions(regions);

  const beatsPerBar = () => {
    const { beats, downbeats } = engine.beats();
    if (downbeats.length < 2) return 4;
    const n = beatIndexAt(beats, downbeats[1]) - beatIndexAt(beats, downbeats[0]);
    return n > 0 && n <= 12 ? n : 4;
  };

  const endTake = (why: string) => {
    if (!take) return;
    note('take-end', { cutId: take.cut.id, why, hits: take.totalHits, pass: engine.pass() });
    take = null;
    engine.setLoop(null);
    engine.setBeforeWrap(null);
    replan();
  };

  const beginTake = (cut: Cut, instrument: Instrument) => {
    endTake('replaced');
    const { beats } = engine.beats();
    const countBeats = beatsBefore(beats, cut.t0, beatsPerBar());
    take = { cut, instrument, countBeats, passHits: 0, totalHits: 0 };
    if (!parts.has(cut.id)) parts.set(cut.id, { cutId: cut.id, instrument, hits: [] });
    engine.setLoop({ t0: cut.t0, t1: cut.t1 });
    engine.setBeforeWrap((pass) => {
      if (!take) return false;
      const t = take;
      const keep = !(t.totalHits > 0 && t.passHits === 0) && pass + 1 < MAX_PASSES && !(t.totalHits === 0 && pass + 1 >= 3);
      note('pass', { pass, hits: t.passHits, keep });
      t.passHits = 0;
      if (!keep) {
        note('take-end', { cutId: t.cut.id, why: 'done', hits: t.totalHits, pass });
        take = null;
        engine.setBeforeWrap(null);
        // The loop ends here; the cut stays silent from now on (no guide).
        queueMicrotask(replan);
      }
      return keep;
    });
    replan();
    const t = engine.transport;
    t.seek(countBeats[0] ?? cut.t0);
    if (!t.playing()) t.play();
    // Count-in ticks, scheduled sample-exactly against the segment that just started.
    countBeats.forEach((b, i) => playTick(ctx(), engine.partInput(cut.stem), Math.max(ctx().currentTime, engine.ctxTimeAt(b)), i === 0));
    note('take', { cutId: cut.id, instrument, countBeats });
  };

  const instrumentFor = (stem: StemId): Instrument | null =>
    manifest?.replace.find((r) => r.stem === stem)?.instrument ?? null;

  bus.on('piece:ready', ({ manifest: m }) => {
    manifest = m;
    endTake('piece');
    cuts.clear(); parts.clear(); recent.clear();
    replan();
  });

  bus.on('cut:add', ({ cut }) => {
    const snapped = { ...cut, ...snapCut(engine.beats().beats, cut.t0, cut.t1) };
    cuts.set(cut.id, snapped);
    note('cut', { ...snapped });
    const inst = instrumentFor(cut.stem);
    if (inst) beginTake(snapped, inst);
    else replan();
  });

  bus.on('cut:remove', ({ id }) => {
    if (take?.cut.id === id) endTake('removed');
    cuts.delete(id);
    parts.delete(id);
    note('uncut', { id });
    replan();
  });

  bus.on('app:reset', () => {
    endTake('reset');
    cuts.clear(); parts.clear();
    replan();
  });

  bus.on('transport:seek', ({ t }) => {
    recent.clear();
    scheduledTo = nextPassTo >= 0 && take ? t + nextPassTo : t - 1e-6;
    nextPassTo = -1;
  });

  bus.on('beat', (b) => {
    if (!take || engine.pass() > 0) return;
    const i = take.countBeats.findIndex((c) => Math.abs(c - b.t) < 1e-3);
    if (i >= 0) bus.emit('countin', { cutId: take.cut.id, beatsLeft: take.countBeats.length - i });
  });

  function strike(instrument: Instrument, pitch: number, vel: number, from: Vec3) {
    const t = engine.transport.time();
    const now = ctx().currentTime;
    const lk = `${instrument}|${pitch}`;
    if (now - (lastHit.get(lk) ?? -1) < LOCKOUT) return;
    lastHit.set(lk, now);

    const cut = take && take.instrument === instrument ? take.cut
      : [...cuts.values()].find((c) => instrumentFor(c.stem) === instrument) ?? null;
    playVoice(ctx(), cut ? engine.partInput(cut.stem) : engine.partInput('perc'), instrument, pitch, vel, now);

    let at = t;
    if (take && cut === take.cut && engine.transport.playing()) {
      let snapped = snapEighth(engine.beats().beats, t);
      if (snapped < cut.t0 && cut.t0 - t <= EARLY_GRACE) snapped = cut.t0;
      if (snapped >= cut.t1 - 1e-6) snapped = cut.t0; // lands on the next pass's first beat
      if (snapped >= cut.t0 && snapped < cut.t1) {
        const hit: UserHit = { tOffset: +(snapped - cut.t0).toFixed(6), pitch, vel };
        const part = parts.get(cut.id)!;
        const dup = part.hits.findIndex((h) => h.pitch === pitch && Math.abs(h.tOffset - hit.tOffset) < 1e-3);
        if (dup >= 0) part.hits[dup] = hit; else part.hits.push(hit);
        part.hits.sort((a, b) => a.tOffset - b.tOffset);
        recent.add(key(cut.id, hit));
        take.passHits++;
        take.totalHits++;
        at = snapped;
        note('hit', { raw: t, snapped, tOffset: hit.tOffset, pitch, vel, pass: engine.pass() });
      }
    }
    bus.emit('part:hit', { cutId: cut?.id ?? '', instrument, pitch, vel, t: at, from });
  }

  function update() {
    const tr = engine.transport;
    if (!tr.playing()) return;
    const t = tr.time();
    const loopEnd = take ? take.cut.t1 : Infinity;
    const to = Math.min(t + LOOKAHEAD, loopEnd);
    const c = ctx();
    for (const [id, part] of parts) {
      const cut = cuts.get(id);
      if (!cut) continue;
      for (const h of part.hits) {
        const T = cut.t0 + h.tOffset;
        if (T <= scheduledTo || T > to || T >= cut.t1) continue;
        if (take?.cut.id === id && recent.has(key(id, h))) continue;
        const when = engine.ctxTimeAt(T);
        if (when < c.currentTime - 0.01) continue;
        playVoice(c, engine.partInput(cut.stem), part.instrument, h.pitch, h.vel, Math.max(when, c.currentTime));
      }
    }
    scheduledTo = Math.max(scheduledTo, to);
    // Hits at the very start of the next loop pass: schedule them before the wrap is reached.
    const wrap = engine.wrapPending();
    if (take && wrap && t + LOOKAHEAD > loopEnd) {
      const over = t + LOOKAHEAD - loopEnd;
      const part = parts.get(take.cut.id);
      for (const h of part?.hits ?? []) {
        if (h.tOffset <= nextPassTo || h.tOffset > over) continue;
        playVoice(c, engine.partInput(take.cut.stem), part!.instrument, h.pitch, h.vel, wrap.at + h.tOffset);
      }
      nextPassTo = Math.max(nextPassTo, over);
    }
  }

  return {
    strike, update,
    cuts: () => [...cuts.values()],
    parts: () => [...parts.values()].map((p) => ({ ...p, hits: [...p.hits] })),
    taking: () => (take ? { cutId: take.cut.id, instrument: take.instrument, pass: engine.pass() } : null),
    restore(cs, ps) {
      endTake('restore');
      cuts.clear(); parts.clear();
      for (const c of cs) cuts.set(c.id, c);
      for (const p of ps) if (cuts.has(p.cutId)) parts.set(p.cutId, { ...p, hits: [...p.hits] });
      replan();
    },
    log,
  };
}

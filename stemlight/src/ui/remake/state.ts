// Remake surfaces: the bus-driven state and the registry targets, no three.js (node tests drive it with a
// fake bus, transport and parts). view.ts draws whatever update() returns.
import type {
  AppContext, Beats, Cut, Hand, Instrument, NoteEvent, PieceId, PieceManifest, StemId, Target, UserPart, Vec3,
} from '../../contracts';
import {
  IDS, countInLook, harpTargets, keyTargets, laneTarget, lerpFrame, melodicWanted, octaveFor, padPair, padPitches, padTargets,
  padsWanted, playheadTarget, regionTarget, resetTarget, RIBBON, ribbonX, spanX, stemFor, toWorld, laneLocal, pitchY,
  type CountIn, type Frame,
} from './layout.ts';
import { warmVoices } from '../../audio/synth.ts';

export const GLIDE_SEC = 0.6; // same glide as the creatures
export const FLIGHT_SEC = 0.4; // an amber note's flight from the fingertip to its outline
export const FLASH_SEC = 0.25;

export interface PartsView {
  cuts(): Cut[];
  parts(): UserPart[];
  taking(): { cutId: string; instrument: Instrument; pass: number } | null;
}

export interface RemakeStateDeps {
  parts: PartsView;
  /** The camera's eye and level yaw (main.ts head()). */
  head: () => Frame;
  /** The loaded piece's beats (engine.beats()). */
  beats?: () => Beats;
  /** notes.json for a piece; default fetches /pieces/<id>/notes.json. */
  loadNotes?: (id: PieceId) => Promise<NoteEvent[]>;
}

export interface NoteMark { x: number; y: number; note: NoteEvent }
export interface RegionView { cut: Cut; x0: number; x1: number; ghosts: NoteMark[]; hits: { x: number; y: number; pitch: number }[] }
export interface Flight { from: Vec3; to: Vec3; k: number; glyph: NoteEvent['glyph'] }

export interface RemakeView {
  visible: boolean;
  ribbon: Frame;
  seat: Frame;
  now: number;
  clock: number;
  stem: StemId | null; // the lane's stem (the summoned creature)
  ticks: { x: number; down: boolean }[];
  notes: NoteMark[]; // the lane stem's notes in the window, outside any cut
  regions: RegionView[];
  preview: { x0: number; x1: number } | null;
  playheadHeld: boolean;
  pads: { center: Vec3; pitch: number; flash: number }[]; // empty while the pads are hidden
  strings: { a: Vec3; b: Vec3; pitch: number; flash: number }[]; // the harp's strings, bottom a to top b; empty while hidden
  keys: { center: Vec3; pitch: number; flash: number }[]; // the keyboard's key tops; empty while hidden
  countIn: { fill: number; pulse: number } | null;
  countInOn: 'pads' | 'row' | null; // which surface the count-in belongs to: the running take's instrument
  reset: { center: Vec3; progress: number; flash: number };
  flights: Flight[];
}

const lowerBound = (xs: number[], t: number) => {
  let lo = 0, hi = xs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < t) lo = m + 1; else hi = m; }
  return lo;
};

/** Length of the beat around piece time t (0.5 s without beats). */
export function beatLenAt(beats: number[], t: number): number {
  if (beats.length < 2) return 0.5;
  const i = Math.max(0, Math.min(beats.length - 2, lowerBound(beats, t) - 1));
  return beats[i + 1] - beats[i];
}

const defaultLoad = (id: PieceId) => fetch(`/pieces/${id}/notes.json`).then((r) => r.json() as Promise<NoteEvent[]>);

export function createRemakeState(ctx: Pick<AppContext, 'bus' | 'transport' | 'registry'> & Partial<Pick<AppContext, 'audio'>>, deps: RemakeStateDeps) {
  const { bus, transport, registry } = ctx;
  let manifest: PieceManifest | null = null;
  let notes = new Map<StemId, { list: NoteEvent[]; ts: number[] }>();
  let request = 0;
  let summoned: StemId | null = null;
  let ribbonGlide: { from: Frame; to: Frame; at: number } | null = null;
  let seat: Frame | null = null;
  let preview: Cut | null = null;
  const holders = new Set<Hand>();
  let countIn: CountIn | null = null;
  let resetProgress = 0, resetFlashAt = -Infinity;
  let hits: { at: number; from: Vec3; t: number; pitch: number; cutId: string; flashPad: number; instrument: Instrument }[] = [];
  let pitches: number[] = [];
  let harpPitches: number[] = [], keyPitches: number[] = [];
  const warmed = new Set<string>(); // harp/keys notes already rendered for this piece
  let clock = 0;
  const registered = new Set<string>();

  const cutsNow = () => deps.parts.cuts();
  const rangeOf = (stem: StemId) => manifest?.stems.find((s) => s.id === stem)?.pitchRange;

  bus.on('piece:ready', ({ id, manifest: m }) => {
    manifest = m;
    summoned = null; preview = null; countIn = null; hits = []; resetProgress = 0;
    pitches = padPair(padPitches(m.scale.tonic));
    const range = (inst: Instrument) => { const st = stemFor(m, inst); return st ? m.stems.find((x) => x.id === st)?.pitchRange : undefined; };
    harpPitches = octaveFor(m.scale, range('harp'));
    keyPitches = octaveFor(m.scale, range('keys'));
    warmed.clear();
    notes = new Map();
    const r = ++request;
    (deps.loadNotes ?? defaultLoad)(id).then((list) => {
      if (r !== request) return; // another piece was picked meanwhile
      const by = new Map<StemId, { list: NoteEvent[]; ts: number[] }>();
      for (const n of [...list].sort((a, b) => a.t - b.t)) {
        let e = by.get(n.stem);
        if (!e) by.set(n.stem, (e = { list: [], ts: [] }));
        e.list.push(n); e.ts.push(n.t);
      }
      notes = by;
    }).catch(() => { /* no notes: the ribbon still works, just without glyphs */ });
  });

  const ribbonNow = (): Frame => {
    if (!ribbonGlide) return deps.head(); // nothing captured yet: follow the head
    return lerpFrame(ribbonGlide.from, ribbonGlide.to, (clock - ribbonGlide.at) / GLIDE_SEC);
  };

  bus.on('gaze:summon', ({ stem }) => {
    summoned = stem;
    const to = deps.head();
    ribbonGlide = { from: ribbonGlide ? ribbonNow() : to, to, at: clock };
  });
  bus.on('transport:state', ({ playing }) => {
    if (!playing) return;
    // The first play (Enter, inside XR) fixes where the seat faces; the ribbon starts there too.
    if (!seat) seat = deps.head();
    if (!ribbonGlide) ribbonGlide = { from: seat, to: seat, at: -GLIDE_SEC };
  });
  bus.on('cut:preview', (p) => { preview = p ? { id: '', ...p } : null; });
  bus.on('cut:add', () => { preview = null; });
  bus.on('hand:pinch', ({ hand, down, targetId }) => {
    if (down && targetId === IDS.playhead) holders.add(hand); else if (!down) holders.delete(hand);
  });
  bus.on('countin', ({ cutId, beatsLeft }) => {
    const beatLen = beatLenAt(deps.beats?.().beats ?? [], transport.time());
    const fresh = !countIn || countIn.cutId !== cutId || beatsLeft >= countIn.beatsLeft;
    countIn = { cutId, total: fresh ? beatsLeft : countIn!.total, beatsLeft, at: clock, beatLen };
  });
  bus.on('cut:remove', ({ id }) => { if (countIn?.cutId === id) countIn = null; });
  bus.on('reset:progress', ({ progress }) => { resetProgress = progress; });
  bus.on('app:reset', () => { preview = null; countIn = null; hits = []; resetFlashAt = clock; });
  bus.on('part:hit', ({ cutId, instrument, pitch, t, from }) => {
    let flashPad = 0;
    pitches.forEach((p, i) => { if (Math.abs(p - pitch) < Math.abs(pitches[flashPad] - pitch)) flashPad = i; });
    hits.push({ at: clock, from, t, pitch, cutId, flashPad: instrument === 'pads' ? flashPad : -1, instrument });
    if (hits.length > 24) hits.splice(0, hits.length - 24);
  });

  /** The lane stem's notes with onset in [t0, t1). */
  function notesIn(stem: StemId, t0: number, t1: number): NoteEvent[] {
    const e = notes.get(stem);
    if (!e) return [];
    return e.list.slice(lowerBound(e.ts, t0), lowerBound(e.ts, t1));
  }

  /** Where an amber note lands: the ghost outline nearest its time in the cut, else its own time and pitch. */
  function landing(hit: { t: number; pitch: number; cutId: string }, ribbon: Frame, now: number): { to: Vec3; glyph: NoteEvent['glyph'] } | null {
    const cut = cutsNow().find((c) => c.id === hit.cutId);
    if (!cut || cut.stem !== summoned) return null;
    const near = notesIn(cut.stem, hit.t - 0.25, hit.t + 0.25).filter((n) => n.t >= cut.t0 && n.t < cut.t1)
      .sort((a, b) => Math.abs(a.t - hit.t) - Math.abs(b.t - hit.t))[0];
    const t = near?.t ?? hit.t, pitch = near?.pitch ?? hit.pitch;
    const x = Math.max(-RIBBON.halfWidth, Math.min(RIBBON.halfWidth, ribbonX(t, now)));
    const [lx, ly, lz] = laneLocal(x);
    return { to: toWorld(ribbon, [lx, ly + pitchY(pitch, rangeOf(cut.stem)), lz]), glyph: near?.glyph ?? 'quarter' };
  }

  function sync(targets: Target[]) {
    const ids = new Set(targets.map((t) => t.id));
    for (const id of registered) if (!ids.has(id)) registry.remove(id);
    registered.clear();
    for (const t of targets) { registry.set(t); registered.add(t.id); }
  }

  return {
    /** Ghost outlines of a cut: exactly the cut stem's notes with onset in [t0, t1). */
    ghostNotes: (cut: Cut) => notesIn(cut.stem, cut.t0, cut.t1),
    padPitches: () => [...pitches],
    harpPitches: () => [...harpPitches],
    keyPitches: () => [...keyPitches],
    /** Call once a frame with the frame time in seconds. Updates the registry and returns what to draw. */
    update(dt: number): RemakeView {
      clock += dt;
      const now = transport.time();
      const ribbon = ribbonNow();
      const seatF = seat ?? deps.head();
      const targets: Target[] = [];
      const visible = manifest !== null;
      const view: RemakeView = {
        visible, ribbon, seat: seatF, now, clock, stem: null, ticks: [], notes: [], regions: [], preview: null,
        playheadHeld: holders.size > 0, pads: [], strings: [], keys: [], countIn: null, countInOn: null,
        reset: { center: resetTarget(seatF).center, progress: resetProgress, flash: Math.max(0, 1 - (clock - resetFlashAt) / 0.8) },
        flights: [],
      };
      if (!visible) { sync(targets); return view; }

      const lo = now - RIBBON.windowSec, hi = now + RIBBON.windowSec;
      targets.push(playheadTarget(ribbon), resetTarget(seatF));

      const b = deps.beats?.();
      if (b) {
        const down = new Set(b.downbeats.map((d) => Math.round(d * 1000)));
        for (let i = lowerBound(b.beats, lo); i < b.beats.length && b.beats[i] <= hi; i++) {
          view.ticks.push({ x: ribbonX(b.beats[i], now), down: down.has(Math.round(b.beats[i] * 1000)) });
        }
      }

      const cuts = cutsNow();
      if (summoned) {
        const stem = summoned, range = rangeOf(stem);
        view.stem = stem;
        targets.push(laneTarget(ribbon, stem, now));
        const mine = cuts.filter((c) => c.stem === stem);
        const inCut = (t: number) => mine.some((c) => t >= c.t0 && t < c.t1);
        for (const n of notesIn(stem, lo, hi)) {
          if (!inCut(n.t)) view.notes.push({ x: ribbonX(n.t, now), y: pitchY(n.pitch, range), note: n });
        }
        const userParts = deps.parts.parts();
        for (const cut of mine) {
          const span = spanX(cut.t0, cut.t1, now);
          const target = regionTarget(ribbon, cut, now);
          if (!span || !target) continue;
          targets.push(target);
          const ghosts = notesIn(stem, Math.max(cut.t0, lo), Math.min(cut.t1, hi))
            .map((n) => ({ x: ribbonX(n.t, now), y: pitchY(n.pitch, range), note: n }));
          const part = userParts.find((p) => p.cutId === cut.id);
          const userHits = (part?.hits ?? []).map((h) => ({ t: cut.t0 + h.tOffset, pitch: h.pitch }))
            .filter((h) => h.t >= lo && h.t <= hi)
            .map((h) => ({ x: ribbonX(h.t, now), y: pitchY(h.pitch, range), pitch: h.pitch }));
          view.regions.push({ cut, ...span, ghosts, hits: userHits });
        }
        if (preview && preview.stem === stem) view.preview = spanX(preview.t0, preview.t1, now);
      }

      if (padsWanted(deps.parts, manifest)) {
        const pads = padTargets(seatF, pitches);
        targets.push(...pads);
        view.pads = pads.map((p, i) => {
          const last = [...hits].reverse().find((h) => h.flashPad === i);
          return { center: p.center, pitch: p.extra!.pitch, flash: last ? Math.max(0, 1 - (clock - last.at) / FLASH_SEC) : 0 };
        });
      }
      // Harp or keyboard: whichever replaces the stem being remade; a struck string or key flashes amber.
      const melodic = melodicWanted(deps.parts, manifest);
      // The first time a harp or keyboard comes up, render its 8 notes during the count-in.
      if (melodic && !warmed.has(melodic) && ctx.audio) {
        warmed.add(melodic);
        try { warmVoices(ctx.audio.context(), melodic, melodic === 'harp' ? harpPitches : keyPitches); } catch { /* no audio yet: notes render on first strike */ }
      }
      const flashOf = (inst: Instrument, pitch: number) => {
        const last = [...hits].reverse().find((h) => h.instrument === inst && h.pitch === pitch);
        return last ? Math.max(0, 1 - (clock - last.at) / FLASH_SEC) : 0;
      };
      if (melodic === 'harp') {
        const strings = harpTargets(seatF, harpPitches);
        targets.push(...strings);
        view.strings = strings.map((t) => {
          const h = t.extra!.halfLength;
          return { a: [t.center[0], t.center[1] - h, t.center[2]], b: [t.center[0], t.center[1] + h, t.center[2]], pitch: t.extra!.pitch, flash: flashOf('harp', t.extra!.pitch) };
        });
      } else if (melodic === 'keys') {
        const keys = keyTargets(seatF, keyPitches);
        targets.push(...keys);
        view.keys = keys.map((t) => ({ center: t.center, pitch: t.extra!.pitch, flash: flashOf('keys', t.extra!.pitch) }));
      }
      const takeInst = deps.parts.taking()?.instrument;
      const on = takeInst === 'pads' && view.pads.length ? 'pads' : takeInst && takeInst === melodic ? 'row' : null;
      if (on) { view.countIn = countInLook(countIn, clock); view.countInOn = on; }

      hits = hits.filter((h) => clock - h.at < 1);
      for (const h of hits) {
        const k = (clock - h.at) / FLIGHT_SEC;
        if (k > 1) continue;
        const land = landing(h, ribbon, now);
        const to: Vec3 = land?.to ?? [h.from[0], h.from[1] + 0.15, h.from[2]];
        view.flights.push({ from: h.from, to, k, glyph: land?.glyph ?? 'quarter' });
      }

      sync(targets);
      return view;
    },
  };
}

export type RemakeState = ReturnType<typeof createRemakeState>;

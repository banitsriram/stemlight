// The real audio engine (biyon-8, 9): one AudioContext, every stem started on one shared context time,
// a gain → 3-band EQ → HRTF panner chain per stem, and a master compressor. Transport time is the
// AudioContext clock, so notes (which B positions from transport.time()) can never drift from the sound.
import type {
  AudioApi, Beats, Bus, PieceId, PieceManifest, StemId, TargetRegistry, Transport, Vec3,
} from '../contracts';
import { beatsCrossed, clampDb, emptyMix, RAMP_SEC, stemGain, STEMS, type Mix } from './mix.ts';

const START_LEAD = 0.05; // seconds between scheduling and the shared start time
const EQ_FREQ = { low: 200, mid: 1000, high: 4000 };

export interface StemChain {
  id: StemId;
  buffer: AudioBuffer;
  homeSeat: Vec3;
  source: AudioBufferSourceNode | null;
  gain: GainNode; // mute / solo
  trim: GainNode; // cut regions (biyon-23)
  low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode;
  panner: PannerNode;
}

export interface AudioLogEntry { at: number; kind: string; stem?: StemId; data: Record<string, unknown> }

export interface Engine {
  audio: AudioApi;
  transport: Transport;
  /** Fetches and decodes every stem of a piece, releasing the previous piece's buffers first. */
  load(id: PieceId, manifest: PieceManifest, beats: Beats, base: string): Promise<{ decodedMB: number }>;
  /** Call once per frame: beat events, end of piece, panners following their creature targets. */
  update(): void;
  /** Head pose for the HRTF listener, in world space. */
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void;
  stems(): readonly StemChain[];
  mix(): Readonly<Mix>;
  log: AudioLogEntry[];
}

export interface EngineOptions {
  createContext?: () => AudioContext;
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  registry?: TargetRegistry;
}

export function createEngine(bus: Bus, opts: EngineOptions = {}): Engine {
  const ctx = (opts.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' })))();
  const fetchBytes = opts.fetchBytes ?? (async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`audio: ${url} → ${r.status}`);
    return r.arrayBuffer();
  });

  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.knee.value = 8;
  master.ratio.value = 3;
  master.attack.value = 0.01;
  master.release.value = 0.25;
  master.connect(ctx.destination);

  const sfx = ctx.createGain();
  sfx.gain.value = 0.8;
  sfx.connect(ctx.destination);

  let stems: StemChain[] = [];
  let piece: PieceId | null = null;
  let beats: Beats = { tempo: [], beats: [], downbeats: [] };
  let length = 0;
  let mix = emptyMix();
  const log: AudioLogEntry[] = [];
  const note = (kind: string, data: Record<string, unknown>, stem?: StemId) => {
    log.push({ at: ctx.currentTime, kind, stem, data });
    if (log.length > 500) log.splice(0, log.length - 500);
  };

  // Transport state. While playing, time = offset + (currentTime − startedAt).
  let running = false, offset = 0, startedAt = 0, lastT = 0, ended = false;
  const raw = () => (running ? offset + (ctx.currentTime - startedAt) : offset);
  const time = () => Math.max(0, Math.min(length, raw()));

  const stopSources = () => {
    for (const s of stems) {
      if (!s.source) continue;
      s.source.onended = null;
      try { s.source.stop(); } catch { /* already stopped */ }
      s.source.disconnect();
      s.source = null;
    }
  };

  /** Starts every stem at one context time, all from the same offset, so they stay sample-aligned. */
  const startSources = (from: number) => {
    stopSources();
    const when = ctx.currentTime + START_LEAD;
    for (const s of stems) {
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.connect(s.gain);
      if (from < s.buffer.duration) src.start(when, from);
      s.source = src;
    }
    startedAt = when;
    offset = from;
    note('start', { when, from });
  };

  const announce = () => bus.emit('transport:state', { playing: running, t: time() });

  const transport: Transport = {
    time,
    duration: () => length,
    playing: () => running && raw() < length,
    play() {
      if (running || !stems.length) return;
      if (offset >= length) offset = 0;
      ended = false;
      startSources(offset);
      running = true;
      lastT = offset;
      announce();
    },
    pause() {
      if (!running) return;
      offset = time();
      running = false;
      stopSources();
      announce();
    },
    seek(t) {
      const to = Math.max(0, Math.min(length, t));
      ended = false;
      if (running) startSources(to);
      else offset = to;
      lastT = to;
      bus.emit('transport:seek', { t: to });
    },
  };

  const applyGain = (s: StemChain, ramp = RAMP_SEC) => {
    const g = stemGain(mix, s.id);
    const now = ctx.currentTime;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(s.gain.gain.value, now);
    s.gain.gain.linearRampToValueAtTime(g, now + ramp);
    note('gain', { gain: g, mute: mix.mute[s.id], solo: mix.solo }, s.id);
  };

  const applyEq = (s: StemChain) => {
    const eq = mix.eq[s.id], now = ctx.currentTime;
    s.low.gain.setTargetAtTime(eq.low, now, 0.02);
    s.mid.gain.setTargetAtTime(eq.mid, now, 0.02);
    s.high.gain.setTargetAtTime(eq.high, now, 0.02);
    note('eq', { ...eq }, s.id);
  };

  bus.on('stem:mute', ({ stem, state }) => {
    if (mix.mute[stem] === state) return;
    mix.mute[stem] = state;
    stems.forEach((s) => s.id === stem && applyGain(s));
  });
  bus.on('stem:solo', ({ stem }) => {
    mix.solo = stem;
    stems.forEach((s) => applyGain(s));
  });
  bus.on('stem:eq', ({ stem, low, mid, high }) => {
    mix.eq[stem] = { low: clampDb(low), mid: clampDb(mid), high: clampDb(high) };
    stems.forEach((s) => s.id === stem && applyEq(s));
  });
  bus.on('app:reset', () => {
    mix = emptyMix();
    stems.forEach((s) => { applyGain(s); applyEq(s); });
  });
  bus.on('app:pause', () => transport.pause());

  const buildChain = (id: StemId, buffer: AudioBuffer, homeSeat: Vec3): StemChain => {
    const gain = ctx.createGain();
    const trim = ctx.createGain();
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = EQ_FREQ.low;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = EQ_FREQ.mid; mid.Q.value = 0.8;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = EQ_FREQ.high;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.rolloffFactor = 0.6;
    setPos(panner, homeSeat);
    gain.connect(trim).connect(low).connect(mid).connect(high).connect(panner).connect(master);
    return { id, buffer, homeSeat, source: null, gain, trim, low, mid, high, panner };
  };

  const release = () => {
    stopSources();
    for (const s of stems) [s.gain, s.trim, s.low, s.mid, s.high, s.panner].forEach((n) => n.disconnect());
    stems = []; // buffers are now unreferenced and can be collected
  };

  async function load(id: PieceId, manifest: PieceManifest, b: Beats, base: string) {
    transport.pause();
    release();
    const decoded = await Promise.all(manifest.stems.map(async (s) => {
      const bytes = await fetchBytes(`${base}/${s.file}`);
      return { s, buffer: await ctx.decodeAudioData(bytes) };
    }));
    stems = decoded.map(({ s, buffer }) => buildChain(s.id, buffer, s.homeSeat));
    piece = id;
    beats = b;
    length = Math.min(manifest.durationSec, ...stems.map((s) => s.buffer.duration));
    offset = 0; lastT = 0; ended = false;
    mix = emptyMix();
    stems.forEach((s) => { applyGain(s, 0); applyEq(s); });
    const decodedMB = stems.reduce((n, s) => n + s.buffer.length * s.buffer.numberOfChannels * 4, 0) / 1e6;
    note('load', { piece: id, stems: stems.length, length, decodedMB: +decodedMB.toFixed(1) });
    return { decodedMB };
  }

  function update() {
    if (running) {
      const t = time();
      for (const b of beatsCrossed(beats.beats, beats.downbeats, lastT, t)) bus.emit('beat', b);
      lastT = t;
      if (!ended && raw() >= length) {
        ended = true;
        offset = length;
        running = false;
        stopSources();
        announce();
        if (piece) bus.emit('piece:end', { id: piece });
      }
    }
    if (opts.registry) {
      // The summoned creature moves to the reach spot; its sound follows its collider, never its mesh.
      const centers = new Map(opts.registry.all().filter((t) => t.kind === 'creature' && t.stem).map((t) => [t.stem!, t.center]));
      for (const s of stems) setPos(s.panner, centers.get(s.id) ?? s.homeSeat);
    }
  }

  function setListener(pos: Vec3, f: Vec3, u: Vec3) {
    const l = ctx.listener;
    if (l.positionX) {
      const now = ctx.currentTime;
      l.positionX.setTargetAtTime(pos[0], now, 0.01); l.positionY.setTargetAtTime(pos[1], now, 0.01); l.positionZ.setTargetAtTime(pos[2], now, 0.01);
      l.forwardX.setTargetAtTime(f[0], now, 0.01); l.forwardY.setTargetAtTime(f[1], now, 0.01); l.forwardZ.setTargetAtTime(f[2], now, 0.01);
      l.upX.setTargetAtTime(u[0], now, 0.01); l.upY.setTargetAtTime(u[1], now, 0.01); l.upZ.setTargetAtTime(u[2], now, 0.01);
    } else {
      l.setPosition(...pos);
      l.setOrientation(...f, ...u);
    }
  }

  const audio: AudioApi = {
    async unlock() {
      // A one-sample silent buffer started inside the user gesture keeps strict browsers happy.
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start();
      await ctx.resume();
    },
    context: () => ctx,
    sfxOut(pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      setPos(p, pos);
      p.connect(sfx);
      return p;
    },
  };

  return { audio, transport, load, update, setListener, stems: () => stems, mix: () => mix, log };
}

function setPos(p: PannerNode, [x, y, z]: Vec3) {
  if (p.positionX) {
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
  } else {
    p.setPosition(x, y, z);
  }
}

export { STEMS };

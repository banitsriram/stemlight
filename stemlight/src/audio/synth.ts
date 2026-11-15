// Code-synthesised one-shots for the user's own parts and the count-in ticks. No sample files, so
// nothing to license: timpani-style drum (pads), harp pluck, soft piano key, tick.
//
// The harp and the keys are rendered once per note into an AudioBuffer (cached per audio context) and played
// back through a velocity lowpass: a physically modelled plucked string (Karplus-Strong, tuned to the cent
// with an allpass) for the harp; for the keys, piano-like partials stretched by string stiffness, two strings
// a fraction of a cent apart so the tone beats and blooms, a two-stage decay and a felt-hammer thump.
// warmVoices() renders a set of notes ahead (during the count-in), so no note is computed on the first strike.
import type { Instrument, PieceManifest } from '../contracts';

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The i-th note of the piece's scale, counting up from the tonic (wraps into higher octaves). */
export function scaleNote(scale: PieceManifest['scale'], i: number): number {
  const n = scale.steps.length;
  const oct = Math.floor(i / n), step = ((i % n) + n) % n;
  return scale.tonic + 12 * oct + scale.steps[step];
}

function env(ctx: BaseAudioContext, out: AudioNode, when: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.setTargetAtTime(0, when + attack, decay / 4);
  g.connect(out);
  return g;
}

function partial(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, f: number, when: number, amp: number, decay: number, glide = 1) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, when);
  if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide, when + 0.25);
  o.connect(env(ctx, out, when, amp, 0.004, decay));
  o.start(when);
  o.stop(when + decay * 1.6 + 0.05);
}

let noise: AudioBuffer | null = null;
function noiseBurst(ctx: BaseAudioContext, out: AudioNode, when: number, amp: number, cutoff: number, len = 0.06) {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  src.connect(lp).connect(env(ctx, out, when, amp, 0.002, len));
  src.start(when);
  src.stop(when + len * 2 + 0.02);
}

/** A fixed pseudo-random sequence, so every render of a note is identical (and tests are repeatable). */
function rng(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => { x = (x * 16807) % 2147483647; return x / 1073741823.5 - 1; };
}

/**
 * A plucked string (Karplus-Strong): a burst of soft noise circulating in a delay line one period long, each
 * pass averaged (which damps the high harmonics first, as a real string does) and scaled for a T60 that is
 * longer on low strings. A first-order allpass supplies the fractional delay, so the pitch is exact.
 */
export function renderPluck(sr: number, f: number): Float32Array<ArrayBuffer> {
  const t60 = Math.min(4, Math.max(0.9, 2.6 * Math.sqrt(440 / f)));
  const n = Math.floor(sr * Math.min(4, t60 * 1.1));
  // Loop delay: the line (L) minus half a sample (the average reads the sample after the current one) plus the
  // allpass's d, which must equal one period.
  const D = sr / f;
  let L = Math.floor(D + 0.5), d = D + 0.5 - L;
  if (d < 0.1) { L -= 1; d += 1; }
  const C = (1 - d) / (1 + d);
  const rho = 0.001 ** (1 / (f * t60)) / Math.cos(Math.PI * f / sr); // per-period loss, net of the averaging
  // Excitation: noise softened by a one-pole (a fingertip, not a plectrum), with the pluck 1/7 along the
  // string (that harmonic and its multiples drop out, as plucking near the end of a harp string sounds).
  const r = rng(Math.round(f * 1000)), line = new Float32Array(L);
  let y = 0;
  for (let i = 0; i < L; i++) { y += 0.45 * (r() - y); line[i] = y; }
  const p = Math.max(1, Math.round(L / 7)), exc = Float32Array.from(line);
  for (let i = 0; i < L; i++) line[i] = exc[i] - 0.8 * exc[(i - p + L) % L];
  let mean = 0;
  for (let i = 0; i < L; i++) mean += line[i];
  mean /= L;
  for (let i = 0; i < L; i++) line[i] -= mean; // no DC thump
  const out = new Float32Array(n);
  let x1 = 0, y1 = 0, k = 0, peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const a = line[k], b = line[(k + 1) % L];
    const lp = 0.5 * (a + b) * Math.min(rho, 0.99999);
    const ap = C * lp + x1 - C * y1;
    x1 = lp; y1 = ap;
    line[k] = ap;
    k = (k + 1) % L;
    out[i] = a;
    peak = Math.max(peak, Math.abs(a));
  }
  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.9 * (i > n - fade ? (n - i) / fade : 1);
  return out;
}

/**
 * A piano-like key: partials n·f·√(1 + B·n²) (string stiffness stretches them sharp), each from two strings
 * 0.6 cent apart, higher partials dying faster, a quick first decay then a long aftersound, and a short
 * felt-hammer thump. Sines run as rotating phasors, so a note renders in a few milliseconds.
 */
export function renderKey(sr: number, f: number): Float32Array<ArrayBuffer> {
  const len = 3.5, n = Math.floor(sr * len), out = new Float32Array(n);
  const B = 0.00035, t1 = Math.min(12, 9 * (220 / f) ** 0.4); // T60 of the fundamental's long tail
  for (let h = 1; h <= 9; h++) {
    const fh = (h * f * Math.sqrt(1 + B * h * h)) / Math.sqrt(1 + B); // the fundamental lands exactly on f
    if (fh > sr * 0.45) break;
    const amp = 1 / h ** 1.15 * (h === 1 ? 0.9 : 1);
    const tau = t1 / (1 + 0.55 * (h - 1)) / 6.9; // T60 -> time constant
    for (const [detune, share] of [[2 ** (-0.3 / 1200), 0.68], [2 ** (0.3 / 1200), 0.32]] as const) { // a gentle beat, never a cancellation
      const w = (2 * Math.PI * fh * detune) / sr;
      let s1 = 0, s2 = -Math.sin(w); // sin(0), sin(-w)
      const c = 2 * Math.cos(w);
      const kFast = Math.exp(-1 / (sr * tau * 0.18)), kSlow = Math.exp(-1 / (sr * tau));
      let eF = 0.62, eS = 0.38;
      for (let i = 0; i < n; i++) {
        const s0 = c * s1 - s2; s2 = s1; s1 = s0;
        out[i] += amp * share * s0 * (eF + eS);
        eF *= kFast; eS *= kSlow;
      }
    }
  }
  // Felt hammer: 25 ms of low-passed noise at the start; a 3 ms attack ramp on the whole note.
  const r = rng(Math.round(f * 7919)), thump = Math.floor(sr * 0.025);
  let y = 0;
  for (let i = 0; i < thump; i++) { y += 0.2 * (r() - y); out[i] += y * 0.5 * (1 - i / thump) ** 2; }
  const atk = Math.floor(sr * 0.003), fade = Math.floor(sr * 0.15);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.9 * Math.min(1, i / atk) * (i > n - fade ? (n - i) / fade : 1);
  return out;
}

const voiceCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** The rendered note for a harp or keys hit, built on first use and kept for this audio context. */
export function voiceBuffer(ctx: BaseAudioContext, instrument: 'harp' | 'keys', pitch: number): AudioBuffer {
  let m = voiceCache.get(ctx);
  if (!m) voiceCache.set(ctx, (m = new Map()));
  const key = `${instrument}:${pitch}`;
  let buf = m.get(key);
  if (!buf) {
    const data = instrument === 'harp' ? renderPluck(ctx.sampleRate, hz(pitch)) : renderKey(ctx.sampleRate, hz(pitch));
    buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    if (buf.copyToChannel) buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data);
    (buf as AudioBuffer & { voicePitch?: number }).voicePitch = pitch; // lets the browser timing test tell a replayed note's pitch
    m.set(key, buf);
  }
  return buf;
}

/** Renders these notes ahead, one per macrotask, so the first strike plays at once and no frame stalls. */
export function warmVoices(ctx: BaseAudioContext, instrument: 'harp' | 'keys', pitches: number[]): void {
  pitches.forEach((p, i) => setTimeout(() => voiceBuffer(ctx, instrument, p), 15 * i));
}

/** Plays one hit of the user's instrument at context time `when`. vel is 1..127. */
export function playVoice(ctx: BaseAudioContext, out: AudioNode, instrument: Instrument, pitch: number, vel: number, when: number): void {
  const v = Math.max(1, Math.min(127, vel)) / 127;
  const f = hz(pitch);
  if (instrument === 'pads') {
    // Timpani-like: inharmonic membrane partials, a slight downward glide and a soft mallet thump.
    const amp = 0.55 * v ** 1.3;
    partial(ctx, out, 'sine', f, when, amp, 1.4, 0.985);
    partial(ctx, out, 'sine', f * 1.5, when, amp * 0.45, 0.9, 0.99);
    partial(ctx, out, 'sine', f * 1.98, when, amp * 0.25, 0.6);
    partial(ctx, out, 'sine', f * 2.44, when, amp * 0.12, 0.4);
    noiseBurst(ctx, out, when, amp * 0.5, 900 + 1500 * v);
  } else {
    // Harp or keys: the rendered note, softer strikes darker (a lowpass) as well as quieter.
    const harp = instrument === 'harp';
    const src = ctx.createBufferSource();
    src.buffer = voiceBuffer(ctx, harp ? 'harp' : 'keys', pitch);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = (harp ? 1800 : 1200) + (harp ? 9000 : 8000) * v ** 1.5;
    const g = ctx.createGain();
    g.gain.value = harp ? 0.42 * v : 0.36 * v ** 1.2;
    src.connect(lp).connect(g).connect(out);
    src.start(when);
  }
}

/** A soft count-in tick; the downbeat tick is higher. */
export function playTick(ctx: BaseAudioContext, out: AudioNode, when: number, accent: boolean): void {
  partial(ctx, out, 'sine', accent ? 1760 : 1320, when, 0.12, 0.05);
}

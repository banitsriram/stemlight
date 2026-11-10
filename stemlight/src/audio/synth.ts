// Code-synthesised one-shots for the user's own parts and the count-in ticks. No sample files, so
// nothing to license: timpani-style drum (pads), harp pluck, soft key, tick.
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
  } else if (instrument === 'harp') {
    const amp = 0.32 * v;
    for (let n = 1; n <= 6; n++) partial(ctx, out, 'sine', f * n, when, amp / n ** 1.2, 1.8 / n ** 0.6);
    noiseBurst(ctx, out, when, amp * 0.15, 4000, 0.01);
  } else {
    const amp = 0.28 * v;
    partial(ctx, out, 'triangle', f, when, amp, 1.2);
    partial(ctx, out, 'sine', f * 2, when, amp * 0.3, 0.6);
    partial(ctx, out, 'sine', f * 4, when, amp * 0.08, 0.25);
  }
}

/** A soft count-in tick; the downbeat tick is higher. */
export function playTick(ctx: BaseAudioContext, out: AudioNode, when: number, accent: boolean): void {
  partial(ctx, out, 'sine', accent ? 1760 : 1320, when, 0.12, 0.05);
}

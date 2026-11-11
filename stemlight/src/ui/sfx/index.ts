// Action sound effects (PLAN s8), code-synthesised and played from where the action happens through sfxOut.
// No sample files, so nothing to license.
import type { AppContext, MuteState, StemId, Vec3 } from '../../contracts';

const FRONT: Vec3 = [0, 1.1, -0.6]; // transport sounds: just ahead of the seat

let noiseBuf: AudioBuffer | null = null;

/** One-shots on a context; `out` is the node to play into. Exported for tests. */
export function voices(ac: BaseAudioContext) {
  const tone = (out: AudioNode, f: number, when: number, amp: number, decay: number, type: OscillatorType = 'sine', glideTo?: number) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, when + decay);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.006);
    g.gain.setTargetAtTime(0, when + 0.006, decay / 4);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + decay * 1.5 + 0.05);
  };
  const noise = (out: AudioNode, when: number, amp: number, len: number, f0: number, f1: number, q = 1.5) => {
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let seed = 11;
      for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
    }
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, when);
    bp.frequency.exponentialRampToValueAtTime(f1, when + len);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + len * 0.4);
    g.gain.linearRampToValueAtTime(0, when + len);
    src.connect(bp).connect(g).connect(out);
    src.start(when);
    src.stop(when + len + 0.02);
  };
  return {
    whoosh: (o: AudioNode, t: number) => noise(o, t, 0.5, 0.55, 300, 2400, 0.8),
    chime: (o: AudioNode, t: number) => [2093, 2794, 3729].forEach((f, i) => tone(o, f, t + i * 0.02, 0.09, 1.2)), // glassy, inharmonic
    clink: (o: AudioNode, t: number) => { tone(o, 4186, t, 0.14, 0.25, 'triangle'); tone(o, 6272, t, 0.06, 0.15); },
    bloom: (o: AudioNode, t: number) => [261.6, 329.6, 392].forEach((f) => tone(o, f, t, 0.08, 1.4, 'triangle')),
    soloOn: (o: AudioNode, t: number) => { tone(o, 659.3, t, 0.12, 0.35); tone(o, 987.8, t + 0.12, 0.12, 0.5); },
    soloOff: (o: AudioNode, t: number) => { tone(o, 987.8, t, 0.1, 0.35); tone(o, 659.3, t + 0.12, 0.1, 0.5); },
    sweep: (o: AudioNode, t: number) => noise(o, t, 0.25, 0.4, 400, 3000, 6),
    tapeStop: (o: AudioNode, t: number) => tone(o, 220, t, 0.12, 0.45, 'sawtooth', 40),
    tick: (o: AudioNode, t: number) => tone(o, 1800, t, 0.06, 0.03, 'square'),
    snip: (o: AudioNode, t: number) => { noise(o, t, 0.4, 0.08, 5000, 2500, 3); tone(o, 3136, t + 0.03, 0.06, 0.2); },
    unsnip: (o: AudioNode, t: number) => { noise(o, t, 0.4, 0.08, 2500, 5000, 3); tone(o, 2349, t + 0.03, 0.06, 0.2); },
    reset: (o: AudioNode, t: number) => [523.3, 392, 261.6].forEach((f, i) => tone(o, f, t + i * 0.1, 0.08, 0.6)),
  };
}

export function initSfx(ctx: AppContext, posOf: (stem: StemId) => Vec3 | undefined) {
  let v: ReturnType<typeof voices> | null = null;
  const play = (name: keyof ReturnType<typeof voices>, pos: Vec3 = FRONT) => {
    const ac = ctx.audio.context();
    if (ac.state !== 'running') return; // before the first Enter nothing can sound
    v ??= voices(ac);
    v[name](ctx.audio.sfxOut(pos), ac.currentTime + 0.005);
  };
  const at = (stem: StemId) => posOf(stem) ?? FRONT;
  const mute: Partial<Record<StemId, MuteState>> = {};
  let lastEq = 0, lastTick = 0;

  ctx.bus.on('piece:ready', () => { for (const k in mute) delete mute[k as StemId]; });
  ctx.bus.on('gaze:summon', ({ stem }) => play('whoosh', at(stem)));
  ctx.bus.on('stem:mute', ({ stem, state }) => {
    const was = mute[stem] ?? 'on';
    mute[stem] = state;
    if (state === was) return;
    if (state === 'held') play('chime', at(stem));
    else if (state === 'locked') play('clink', at(stem));
    else play('bloom', at(stem));
  });
  ctx.bus.on('stem:solo', ({ stem }) => play(stem ? 'soloOn' : 'soloOff', stem ? at(stem) : FRONT));
  ctx.bus.on('stem:eq', ({ stem }) => {
    const now = performance.now();
    if (now - lastEq > 450) play('sweep', at(stem)); // one sweep per stretch, not per frame
    lastEq = now;
  });
  ctx.bus.on('transport:state', ({ playing }) => { if (!playing) play('tapeStop'); });
  ctx.bus.on('transport:seek', () => {
    // Loop wraps also seek; scrub ticks are only for seeks while paused.
    const now = performance.now();
    if (!ctx.transport.playing() && now - lastTick > 60) { play('tick'); lastTick = now; }
  });
  ctx.bus.on('cut:add', ({ cut }) => play('snip', at(cut.stem)));
  ctx.bus.on('cut:remove', () => play('unsnip'));
  ctx.bus.on('app:reset', () => { play('reset'); for (const k in mute) delete mute[k as StemId]; });
}

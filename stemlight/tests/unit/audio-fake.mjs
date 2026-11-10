// A fake AudioContext for node tests: records source starts, oscillator starts and the full
// automation timeline of every AudioParam, so tests can ask what a gain is at any context time.

export function param(v = 0) {
  const p = {
    value: v, events: [{ type: 'set', v, t: -Infinity }],
    cancelScheduledValues(t) { p.events = p.events.filter((e) => e.t < t); },
    setValueAtTime(x, t) { p.events.push({ type: 'set', v: x, t }); p.value = x; },
    linearRampToValueAtTime(x, t) { p.events.push({ type: 'ramp', v: x, t }); p.value = x; },
    exponentialRampToValueAtTime(x, t) { p.events.push({ type: 'ramp', v: x, t }); p.value = x; },
    setTargetAtTime(x, t) { p.events.push({ type: 'set', v: x, t }); p.value = x; },
    /** Value at context time t (linear ramps interpolated). */
    at(t) {
      const ev = [...p.events].sort((a, b) => a.t - b.t);
      let cur = ev[0].v, curT = ev[0].t;
      for (const e of ev) {
        if (e.t > t) {
          if (e.type === 'ramp' && Number.isFinite(curT)) return cur + (e.v - cur) * ((t - curT) / (e.t - curT));
          return cur;
        }
        cur = e.v; curT = e.t;
      }
      return cur;
    },
  };
  return p;
}

const node = (extra = {}) => ({ connect(n) { return n; }, disconnect() {}, ...extra });

export function fakeContext() {
  const starts = [], voices = [];
  const ctx = {
    currentTime: 0, sampleRate: 48000, destination: node(), starts, voices,
    listener: { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(-1), upX: param(), upY: param(1), upZ: param() },
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param(), gain: param() }),
    createPanner: () => node({ positionX: param(), positionY: param(), positionZ: param() }),
    createBuffer: (c, len, sr) => ({ numberOfChannels: c, length: len, duration: len / sr, sampleRate: sr, getChannelData: () => new Float32Array(len) }),
    createOscillator() {
      const o = node({ type: 'sine', frequency: param(440), start(when) { voices.push({ when, f: o.frequency.value }); }, stop() {} });
      return o;
    },
    createBufferSource() {
      const src = node({
        buffer: null, onended: null, stopAt: null,
        start(when = 0, offset = 0) { starts.push({ src, when, offset }); },
        stop(when = 0) { src.stopAt = when; },
      });
      return src;
    },
    decodeAudioData: async (bytes) => ({ numberOfChannels: 1, length: bytes.byteLength, duration: bytes.byteLength / 48000 }),
    resume: async () => {},
  };
  return ctx;
}

export const STEMS = ['vln', 'vla_vc', 'cb', 'fl', 'reeds', 'hn', 'brass', 'perc'];
export const manifest = (sec, replace = [{ stem: 'perc', instrument: 'pads' }]) => ({
  id: 'fixture', title: 't', composer: 'c', durationSec: sec,
  stems: STEMS.map((id, i) => ({ id, file: `stems/${id}.opus`, homeSeat: [i, 1, -2], pitchRange: [40, 80] })),
  scale: { tonic: 62, steps: [0, 2, 4, 5, 7, 9, 11] }, replace, credits: [],
});
/** 120 bpm, 4/4: beats every 0.5 s, downbeats every 2 s. */
export const beats120 = (sec) => ({
  tempo: [{ t: 0, bpm: 120 }],
  beats: Array.from({ length: sec * 2 }, (_, i) => i * 0.5),
  downbeats: Array.from({ length: sec / 2 }, (_, i) => i * 2),
});

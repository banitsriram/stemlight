// The harp and keyboard voices (15 Nov): a modelled plucked string and a piano-like key, rendered once per note.
// Checked here without ears: every note of both pieces' harp and keyboard octaves is in tune (fundamental within
// 3 cents), rings and then dies away like a struck string, never clips, has no DC offset, and renders fast
// enough to build ahead during a count-in. How they sound to a person is not claimed by this file.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderKey, renderPluck, voiceBuffer, playVoice } from '../../src/audio/synth.ts';
import { fakeContext } from './audio-fake.mjs';

const SR = 48000;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const HARP = [72, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 86, 88]; // Beethoven 72..84, Dvořák 76..88
const KEYS = [52, 54, 55, 57, 59, 60, 62, 63, 64, 65, 67, 68, 70, 72]; // Dvořák 52..64, Beethoven 60..72

/** Fundamental by autocorrelation over a window, refined with a parabola: Hz. */
function pitchOf(x, sr, from, len, f0) {
  const w = x.subarray(Math.floor(from * sr), Math.floor(from * sr) + Math.floor(len * sr));
  const lagLo = Math.floor(sr / (f0 * 1.15)), lagHi = Math.ceil(sr / (f0 / 1.15));
  const ac = (lag) => { let s = 0; for (let i = 0; i + lag < w.length; i++) s += w[i] * w[i + lag]; return s; };
  let best = lagLo, bv = -Infinity;
  for (let lag = lagLo; lag <= lagHi; lag++) { const v = ac(lag); if (v > bv) { bv = v; best = lag; } }
  const a = ac(best - 1), b = bv, c = ac(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sr / (best + shift);
}
const cents = (f, ref) => 1200 * Math.log2(f / ref);
/** The strongest frequency within ±25 cents of `f0` (Goertzel scan, 0.1-cent steps): the fundamental itself. */
function fundamental(x, sr, from, len, f0) {
  const a = Math.floor(from * sr), n = Math.floor(len * sr);
  let best = f0, bp = -1;
  for (let c = -25; c <= 25; c += 0.1) {
    const f = f0 * 2 ** (c / 1200), w = (2 * Math.PI * f) / sr, k = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const s0 = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)) + k * s1 - s2; s2 = s1; s1 = s0; }
    const p = s1 * s1 + s2 * s2 - k * s1 * s2;
    if (p > bp) { bp = p; best = f; }
  }
  return best;
}
const rms = (x, sr, from, len) => { let s = 0; const a = Math.floor(from * sr), n = Math.floor(len * sr); for (let i = a; i < a + n; i++) s += x[i] * x[i]; return Math.sqrt(s / n); };

test('harp: every string in tune within 3 cents, ringing then dying away, never clipping', () => {
  for (const m of HARP) {
    const x = renderPluck(SR, hz(m));
    assert.ok(x.every(Number.isFinite), `${m}: finite`);
    const c = cents(pitchOf(x, SR, 0.1, 0.25, hz(m)), hz(m));
    assert.ok(Math.abs(c) < 3, `${m}: ${c.toFixed(2)} cents off`);
    const peak = x.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
    assert.ok(peak <= 0.9 + 1e-6, `${m}: peak ${peak.toFixed(3)}`);
    const early = rms(x, SR, 0.02, 0.1), late = rms(x, SR, x.length / SR - 0.35, 0.2);
    assert.ok(early > 0.05, `${m}: audible at the start (${early.toFixed(3)})`);
    assert.ok(late < early / 8, `${m}: dies away (${early.toFixed(3)} -> ${late.toFixed(4)})`);
    const dc = x.reduce((s, v) => s + v, 0) / x.length;
    assert.ok(Math.abs(dc) < 0.01, `${m}: no DC (${dc.toFixed(4)})`);
  }
});

test('harp: low strings ring longer than high ones, and the high harmonics fade first', () => {
  const lo = renderPluck(SR, hz(72)), hi = renderPluck(SR, hz(88));
  assert.ok(lo.length > hi.length, `${(lo.length / SR).toFixed(2)} s vs ${(hi.length / SR).toFixed(2)} s`);
  // Brightness: share of energy in the sample-to-sample difference (a crude high-pass), early vs half a second in.
  const bright = (x, from) => { let d = 0, e = 0; const a = Math.floor(from * SR); for (let i = a; i < a + 4800; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] ** 2; } return d / e; };
  assert.ok(bright(lo, 0.5) < bright(lo, 0.01), 'darker as it rings, like a real string');
});

test('keys: every key in tune within 3 cents, a quick first decay then a long tail, never clipping', () => {
  for (const m of KEYS) {
    const x = renderKey(SR, hz(m));
    assert.ok(x.every(Number.isFinite), `${m}: finite`);
    const c = cents(fundamental(x, SR, 0.1, 1.0, hz(m)), hz(m)); // stretched overtones, as on a piano: measure the fundamental itself
    assert.ok(Math.abs(c) < 3, `${m}: ${c.toFixed(2)} cents off`);
    assert.ok(x.reduce((p, v) => Math.max(p, Math.abs(v)), 0) <= 0.9 + 1e-6, `${m}: no clipping`);
    const a = rms(x, SR, 0.02, 0.1), b = rms(x, SR, 0.8, 0.1), z = rms(x, SR, 2.4, 0.1);
    assert.ok(b < a * 0.75 && b > a * 0.08, `${m}: first decay (${a.toFixed(3)} -> ${b.toFixed(3)})`);
    assert.ok(z < b && z > a * 0.005, `${m}: a tail that is still there at 2.4 s (${z.toFixed(4)})`);
  }
});

test('rendering is fast enough to build a set of 8 notes during a one-bar count-in', () => {
  const t0 = performance.now();
  for (const m of [76, 78, 79, 81, 83, 84, 86, 88]) renderPluck(SR, hz(m));
  const t1 = performance.now();
  for (const m of [52, 54, 55, 57, 59, 60, 62, 64]) renderKey(SR, hz(m));
  const t2 = performance.now();
  // A bar at the pieces' tempos is over 1.5 s; one note renders per macrotask, so the frame cost is per note.
  assert.ok((t1 - t0) / 8 < 25, `harp: ${((t1 - t0) / 8).toFixed(1)} ms per note`);
  assert.ok((t2 - t1) / 8 < 40, `keys: ${((t2 - t1) / 8).toFixed(1)} ms per note`);
});

test('a hit plays the cached note through a velocity lowpass: softer is darker and quieter', () => {
  const ctx = fakeContext();
  const nodes = [];
  const mk = ctx.createBiquadFilter, mg = ctx.createGain;
  ctx.createBiquadFilter = () => { const n = mk(); nodes.push(n); return n; };
  ctx.createGain = () => { const n = mg(); nodes.push(n); return n; };
  playVoice(ctx, ctx.destination, 'harp', 79, 30, 1);
  playVoice(ctx, ctx.destination, 'harp', 79, 120, 2);
  assert.equal(ctx.starts.length, 2, 'two buffer playbacks');
  assert.ok(ctx.starts[0].src.buffer === voiceBuffer(ctx, 'harp', 79), 'the same cached note both times');
  const [lpSoft, gSoft, lpLoud, gLoud] = nodes;
  assert.ok(lpSoft.frequency.value < lpLoud.frequency.value, 'softer strike, darker');
  assert.ok(gSoft.gain.value < gLoud.gain.value, 'softer strike, quieter');
  assert.deepEqual(ctx.starts.map((s) => s.when), [1, 2], 'at the asked times');
});

// Real-browser run of F12 (harp) and F13 (keyboard): "notes recorded and looped", every note in key, on
// the real Web Audio clock in headless Chromium, with the real Dvořák piece (fl → harp, reeds → keys):
//  - a 4-beat take on fl (around 40 s), then on reeds (around 60 s); one strike per pass on passes 0-2,
//    50-70 ms off the 1/8 grid, using the pitches the harp / keyboard surfaces offer (octaveFor);
//  - every recorded hit lands on the piece's 1/8 grid (its beats and the midpoints between them);
//  - every recorded pitch is in E minor and in the surface's pitch set; the part has the right instrument;
//  - every wrap is exactly one region length after the last (sample-exact loop);
//  - on later passes every earlier hit is re-scheduled at wrap + tOffset within one sample (oscillator
//    start times and fundamentals read by wrapping OscillatorNode.start and, for buffer-played notes, AudioBufferSourceNode.start).
// Usage (from stemlight/): node tests/browser/harp-keys-loop.mjs
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8098;
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
let failed = false;
const check = (ok, msg) => { log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

// The surfaces' pitch sets, re-derived from the manifest the same way src/ui/remake/layout.ts octaveFor does.
const manifest = JSON.parse(readFileSync(new URL('../../public/pieces/dvorak9/manifest.json', import.meta.url), 'utf8'));
const { scale } = manifest;
const scaleNote = (i) => { const n = scale.steps.length; return scale.tonic + 12 * Math.floor(i / n) + scale.steps[((i % n) + n) % n]; };
const octaveFor = (range, count = 8) => {
  const n = scale.steps.length;
  const octave = (k) => Array.from({ length: count }, (_, i) => scaleNote(k * n + i));
  const mid = (range[0] + range[1]) / 2;
  let best = octave(0), score = Infinity;
  for (let k = -4; k <= 4; k++) {
    const o = octave(k), lo = o[0], hi = o[o.length - 1];
    const s = (lo >= range[0] && hi <= range[1] ? 0 : 1000) + Math.abs((lo + hi) / 2 - mid);
    if (s < score) { score = s; best = o; }
  }
  return best;
};
const rangeOf = (id) => manifest.stems.find((s) => s.id === id).pitchRange;
const HARP = [76, 78, 79, 81, 83, 84, 86, 88], KEYS = [52, 54, 55, 57, 59, 60, 62, 64];
const inKey = (p) => scale.steps.includes((((p - scale.tonic) % 12) + 12) % 12);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// The IWSDK dev plugin allows one dev runtime per workspace. If another session already runs `vite` here
// (port 8081 from vite.config.ts), attach to that server instead of failing: it serves the same source tree,
// and this test's fresh browser context has its own IndexedDB.
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let viteOut = '';
let BASE = `https://localhost:${PORT}`;
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 150000);
  const onData = (d) => { viteOut += String(d); if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } };
  vite.stdout.on('data', onData);
  vite.stderr.on('data', onData);
  vite.on('exit', (code) => {
    clearTimeout(t);
    if (viteOut.includes('already has a dev runtime')) { BASE = 'https://localhost:8081'; resolve(); }
    else reject(new Error(`vite exited (${code}); is port ${PORT} busy?\n${viteOut}`));
  });
});
if (!BASE.endsWith(String(PORT))) log(`note: this workspace already has a dev runtime; attached to it at ${BASE} instead of starting vite on ${PORT}`);
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  check(JSON.stringify(octaveFor(rangeOf('fl'))) === JSON.stringify(HARP) && JSON.stringify(octaveFor(rangeOf('reeds'))) === JSON.stringify(KEYS),
    `surface pitch sets from octaveFor: harp (fl) ${octaveFor(rangeOf('fl')).join(',')}, keys (reeds) ${octaveFor(rangeOf('reeds')).join(',')}`);
  check(['fl:harp', 'reeds:keys'].every((x) => manifest.replace.some((r) => `${r.stem}:${r.instrument}` === x)), `manifest replace has fl→harp and reeds→keys`);

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(() => {
    window.__oscStarts = [];
    // The synth sets each partial's pitch with frequency.setValueAtTime, which .value doesn't reflect, so
    // remember the last value set on each param and read it when the oscillator starts.
    const setV = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (v, t) { this.__v = v; return setV.call(this, v, t); };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when = 0) { window.__oscStarts.push({ when, f: this.frequency.__v ?? this.frequency.value }); return start.call(this, when); };
    // Since 15 Nov the harp and keys play pre-rendered notes from a buffer, tagged with their pitch.
    const play = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
      const p = this.buffer?.voicePitch;
      if (p !== undefined) window.__oscStarts.push({ when, f: 440 * 2 ** ((p - 69) / 12) });
      return play.call(this, when, ...rest);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const consoleTail = [];
  page.on('console', (m) => { consoleTail.push(`${m.type()}: ${m.text().slice(0, 160)}`); if (consoleTail.length > 15) consoleTail.shift(); });
  page.on('framenavigated', (fr) => { if (fr === page.mainFrame()) consoleTail.push(`navigated: ${fr.url()}`); });
  const ready = () => page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0 && location.search.includes('dvorak9'), null, { timeout: 90000 }).catch(async (e) => {
    const state = await page.evaluate(() => ({ url: location.href, has: !!window.__stemlight, stems: window.__stemlight?.engine.stems().length })).catch((x) => String(x));
    throw new Error(`${e.message.split('\n')[0]}; page ${JSON.stringify(state)}; last console:\n  ${consoleTail.join('\n  ')}`);
  });
  await page.goto(`${BASE}/?piece=dvorak9`, { timeout: 90000, waitUntil: "commit" });
  await ready();
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  await page.reload({ timeout: 90000, waitUntil: "commit" });
  await ready();
  await page.evaluate(() => window.__stemlight.engine.audio.unlock());
  const beats = await page.evaluate(() => [...window.__stemlight.engine.beats().beats]);

  // An even-indexed beat nearest `near`, the region 4 beats long, and its 8 eighth-grid points.
  const region = (near) => {
    let k = beats.reduce((b, x, i) => (Math.abs(x - near) < Math.abs(beats[b] - near) ? i : b), 0);
    if (k % 2) k += Math.abs(beats[k + 1] - near) <= Math.abs(beats[k - 1] - near) ? 1 : -1;
    const grid = [];
    for (let i = k; i < k + 4; i++) grid.push(beats[i], (beats[i] + beats[i + 1]) / 2);
    return { t0: beats[k], t1: beats[k + 4], grid };
  };

  const runTake = async (label, cutId, stem, inst, set, pitches, near) => {
    const { t0, t1, grid } = region(near);
    const len = t1 - t0;
    // Strike targets: 60 ms after grid point 1, 60 ms before point 5, 55 ms before point 3.
    const plan = [
      { pass: 0, x: grid[1] + 0.06, want: grid[1], pitch: pitches[0] },
      { pass: 1, x: grid[5] - 0.06, want: grid[5], pitch: pitches[1] },
      { pass: 2, x: grid[3] - 0.055, want: grid[3], pitch: pitches[2] },
    ];
    log(`-- ${label}: cut ${cutId} on ${stem}, region ${t0.toFixed(4)}-${t1.toFixed(4)} s (${len.toFixed(4)} s, beat ≈ ${(len / 4).toFixed(4)} s)`);
    const r = await page.evaluate(async ({ cutId, stem, inst, t0, t1, plan }) => {
      const { ctx, engine, parts } = window.__stemlight;
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const deadline = performance.now() + 60000;
      const t = engine.transport;
      const since = engine.audio.context().currentTime;
      window.__oscStarts = [];
      ctx.bus.emit('cut:add', { cut: { id: cutId, stem, t0, t1 } });
      const lag = [];
      let taking = null;
      for (const s of plan) {
        while (!(engine.pass() === s.pass && t.time() >= s.x)) {
          if (performance.now() > deadline || engine.pass() > s.pass) return { error: `missed strike for pass ${s.pass} (pass ${engine.pass()}, t ${t.time()})` };
          await sleep(2);
        }
        const raw = t.time();
        if (!taking) taking = parts.taking(); // the take as it runs (it ends itself before the wrap after the first empty pass)
        parts.strike(inst, s.pitch, 100, [0, 1, -0.4]);
        lag.push(+(raw - s.x).toFixed(3));
      }
      const len = t1 - t0;
      while (!(engine.pass() >= 3 && t.time() > t0 + 0.9 * len)) {
        if (performance.now() > deadline) return { error: `pass 3 never reached (pass ${engine.pass()}, taking ${JSON.stringify(parts.taking())})` };
        await sleep(5);
      }
      t.pause();
      const wraps = engine.log.filter((e) => e.kind === 'wrap' && e.data.at > since).map((e) => e.data.at);
      const part = parts.parts().find((p) => p.cutId === cutId);
      const cut = parts.cuts().find((c) => c.id === cutId);
      const hitLog = parts.log.filter((e) => e.kind === 'hit').slice(-3).map((e) => e.data);
      return { lag, wraps, part, cut, taking, hitLog, starts: window.__oscStarts, rate: engine.audio.context().sampleRate };
    }, { cutId, stem, inst, t0, t1, plan });
    if (r.error) { check(false, `${label}: ${r.error}`); return; }

    log(`${label} strike lateness vs the target time (ms of scheduler jitter): ${r.lag.map((x) => (x * 1000).toFixed(0)).join(', ')}`);
    log(`${label} hit log (raw → snapped): ${r.hitLog.map((h) => `${h.pitch} ${(+h.raw).toFixed(3)}→${(+h.snapped).toFixed(3)} p${h.pass}`).join('; ')}`);
    const ct0 = r.cut.t0;
    check(Math.abs(ct0 - t0) < 1e-9 && Math.abs(r.cut.t1 - t1) < 1e-9 && r.taking?.instrument === inst, `${label}: cut kept as the beat-aligned region and a ${inst} take ran (taking ${JSON.stringify(r.taking)})`);
    const hits = r.part?.hits ?? [];
    const offs = hits.map((h) => `${h.pitch}@${h.tOffset.toFixed(4)}`);
    const onGrid = hits.every((h) => grid.some((g) => Math.abs(ct0 + h.tOffset - g) < 1e-3));
    const half = len / 8;
    const halfMult = hits.every((h) => Math.abs(h.tOffset / half - Math.round(h.tOffset / half)) * half < 1e-3);
    const expect = plan.map((s) => ({ pitch: s.pitch, off: s.want - t0 }));
    const asPlanned = hits.length === 3 && expect.every((e) => hits.some((h) => h.pitch === e.pitch && Math.abs(h.tOffset - e.off) < 1e-3));
    check(onGrid && asPlanned, `${label}: 3 off-grid strikes (50-70 ms) snapped to the 1/8 grid: ${offs.join(' ')} (expected ${expect.map((e) => `${e.pitch}@${e.off.toFixed(4)}`).join(' ')})`);
    log(`${label} note: tOffsets are ${halfMult ? '' : 'not all '}multiples of len/8 = ${half.toFixed(4)} s within 1 ms (beats vary slightly; the grid check above uses the piece's own beats)`);
    check(hits.length > 0 && hits.every((h) => inKey(h.pitch) && set.includes(h.pitch)), `${label}: every recorded pitch in E minor and in the ${inst} set: ${hits.map((h) => h.pitch).join(',')}`);
    check(r.part?.instrument === inst, `${label}: parts() entry has instrument '${r.part?.instrument}'`);
    const d = r.wraps.slice(1).map((w, i) => w - r.wraps[i]);
    check(r.wraps.length >= 3 && d.every((x) => Math.abs(x - len) < 1e-6), `${label}: ${r.wraps.length} wraps, each exactly ${len.toFixed(6)} s after the last (${d.map((x) => x.toFixed(6)).join(', ')})`);
    const recordedOn = Object.fromEntries(plan.map((s) => [s.pitch, s.pass]));
    let want = 0, found = 0, worst = 0;
    const misses = [];
    for (let k = 1; k <= 3 && k - 1 < r.wraps.length; k++) {
      for (const h of hits) {
        if (recordedOn[h.pitch] >= k) continue;
        want++;
        const at = r.wraps[k - 1] + h.tOffset;
        const s = r.starts.filter((x) => Math.abs(x.f - hz(h.pitch)) < 0.01).map((x) => Math.abs(x.when - at)).sort((a, b) => a - b)[0];
        if (s !== undefined && s < 1 / r.rate) { found++; worst = Math.max(worst, s); } else misses.push(`${h.pitch} pass ${k} (nearest ${s === undefined ? 'none' : (s * 1e3).toFixed(3) + ' ms'})`);
      }
    }
    check(want === 6 && found === want, `${label}: hits replayed on later passes at wrap + offset: ${found}/${want}, worst ${(worst * 1e6).toFixed(2)} µs (one sample = ${(1e6 / r.rate).toFixed(1)} µs)${misses.length ? '; missing ' + misses.join(', ') : ''}`);
  };

  // Pitches chosen so no struck note's overtone (harp f·n, keys 2f/4f) lands on another struck fundamental.
  await runTake('harp', 'harp1', 'fl', 'harp', HARP, [78, 81, 84], 40);
  await page.evaluate(() => window.__stemlight.ctx.bus.emit('cut:remove', { id: 'harp1' }));
  const after = await page.evaluate(() => ({ cuts: window.__stemlight.parts.cuts().length, parts: window.__stemlight.parts.parts().length, taking: window.__stemlight.parts.taking() }));
  check(after.cuts === 0 && after.parts === 0 && after.taking === null, `cut:remove cleared the harp cut, part and take (${JSON.stringify(after)})`);
  await runTake('keys', 'keys1', 'reeds', 'keys', KEYS, [54, 57, 60], 60);

  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  check(false, `test crashed: ${e?.stack ?? e}`);
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${DATE}-harp-keys-loop.txt`, import.meta.url), lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);

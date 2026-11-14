// F08 "audibly", on the real Web Audio graph in headless Chromium with the real Dvořák stems. The IWER run
// (acceptance.mjs f08) proves the two-hand stretch sets the filter gains; this proves those gains change what
// comes out. Two analysers sit on one stem, one before its EQ (trim output) and one after (high shelf output),
// so the music's own changes cancel out and the after/before power ratio per band is the EQ alone:
//  - flat: every band within 0.5 dB;
//  - a bass stretch (+12 dB low): the band under 120 Hz up by about 12 dB, the top band unchanged;
//  - a treble stretch (-12 dB high): the band over 8 kHz down by about 12 dB, the bottom band unchanged;
//  - a mixed stretch (+6 / -6) moves each band by about 6 dB, and the two-pinch reset returns it to flat.
// Usage (from stemlight/): node tests/browser/eq-audible.mjs
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8095;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 150000);
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } });
  vite.on('exit', (code) => reject(new Error(`vite exited (${code}); is port ${PORT} busy?`)));
});
const lines = [];
let failed = false;
const log = (s) => { lines.push(s); console.log(s); };
const check = (ok, msg) => { log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`https://localhost:${PORT}/?piece=dvorak9`);
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  await page.reload();
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0 && location.search.includes('dvorak9'), null, { timeout: 90000 });

  const result = await page.evaluate(async () => {
    const { ctx, engine } = window.__stemlight;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    await engine.audio.unlock();
    const ac = engine.audio.context();
    const BANDS = { low: [30, 120], high: [8000, 16000] };
    const tap = (node) => { const a = ac.createAnalyser(); a.fftSize = 8192; a.smoothingTimeConstant = 0; node.connect(a); return a; };
    // Mean linear power in each band over `frames` reads, for both analysers of one stem.
    const measure = async (pre, post, frames = 40) => {
      const binHz = ac.sampleRate / pre.fftSize, buf = new Float32Array(pre.frequencyBinCount);
      const acc = { pre: { low: 0, high: 0 }, post: { low: 0, high: 0 } };
      for (let f = 0; f < frames; f++) {
        for (const [k, a] of [['pre', pre], ['post', post]]) {
          a.getFloatFrequencyData(buf);
          for (const [band, [lo, hi]] of Object.entries(BANDS)) {
            for (let i = Math.ceil(lo / binHz); i <= Math.floor(hi / binHz); i++) acc[k][band] += 10 ** (buf[i] / 10);
          }
        }
        await sleep(60);
      }
      const db = (x) => 10 * Math.log10(x / frames);
      return Object.fromEntries(Object.keys(BANDS).map((b) => [b, { pre: db(acc.pre[b]), gain: db(acc.post[b]) - db(acc.pre[b]) }]));
    };
    const t = engine.transport;
    t.seek(20);
    t.play();
    await sleep(600);
    // Pick the stem with the most energy in its weaker band, so both bands are well above the noise floor.
    const taps = engine.stems().map((s) => ({ id: s.id, pre: tap(s.trim), post: tap(s.high) }));
    const level = [];
    for (const s of taps) { const m = await measure(s.pre, s.post, 8); level.push({ id: s.id, weak: Math.min(m.low.pre, m.high.pre) }); }
    level.sort((a, b) => b.weak - a.weak);
    const pick = taps.find((s) => s.id === level[0].id);
    const run = async (label, eq) => {
      ctx.bus.emit('stem:eq', { stem: pick.id, ...eq });
      await sleep(250); // the engine's EQ time constant settles
      const m = await measure(pick.pre, pick.post);
      const s = engine.stems().find((x) => x.id === pick.id);
      return { label, eq, m, filters: { low: s.low.gain.value, mid: s.mid.gain.value, high: s.high.gain.value } };
    };
    const runs = [
      await run('flat', { low: 0, mid: 0, high: 0 }),
      await run('bass stretch', { low: 12, mid: 0, high: 0 }),
      await run('treble stretch', { low: 0, mid: 0, high: -12 }),
      await run('mixed stretch', { low: 6, mid: 0, high: -6 }),
      await run('reset', { low: 0, mid: 0, high: 0 }),
    ];
    t.pause();
    return { stem: pick.id, level, runs, time: t.time() };
  });

  log(`stem measured: ${result.stem} (weaker band ${result.level[0].weak.toFixed(1)} dB; next ${result.level.slice(1, 3).map((l) => `${l.id} ${l.weak.toFixed(1)}`).join(', ')})`);
  const near = (x, want, tol) => Math.abs(x - want) <= tol;
  const want = { flat: [0, 0, 0.5], 'bass stretch': [12, 0, 1.5], 'treble stretch': [0, -12, 1.5], 'mixed stretch': [6, -6, 1.5], reset: [0, 0, 0.5] };
  for (const r of result.runs) {
    const [wl, wh, tol] = want[r.label];
    const { low, high } = r.m;
    check(near(low.gain, wl, tol) && near(high.gain, wh, tol),
      `${r.label} (low ${r.eq.low}, high ${r.eq.high} dB; filters ${r.filters.low.toFixed(2)}/${r.filters.high.toFixed(2)}): under 120 Hz ${low.gain >= 0 ? '+' : ''}${low.gain.toFixed(2)} dB, over 8 kHz ${high.gain >= 0 ? '+' : ''}${high.gain.toFixed(2)} dB (want ${wl}/${wh} ±${tol}; band levels before EQ ${low.pre.toFixed(1)}/${high.pre.toFixed(1)} dB)`);
  }
  check(result.time > 20, `music was playing throughout (stopped at ${result.time.toFixed(1)} s)`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${DATE}-eq-audible.txt`, import.meta.url), lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);

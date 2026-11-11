// Real-browser run of F11 (3 loop passes) and F22 (mix restore), on the real Web Audio clock in headless
// Chromium. The unit tests prove both on a fake clock; this proves them against the real scheduler:
//  - a take on the fixture's perc, one strike per pass up to 60 ms off the grid, each lands on the 1/8 grid;
//  - every wrap is exactly one region length after the last (sample-exact loop);
//  - on passes 1-3 every earlier hit is re-scheduled at wrap + tOffset, within one sample (oscillator
//    start times read by wrapping OscillatorNode.start, the synth's only voice source besides noise);
//  - a lock and an EQ change survive a reload from real IndexedDB, and drive the gain and filter nodes.
// Usage (from stemlight/): node tests/browser/loops-mix.mjs
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8094;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 150000);
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } });
  vite.on('exit', (code) => reject(new Error(`vite exited (${code}); is port ${PORT} busy?`)));
});
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(() => {
    window.__oscStarts = [];
    // The synth sets each partial's pitch with frequency.setValueAtTime, which .value doesn't reflect, so
    // remember the last value set on each param and read it when the oscillator starts.
    const setV = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (v, t) { this.__v = v; return setV.call(this, v, t); };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when = 0) { window.__oscStarts.push({ when, f: this.frequency.__v ?? this.frequency.value }); return start.call(this, when); };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 60000 });
  await page.goto(`https://localhost:${PORT}/?piece=fixture`);
  await ready();
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  await page.reload();
  await ready();

  // ---- F11: three passes, one off-grid strike in each of the first three ----
  const r = await page.evaluate(async () => {
    const { ctx, engine, parts } = window.__stemlight;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    await engine.audio.unlock();
    const t = engine.transport;
    ctx.bus.emit('cut:add', { cut: { id: 'loop3', stem: 'perc', t0: 8, t1: 10 } });
    const strikeAt = async (pass, x, pitch) => {
      while (!(engine.pass() === pass && t.time() >= x)) await sleep(2);
      const raw = t.time();
      parts.strike('pads', pitch, 100, [0, 1, -0.4]);
      return +(raw - x).toFixed(3);
    };
    // 8.56 is 60 ms after the 8.5 grid line; 9.19 and 8.69 are 60 ms before 9.25 and 8.75.
    const lag = [await strikeAt(0, 8.56, 50), await strikeAt(1, 9.19, 53), await strikeAt(2, 8.69, 55)];
    while (!(engine.pass() >= 3 && t.time() > 9.6)) await sleep(5);
    t.pause();
    const wraps = engine.log.filter((e) => e.kind === 'wrap').map((e) => e.data.at);
    return { lag, wraps, hits: parts.parts()[0].hits, starts: window.__oscStarts, rate: engine.audio.context().sampleRate };
  });
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const offs = r.hits.map((h) => `${h.pitch}@${h.tOffset}`);
  console.log(`strike lateness vs the target time (ms of scheduler jitter): ${r.lag.map((x) => x * 1000).join(', ')}`);
  check(JSON.stringify(offs) === JSON.stringify(['50@0.5', '55@0.75', '53@1.25']), `off-grid strikes (±60 ms) snapped to the 1/8 grid: ${offs.join(' ')}`);
  const d = r.wraps.slice(1).map((w, i) => w - r.wraps[i]);
  check(r.wraps.length >= 3 && d.every((x) => Math.abs(x - 2) < 1e-6), `${r.wraps.length} wraps, each exactly 2 s after the last (${d.map((x) => x.toFixed(6)).join(', ')})`);
  // Replays: on pass k (k = 1..3) the region starts at wraps[k-1]; every hit recorded on an earlier pass
  // must have an oscillator at its fundamental starting at wraps[k-1] + tOffset.
  const recordedOn = { 50: 0, 53: 1, 55: 2 };
  let want = 0, found = 0, worst = 0;
  for (let k = 1; k <= 3 && k - 1 < r.wraps.length; k++) {
    for (const h of r.hits) {
      if (recordedOn[h.pitch] >= k) continue;
      want++;
      const at = r.wraps[k - 1] + h.tOffset;
      const s = r.starts.filter((x) => Math.abs(x.f - hz(h.pitch)) < 0.01).map((x) => Math.abs(x.when - at)).sort((a, b) => a - b)[0];
      if (s !== undefined && s < 1 / r.rate) { found++; worst = Math.max(worst, s); }
    }
  }
  check(want === 6 && found === want, `hits replayed on later passes at wrap + offset: ${found}/${want}, worst ${(worst * 1e6).toFixed(2)} µs (one sample = ${(1e6 / r.rate).toFixed(1)} µs)`);

  // ---- F22: a lock and an EQ change come back after a reload ----
  await page.evaluate(async () => {
    const { ctx } = window.__stemlight;
    ctx.bus.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
    ctx.bus.emit('stem:eq', { stem: 'fl', low: 6, mid: 0, high: -6 });
    await new Promise((res) => setTimeout(res, 600)); // persist writes 300 ms after the last change
  });
  await page.reload();
  await ready();
  await page.waitForTimeout(500); // gain ramps and EQ time constants settle
  const back = await page.evaluate(() => {
    const { engine, parts } = window.__stemlight;
    const m = engine.mix();
    const vln = engine.stems().find((s) => s.id === 'vln'), fl = engine.stems().find((s) => s.id === 'fl');
    return { mute: m.mute.vln, eq: m.eq.fl, vlnGain: vln.gain.gain.value, flLow: fl.low.gain.value, flHigh: fl.high.gain.value, cuts: parts.cuts().map((c) => c.id), hits: parts.parts()[0]?.hits.length };
  });
  check(back.mute === 'locked' && back.vlnGain < 0.001, `lock restored after reload (vln ${back.mute}, gain ${back.vlnGain.toFixed(4)})`);
  check(back.eq.low === 6 && back.eq.high === -6 && Math.abs(back.flLow - 6) < 0.1 && Math.abs(back.flHigh + 6) < 0.1, `EQ restored after reload (fl low ${back.flLow.toFixed(2)} dB, high ${back.flHigh.toFixed(2)} dB)`);
  check(JSON.stringify(back.cuts) === '["loop3"]' && back.hits === 3, `cut and 3-hit part restored alongside (${JSON.stringify(back.cuts)}, ${back.hits} hits)`);
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
process.exit(failed ? 1 : 0);

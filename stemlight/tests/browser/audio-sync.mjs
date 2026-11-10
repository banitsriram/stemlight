// Real-browser check of the audio engine (biyon-8, F03). Starts Vite, opens the app in headless
// Chromium with autoplay allowed, then checks: every stem decodes, decoded lengths agree within 5 ms,
// every start batch (play + 10 seeks) shares one context time and one offset, transport time tracks
// the AudioContext clock while playing, and mute/solo/EQ events reach the nodes.
// Usage (from stemlight/): node tests/browser/audio-sync.mjs [piece]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const piece = process.argv[2] ?? 'fixture';
const PORT = 8092;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 60000);
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } });
});

let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`https://localhost:${PORT}/?piece=${piece}`);
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 60000 });

  const r = await page.evaluate(async () => {
    const { engine, ctx } = window.__stemlight;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    await engine.audio.unlock();
    const stems = engine.stems();
    const lengths = stems.map((s) => s.buffer.duration);
    const t = engine.transport;
    const ac = engine.audio.context();

    // Real-time tracking: 1.5 s of play, transport time vs context clock.
    t.play();
    await sleep(1500);
    const drift = Math.abs(t.time() - (ac.currentTime - engine.log.filter((e) => e.kind === 'start').at(-1).data.when));

    // 10 seeks, spread over the piece, a little playing between each.
    const dur = t.duration();
    const seeks = Array.from({ length: 10 }, (_, i) => +((dur * (i * 0.37 % 1)) * 0.9).toFixed(3));
    for (const s of seeks) { t.seek(s); await sleep(120); }
    const starts = engine.log.filter((e) => e.kind === 'start');

    // Mix events reach the nodes.
    ctx.bus.emit('stem:mute', { stem: stems[0].id, state: 'held', lockProgress: 0 });
    ctx.bus.emit('stem:solo', { stem: stems[1].id });
    ctx.bus.emit('stem:eq', { stem: stems[1].id, low: 6, mid: 0, high: -6 });
    await sleep(200);
    const g0 = stems[0].gain.gain.value, g1 = stems[1].gain.gain.value, g2 = stems[2].gain.gain.value;
    const eq1 = [stems[1].low.gain.value, stems[1].high.gain.value];
    t.pause();
    return {
      state: ac.state, sampleRate: ac.sampleRate, ids: stems.map((s) => s.id), lengths, drift, seeks,
      starts: starts.map((e) => e.data), g0, g1, g2, eq1, decodedMB: engine.log.find((e) => e.kind === 'load')?.data.decodedMB,
    };
  });

  console.log(`piece=${piece} stems=${r.ids.join(',')} sampleRate=${r.sampleRate} decodedMB=${r.decodedMB} state=${r.state}`);
  console.log(`lengths(s)=${r.lengths.map((l) => l.toFixed(4)).join(', ')}`);
  const spreadMs = (Math.max(...r.lengths) - Math.min(...r.lengths)) * 1000;
  check(r.state === 'running', 'AudioContext running after unlock()');
  check(spreadMs <= 5, `decoded stem lengths agree within 5 ms (spread ${spreadMs.toFixed(2)} ms)`);
  check(r.drift < 0.005, `transport time tracks the AudioContext clock (diff ${(r.drift * 1000).toFixed(2)} ms)`);
  check(r.starts.length === 11, `11 start batches: play + 10 seeks (got ${r.starts.length})`);
  check(r.starts.slice(1).every((s, i) => Math.abs(s.from - r.seeks[i]) < 1e-9), 'each batch starts from its seek offset');
  check(r.g0 === 0 && r.g1 === 1 && r.g2 === 0, `mute + solo gains (held=${r.g0}, solo=${r.g1}, other=${r.g2})`);
  check(Math.abs(r.eq1[0] - 6) < 0.1 && Math.abs(r.eq1[1] + 6) < 0.1, `EQ reaches the filters (${r.eq1.map((v) => v.toFixed(2))})`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
process.exit(failed ? 1 : 0);

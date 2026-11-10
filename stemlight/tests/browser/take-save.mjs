// Real-browser run of a pads take and saving (biyon-24, 25, 28): headless Chromium, real Web Audio
// clock, real IndexedDB. Cuts perc on the fixture, checks the 4 count-in events, plays 3 off-grid
// strikes, waits for the loop, then reloads and checks the cut and part came back. Also logs dev stats.
// Usage (from stemlight/): node tests/browser/take-save.mjs
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8093;
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
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = `https://localhost:${PORT}/?piece=fixture&stats`;
  const ready = () => page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 60000 });
  await page.goto(url);
  await ready();
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  await page.reload();
  await ready();

  const r = await page.evaluate(async () => {
    const { ctx, engine, parts, stats } = window.__stemlight;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    await engine.audio.unlock();
    const countins = [], hits = [];
    ctx.bus.on('countin', (e) => countins.push(e.beatsLeft));
    ctx.bus.on('part:hit', (e) => hits.push(+e.t.toFixed(3)));
    ctx.bus.emit('cut:add', { cut: { id: 'take1', stem: 'perc', t0: 8, t1: 10 } });
    const t = engine.transport;
    const waitFor = async (x) => { while (t.time() < x) await sleep(5); };
    await waitFor(8.04); parts.strike('pads', 50, 100, [0, 1, -0.4]);
    await waitFor(8.55); parts.strike('pads', 57, 90, [0, 1, -0.4]);
    await waitFor(9.21); parts.strike('pads', 50, 80, [0, 1, -0.4]);
    // Let pass 1 play out with no new hits: the take ends and the piece plays on.
    const t0 = performance.now();
    while (parts.taking() && performance.now() - t0 < 8000) await sleep(20);
    await waitFor(10.3); // the take ends 0.25 s before the region edge; playback then runs on
    const wraps = engine.log.filter((e) => e.kind === 'wrap').map((e) => e.data.at);
    const after = t.time();
    t.pause();
    await sleep(500); // persist writes 300 ms after the last change
    return { countins, hits, recorded: parts.parts()[0]?.hits.map((h) => h.tOffset), wraps, after, taking: parts.taking(), stats: stats() };
  });
  check(JSON.stringify(r.countins) === '[4,3,2,1]', `count-in events ${JSON.stringify(r.countins)}`);
  check(JSON.stringify(r.recorded) === '[0,0.5,1.25]', `strikes at 8.04/8.55/9.21 snapped to offsets ${JSON.stringify(r.recorded)}`);
  check(r.wraps.length >= 1, `looped (${r.wraps.length} wrap(s))`);
  check(r.taking === null && r.after > 10, `take ended and playback went on past the region (t=${r.after.toFixed(2)})`);
  console.log(`stats: ${JSON.stringify(r.stats)} (headless emulator page, not a device number)`);

  await page.reload();
  await ready();
  const back = await page.evaluate(() => {
    const { parts } = window.__stemlight;
    return { cuts: parts.cuts().map((c) => [c.id, c.t0, c.t1]), hits: parts.parts()[0]?.hits.map((h) => h.tOffset), taking: parts.taking() };
  });
  check(JSON.stringify(back.cuts) === '[["take1",8,10]]', `cut restored after reload ${JSON.stringify(back.cuts)}`);
  check(JSON.stringify(back.hits) === '[0,0.5,1.25]', `part restored after reload ${JSON.stringify(back.hits)}`);
  check(back.taking === null, 'restoring does not start a new take');
  await page.evaluate(() => indexedDB.deleteDatabase('stemlight'));
  await page.reload();
  await ready();
  const clean = await page.evaluate(() => window.__stemlight.parts.cuts().length);
  check(clean === 0, 'cleared storage gives a clean start');
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
process.exit(failed ? 1 : 0);

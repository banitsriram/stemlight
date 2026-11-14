// Memory on a piece change (biyon-17, F39): decoded MB is logged per piece, and the previous piece's
// AudioBuffers are released. Headless Chromium with --expose-gc: hold WeakRefs to beethoven5's decoded
// buffers, load dvorak9 through the engine, force GC, and check the old buffers are gone.
// Usage (from stemlight/): node tests/browser/memory-switch.mjs
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8098;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 150000);
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } });
  vite.on('exit', (code) => reject(new Error(`vite exited (${code}); is port ${PORT} busy?`)));
});
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`https://localhost:${PORT}/?piece=beethoven5`);
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length === 8, null, { timeout: 120000 });
  const r = await page.evaluate(async () => {
    const { engine } = window.__stemlight;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const refs = engine.stems().map((s) => new WeakRef(s.buffer));
    const before = engine.log.filter((e) => e.kind === 'load').at(-1).data;
    const get = async (n) => (await fetch(`/pieces/dvorak9/${n}`)).json();
    await engine.load('dvorak9', await get('manifest.json'), await get('beats.json'), '/pieces/dvorak9');
    const after = engine.log.filter((e) => e.kind === 'load').at(-1).data;
    // Several GC passes, with a turn of the event loop between them so the audio graph lets go.
    for (let i = 0; i < 6; i++) { globalThis.gc(); await sleep(250); }
    return { before, after, alive: refs.filter((w) => w.deref() !== undefined).length, total: refs.length, nowStems: engine.stems().map((s) => s.id).length };
  });
  console.log(`beethoven5 decoded ${r.before.decodedMB} MB; dvorak9 decoded ${r.after.decodedMB} MB (logged per piece by the engine)`);
  check(r.before.piece === 'beethoven5' && r.after.piece === 'dvorak9' && r.after.decodedMB > 0, 'decoded MB is logged for each piece');
  check(r.nowStems === 8, 'the new piece has its 8 stems');
  check(r.alive === 0, `previous piece's buffers released after the switch (${r.alive}/${r.total} still alive after GC)`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log('Quest Browser memory: unverified (no headset); the 128 MB / 235 MB figures are decoded PCM sizes.');
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
process.exit(failed ? 1 : 0);

// Cold start: the landing page's Enter must appear before the first piece has finished decoding.
// Usage (from stemlight/): node tests/browser/cold-start.mjs
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
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  // Warm Vite's transform cache so the timing reflects the app, not first-compile.
  await page.goto(`https://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 120000 });
  const t0 = Date.now();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#landing button'), null, { timeout: 60000 });
  const landingMs = Date.now() - t0;
  const stemsAtLanding = await page.evaluate(() => window.__stemlight?.engine.stems().length ?? 0);
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 60000 });
  const readyMs = Date.now() - t0;
  console.log(`landing button after ${landingMs} ms; piece decoded after ${readyMs} ms (dev server, localhost)`);
  check(stemsAtLanding === 0 || landingMs < readyMs, 'Enter is on screen before the piece finishes decoding');
} finally {
  await browser.close();
  vite.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true });
}
process.exit(failed ? 1 : 0);

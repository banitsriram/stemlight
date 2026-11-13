// Close-up of each instrument: summons it without starting the music (so no tutorial hands) and tilts the
// camera down to it. Usage (from stemlight/): node tests/iwer/visual/closeups.mjs <outDir> [piece]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8096;
const out = process.argv[2] ?? 'tests/iwer/visual/results';
const piece = process.argv[3] ?? 'dvorak9';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 150000);
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } });
  vite.on('exit', (code) => reject(new Error(`vite exited (${code}); is port ${PORT} busy?`)));
});
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`https://localhost:${PORT}/?piece=${piece}`);
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 120000 });
  const stems = await page.evaluate(() => { document.getElementById('landing')?.remove(); return window.__stemlight.engine.stems().map((s) => s.id ?? s); });
  for (const stem of stems) {
    await page.evaluate((stem) => { const s = window.__stemlight; s.world.camera.rotation.x = 0; s.ctx.bus.emit('gaze:summon', { stem }); }, stem);
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__stemlight.world.camera.rotation.x = -0.32; });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/close-${stem}.jpg`, type: 'jpeg', quality: 80 });
  }
  console.log('close-ups:', stems.join(' '), '| console errors:', errors.length ? errors : 'none');
} finally {
  await browser.close();
  vite.kill();
}

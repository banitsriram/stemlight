// Runs the visual check pages headless and prints their checks. Usage (from stemlight/): node tests/iwer/visual/run.mjs [page ...]
// With --shot it also plays beethoven5 and saves one screenshot per creature state to tests/iwer/visual/results/.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8095;
const args = process.argv.slice(2);
const shot = args.includes('--shot');
const pages = args.filter((a) => !a.startsWith('--'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 150000);
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(t); resolve(); } });
  vite.on('exit', (code) => reject(new Error(`vite exited (${code}); is port ${PORT} busy?`)));
});
let failed = false;
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const name of pages.length ? pages : ['world']) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    page.on('pageerror', (e) => { console.log(`ERROR ${name}: ${e.message}`); failed = true; });
    await page.goto(`https://localhost:${PORT}/tests/iwer/visual/${name}.html`);
    const result = await page.waitForFunction(() => window.__world ?? window.__glyphs ?? window.__landing, null, { timeout: 60000 }).then((h) => h.jsonValue());
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(result));
    if (!result.ok) failed = true;
    await page.close();
  }
  if (shot) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`https://localhost:${PORT}/?piece=beethoven5`);
    await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 120000 });
    await page.evaluate(() => { document.getElementById('landing')?.remove(); const s = window.__stemlight; s.ctx.audio.unlock(); s.ctx.transport.seek(20); s.ctx.transport.play(); });
    const out = 'tests/iwer/visual/results';
    const emit = (k, e) => page.evaluate(([k, e]) => window.__stemlight.ctx.bus.emit(k, e), [k, e]);
    const snap = async (name, wait = 1200) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/${name}.png` }); };
    await snap('1-field');
    await emit('gaze:summon', { stem: 'vln' }); await snap('2-summon-vln');
    await emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0.6 }); await snap('3-held-vln-glass');
    await emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 }); await snap('4-locked-vln');
    await emit('stem:mute', { stem: 'vln', state: 'on', lockProgress: 0 });
    await emit('stem:solo', { stem: 'vla_vc' }); await snap('5-solo-vla_vc');
    console.log('screenshot saved; console errors:', errors.length ? errors : 'none');
  }
} finally {
  await browser.close();
  vite.kill();
}
process.exit(failed ? 1 : 0);

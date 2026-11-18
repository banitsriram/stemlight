// The worlds in the emulator (18 Nov): for each world, the same views captured while a song plays: straight ahead
// (the music area), up toward the Starry Night's moon, left toward its cypress, down ahead toward its village, and
// overhead. Shows the world switch (fade) and that the instruments pick up each world's light.
// Needs a running dev session: npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation
// Usage (from stemlight/): node tests/iwer/input/worlds.mjs [outDir] [world ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enterXR, evalInPage, iw, sleep } from './harness.mjs';

const [outArg, ...only] = process.argv.slice(2);
const OUT = outArg || fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WORLDS = only.length ? only : ['sea', 'starry', 'aurora'];
// (azimuth, elevation) in degrees: 0 = straight ahead, positive = right / up.
const VIEWS = [['ahead', 0, 8], ['moon', 40, 38], ['cypress', -32, 22], ['village', 12, -6], ['up', 0, 80], ['behind', 180, 15]];
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };

const shot = (name) => {
  const r = iw('browser', 'screenshot', { format: 'png' });
  writeFileSync(join(OUT, `${DATE}-world-${name}.png`), Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
  log(`shot tests/iwer/input/results/${DATE}-world-${name}.png`);
};
const eyeNow = () => { const p = iw('xr', 'get-transform', { device: 'headset' }).position; return [p.x, p.y, p.z]; };
const lookAt = (eye, az, el) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  iw('xr', 'look-at', { device: 'headset', target: { x: eye[0] + Math.sin(a) * Math.cos(e) * 10, y: eye[1] + Math.sin(e) * 10, z: eye[2] - Math.cos(a) * Math.cos(e) * 10 } });
};

try { iw('xr', 'exit'); } catch { /* not in XR */ }
try {
  evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99'); localStorage.removeItem('stemlight.world'); location.href = '/?piece=dvorak9&worlds=1'; return true; });
} catch { /* the navigation cuts the call */ }
await sleep(7000);
await enterXR();
try { iw('xr', 'set-input-mode', { mode: 'hand' }); } catch { /* already hands */ }
await sleep(1500);
// Into the music: far enough that the field is full of notes.
await evalInPage(() => { const t = window.__stemlight.ctx.transport; t.seek(40); if (!t.playing()) t.play(); return true; });
const eye = eyeNow();
for (const w of WORLDS) {
  const r = await evalInPage((id) => { const ws = window.__stemlight.worlds; ws.set(id); return ws.current(); }, w);
  await sleep(1600); // the 1 s fade, and a little
  const state = await evalInPage(() => ({ world: window.__stemlight.worlds.current(), changing: window.__stemlight.worlds.changing(), t: window.__stemlight.ctx.transport.time() }));
  log(`${w}: current ${r} -> ${JSON.stringify(state)}`);
  for (const [name, az, el] of VIEWS) {
    lookAt(eye, az, el);
    await sleep(700);
    shot(`${w}-${name}`);
  }
}
lookAt(eye, 0, 8);
// Leave the shared dev browser on the default world, so other scripts' evidence runs in the deep sea.
await evalInPage(() => { window.__stemlight.worlds.set('sea'); localStorage.removeItem('stemlight.world'); return true; });
const errors = iw('browser', 'logs', { level: 'error', count: 30 });
log(`console errors: ${String(JSON.stringify(errors) ?? 'none').slice(0, 600)}`);
writeFileSync(join(OUT, `${DATE}-worlds.txt`), lines.join('\n') + '\n');

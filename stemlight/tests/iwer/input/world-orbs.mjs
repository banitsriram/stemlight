// The world orbs in the emulator (18 Nov, sir's design), hands only: with the song picker up, a fingertip touch on an
// orb fades the world over to that one and keeps the picker up; the choice survives a reload; the play surfaces stay
// hidden while choosing. Captures the picker in each world.
// Needs a running dev session: npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation
// Usage (from stemlight/): node tests/iwer/input/world-orbs.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enterXR, evalInPage, iw, sleep } from './harness.mjs';

const OUT = process.argv[2] || fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lines = [];
let failed = 0;
const log = (s) => { console.log(s); lines.push(s); };
const check = (ok, what) => { log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed++; };
const shot = (name) => {
  const r = iw('browser', 'screenshot', { format: 'png' });
  writeFileSync(join(OUT, `${DATE}-orbs-${name}.png`), Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
  log(`shot tests/iwer/input/results/${DATE}-orbs-${name}.png`);
};
const state = () => evalInPage(() => {
  const s = window.__stemlight, st = s.songs.state();
  return { open: st.open, world: s.worlds.current(), changing: s.worlds.changing(), orbs: st.orbs, bubbles: st.bubbles, kinds: s.ctx.registry.all().map((t) => t.kind) };
});
const tipAt = (p) => evalInPage(async (p) => {
  const dev = window.IWER_DEVICE;
  dev.hands.right.poseId = 'point';
  await dev.remote.dispatch('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, anchor: 'index-tip', orientation: 'auto' });
  return true;
}, p);
const eyeNow = () => { const p = iw('xr', 'get-transform', { device: 'headset' }).position; return [p.x, p.y, p.z]; };
const toward = (p, eye, m) => { const v = p.map((x, i) => eye[i] - x), l = Math.hypot(...v); return p.map((x, i) => x + (v[i] / l) * m); };
const touch = async (p) => { const eye = eyeNow(); await tipAt(toward(p, eye, 0.12)); await sleep(400); await tipAt(p); await sleep(700); await tipAt(toward(p, eye, 0.12)); };
const fresh = async (keepWorld) => {
  try { iw('xr', 'exit'); } catch { /* not in XR */ }
  try {
    evalInPage((keep) => {
      indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99');
      if (!keep) localStorage.removeItem('stemlight.world');
      location.href = '/?piece=dvorak9&orbs=1'; return true;
    }, keepWorld);
  } catch { /* the navigation cuts the call */ }
  await sleep(7000);
  await enterXR();
  try { iw('xr', 'set-input-mode', { mode: 'hand' }); } catch { /* already hands */ }
  await sleep(1500);
};

await fresh(false);
await evalInPage(() => { const t = window.__stemlight.ctx.transport; t.seek(30); if (!t.playing()) t.play(); return true; });
await sleep(1500);
let s = await state();
check(s.world === 'sea' && !s.open, `a fresh device starts in the deep sea (world ${s.world})`);
await evalInPage(() => { window.__stemlight.songs.open('shell'); return true; });
await sleep(1200);
s = await state();
check(s.open && s.orbs.length === 3 && s.kinds.filter((k) => k === 'song').length === 6, `the picker shows 3 song bubbles and 3 world orbs (${s.kinds.filter((k) => k === 'song').length} song-kind targets)`);
const mid = s.orbs[1];
iw('xr', 'look-at', { device: 'headset', target: { x: mid[0], y: mid[1] + 0.12, z: mid[2] } });
await sleep(900);
shot('1-picker-deep-sea');
for (const [i, want] of [[1, 'starry'], [2, 'aurora'], [0, 'sea'], [1, 'starry']]) {
  s = await state();
  await touch(s.orbs[i]);
  await sleep(1400); // the 1 s fade
  s = await state();
  check(s.world === want && s.open && !s.changing, `touching orb ${i + 1} changes the world to ${want} and keeps the picker up (world ${s.world}, picker ${s.open ? 'up' : 'closed'})`);
  if (want !== 'sea' || i !== 0) shot(`${i + 2}-picker-${want}`);
}
// The choice survives a reload.
await fresh(true);
s = await state();
check(s.world === 'starry', `after a reload the device keeps its world (${s.world})`);
const errors = iw('browser', 'logs', { level: 'error', count: 30 });
log(`console errors: ${String(JSON.stringify(errors) ?? 'none').slice(0, 600)}`);
writeFileSync(join(OUT, `${DATE}-orbs.txt`), lines.join('\n') + '\n');
log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);

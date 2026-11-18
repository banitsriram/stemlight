// Passthrough in the emulator (18 Nov, sir's design): a passthrough (immersive-ar) session opens on the player's room
// (no background, a see-through clear, no seat rock) with 4 world orbs; an orb covers the room with a world and the
// Passthrough orb clears it again; a normal VR session afterwards offers 3 orbs and never opens on the room.
// Needs a running dev session: npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation
// Usage (from stemlight/): node tests/iwer/input/passthrough.mjs [outDir]
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
  writeFileSync(join(OUT, `${DATE}-passthrough-${name}.png`), Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
  log(`shot tests/iwer/input/results/${DATE}-passthrough-${name}.png`);
};
const state = () => evalInPage(() => {
  const s = window.__stemlight, st = s.songs.state(), r = s.world.renderer, rock = s.world.scene.children.find((o) => o.geometry?.type === 'IcosahedronGeometry');
  return { blend: s.world.session?.environmentBlendMode ?? null, world: s.worlds.current(), shown: s.worlds.shown(), orbs: st.orbs.length, open: st.open,
    bg: s.world.scene.background === null ? null : 'colour', alpha: r.getClearAlpha(), rock: rock ? rock.visible : 'missing' };
});
const fresh = async () => {
  try { iw('xr', 'exit'); } catch { /* not in XR */ }
  try {
    evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99'); localStorage.setItem('stemlight.world', 'starry'); location.href = '/?piece=dvorak9'; return true; });
  } catch { /* the navigation cuts the call */ }
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    try { if (await evalInPage(() => !!window.__stemlight?.landing)) break; } catch { /* still loading */ }
  }
};

await fresh();
// The landing page's own second button (shown only when the browser supports passthrough).
await sleep(1500);
const roomBtn = iw('browser', 'snapshot').elements.find((e) => e.role === 'button' && e.name === 'Enter in passthrough');
check(!!roomBtn, 'the landing page offers Enter in passthrough');
if (roomBtn) iw('browser', 'interact', { steps: [{ action: 'click', ref: roomBtn.ref }] });
for (let i = 0; i < 40 && !iw('xr', 'status').sessionActive; i++) await sleep(250);
await sleep(2500);
let s = { ...(await state()), mode: iw('xr', 'status').sessionMode };
log(JSON.stringify(s));
check(s.mode === 'immersive-ar', `the passthrough entry starts an immersive-ar session (${s.mode})`);
check(s.world === 'room' && s.bg === null && s.alpha === 0, `it opens on the room: no background, clear alpha ${s.alpha}`);
check(s.rock === false, 'the seat rock is hidden');
await evalInPage(() => { window.__stemlight.songs.open('shell'); return true; });
await sleep(1200);
s = await state();
check(s.open && s.orbs === 4, `the picker offers 4 world orbs (${s.orbs})`);
shot('room-picker');
await evalInPage(() => { window.__stemlight.worlds.set('sea'); return true; });
await sleep(1500);
s = await state();
// In an alpha-blend session three always clears see-through; the world's opaque sky dome covers the room.
check(s.world === 'sea' && s.rock === false, `the deep-sea orb picks the sea; the picker's lobby still hides the seat (world ${s.world}, rock ${s.rock})`);
shot('sea-in-ar');
await evalInPage(() => { window.__stemlight.worlds.set('room'); return true; });
await sleep(1500);
s = await state();
check(s.world === 'room' && s.bg === null && s.alpha === 0, 'the Passthrough orb clears back to the room');
const kept = await evalInPage(() => localStorage.getItem('stemlight.world'));
check(kept === 'sea', `Passthrough is not kept as the device's world (kept ${kept})`);
await fresh();
await enterXR();
await sleep(2000);
await evalInPage(() => { window.__stemlight.songs.open('shell'); return true; });
await sleep(1200);
s = { ...(await state()), mode: iw('xr', 'status').sessionMode };
check(s.mode === 'immersive-vr' && s.world !== 'room' && s.orbs === 3 && s.alpha === 1, `a normal Enter: VR, world ${s.world}, ${s.orbs} orbs`);
log(`${failed ? 'FAILED' : 'ALL PASS'} (${failed} failed)`);
writeFileSync(join(OUT, `${DATE}-passthrough.txt`), lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);

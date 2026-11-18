// The song picker in the emulator (18 Nov, sir's design), hands only. A first visit plays the tutorial song and its
// end opens the picker (no song starts by itself); a fingertip touch on a bubble plays that song; the songs bubble,
// held mid-song, fades the music and brings the picker back; a returning player (tutorial done) starts at the picker.
// Needs a running dev session: npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation
// Usage (from stemlight/): node tests/iwer/input/songs.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enterXR, evalInPage, iw, sleep } from './harness.mjs';

const OUT = process.argv[2] ?? fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lines = [];
let failed = 0;
const log = (s) => { console.log(s); lines.push(s); };
const check = (ok, what) => { log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed++; };
const shot = (name) => {
  const r = iw('browser', 'screenshot', { format: 'png' });
  const file = join(OUT, `${DATE}-songs-${name}.png`);
  writeFileSync(file, Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
  log(`shot tests/iwer/input/results/${DATE}-songs-${name}.png`); // relative: no local paths in committed logs
};

const state = () => evalInPage(() => {
  const s = window.__stemlight, st = s.songs.state();
  return {
    open: st.open, current: st.current, last: st.last, loading: st.loading, passed: st.passed, songsAt: st.songsAt, bubbles: st.bubbles,
    labels: st.songs.map((x) => `${x.title} (${x.durationSec ?? '?'})`),
    playing: s.ctx.transport.playing(), t: s.ctx.transport.time(), dur: s.ctx.transport.duration(),
    log: window.__songsLog ?? [], kinds: s.ctx.registry.all().map((t) => t.kind),
  };
});
const waitFor = async (pred, ms) => {
  const t0 = Date.now();
  let s = await state();
  while (!pred(s) && Date.now() - t0 < ms) { await sleep(500); s = await state(); }
  return s;
};
const listen = () => evalInPage(() => {
  window.__songsLog = [];
  const b = window.__stemlight.ctx.bus;
  b.on('songs:open', (e) => window.__songsLog.push(`open:${e.why}`));
  b.on('songs:pick', (e) => window.__songsLog.push(`pick:${e.id}`));
  return true;
});
/** The right index fingertip to p (world metres), pointing. */
const tipAt = (p) => evalInPage(async (p) => {
  const dev = window.IWER_DEVICE;
  dev.hands.right.poseId = 'point';
  await dev.remote.dispatch('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, anchor: 'index-tip', orientation: 'auto' });
  return true;
}, p);
const eyeNow = () => { const p = iw('xr', 'get-transform', { device: 'headset' }).position; return [p.x, p.y, p.z]; };
const toward = (p, eye, m) => { const v = p.map((x, i) => eye[i] - x), l = Math.hypot(...v); return p.map((x, i) => x + (v[i] / l) * m); };
/** A touch: come in from 12 cm nearer the eye, rest inside, go back out. */
const touch = async (p) => { const eye = eyeNow(); await tipAt(toward(p, eye, 0.12)); await sleep(400); await tipAt(p); await sleep(700); await tipAt(toward(p, eye, 0.12)); };
const reloadFresh = async (returning) => {
  try { iw('xr', 'exit'); } catch { /* not in XR */ }
  try {
    evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.removeItem('stemlight.tutorialStep'); setTimeout(() => location.reload(), 50); return true; });
  } catch { /* the reload cuts the call */ }
  await sleep(7000);
  if (returning) {
    await evalInPage(() => { window.__stemlight.ctx.save.patch({ tutorialDone: true }); return true; });
    await sleep(1500); // the save reaches IndexedDB
    try { evalInPage(() => { setTimeout(() => location.reload(), 50); return true; }); } catch { /* reload */ }
    await sleep(7000);
  }
  await listen();
};

// ---- first visit: the tutorial song, then the picker ----
await reloadFresh(false);
await enterXR();
try { iw('xr', 'set-input-mode', { mode: 'hand' }); } catch (e) { log(`input mode: ${String(e.message).slice(0, 120)}`); }
let s = await waitFor((x) => x.playing, 15000);
check(s.playing && s.current === 'beethoven5' && !s.open && !s.passed, `first visit: Enter plays the tutorial song (${s.current}), no picker, no songs bubble yet`);
check(!s.kinds.includes('song'), `no song targets while the tutorial song plays (kinds: ${[...new Set(s.kinds)].join(', ')})`);
// Skip to 4 s before the end rather than wait 84 s.
await evalInPage(() => { const t = window.__stemlight.ctx.transport; t.seek(t.duration() - 4); return true; });
s = await waitFor((x) => x.open, 15000);
await sleep(1500);
s = await state();
check(s.open && !s.playing && s.log.includes('open:end'), `its end opens the picker and the music stays stopped (log ${s.log.join(', ')})`);
check(s.bubbles.length === 3 && s.kinds.filter((k) => k === 'song').length === 3, `three song bubbles registered (${s.labels.join(' | ')})`);
check(!s.kinds.includes('reset') && !s.kinds.includes('playhead'), 'the play surfaces hide while the picker is up (no reset shell or playhead targets)');
iw('xr', 'look-at', { device: 'headset', target: { x: s.bubbles[1][0], y: s.bubbles[1][1] + 0.05, z: s.bubbles[1][2] } });
await sleep(900);
shot('1-picker-after-tutorial');
// A touch on the Dvorak bubble.
await touch(s.bubbles[1]);
s = await waitFor((x) => x.current === 'dvorak9' && x.playing, 20000);
check(s.current === 'dvorak9' && s.playing && !s.open, `touching the middle bubble plays Dvorak (log ${s.log.join(', ')})`);
await sleep(2500);
s = await state();
check(!!s.songsAt && s.kinds.includes('reset') && s.kinds.includes('song'), 'mid-song: the songs bubble shows beside the reset shell, and the play surfaces are back');
iw('xr', 'look-at', { device: 'headset', target: { x: s.songsAt[0], y: s.songsAt[1], z: s.songsAt[2] } });
await sleep(900);
shot('2-dvorak-playing-songs-bubble');
// Hold the songs bubble: the music fades and the picker comes back.
const t0 = s.t;
await tipAt(toward(s.songsAt, eyeNow(), 0.1));
await sleep(400);
await tipAt(s.songsAt);
await sleep(500);
shot('3-holding-songs-bubble');
s = await waitFor((x) => x.open, 6000);
check(s.open && !s.playing && s.log.includes('open:shell'), `holding the songs bubble fades the song out and opens the picker (Dvorak stopped at ${s.t.toFixed(1)} s, started from ${t0.toFixed(1)} s)`);
await tipAt(toward(s.songsAt ?? s.bubbles[0], eyeNow(), 0.15));
await sleep(1500);
// Beethoven 7 if its files are there, else the tutorial song again.
const pick = s.labels[2].includes('(?)') ? 0 : 2;
await touch(s.bubbles[pick]);
const want = ['beethoven5', 'dvorak9', 'beethoven7'][pick];
s = await waitFor((x) => x.current === want && x.playing, 25000);
check(s.current === want && s.playing, `touching bubble ${pick + 1} plays ${want} (log ${s.log.join(', ')})`);
await sleep(2000);
shot(`4-${want}-playing`);

// ---- a returning player starts at the picker ----
await reloadFresh(true);
await enterXR();
try { iw('xr', 'set-input-mode', { mode: 'hand' }); } catch { /* already hands */ }
s = await waitFor((x) => x.open, 15000);
await sleep(1500);
s = await state();
check(s.open && !s.playing && s.log.includes('open:start') && s.passed, `returning player: Enter opens the picker, no music yet (log ${s.log.join(', ')})`);
iw('xr', 'look-at', { device: 'headset', target: { x: s.bubbles[1][0], y: s.bubbles[1][1] + 0.05, z: s.bubbles[1][2] } });
await sleep(900);
shot('5-returning-starts-at-picker');

const errors = iw('browser', 'logs', { level: 'error', count: 30 });
log(`console errors: ${String(JSON.stringify(errors) ?? 'none').slice(0, 900)}`);
writeFileSync(join(OUT, `${DATE}-songs.txt`), lines.join('\n') + '\n');
log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);

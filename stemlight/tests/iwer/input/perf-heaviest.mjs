// Performance pass (biyon-31, F26): the heaviest moment in the build. Dvořák's densest 4 s of notes
// (64.5 s, 357 notes), a creature summoned, a percussion cut so the pads, ribbon, lane and region all show.
// Logs draw calls, triangles and live notes (dev overlay counters) against the caps: <100 calls, <150k
// triangles, <=1,500 live notes. Emulator numbers: no device frame rate is claimed.
// Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/perf-heaviest.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterXR, evalInPage, iw, sleep } from './harness.mjs';

const lines = [];
const results = [];
const log = (s) => { lines.push(s); console.log(s); };
const check = (name, ok, detail = '') => { results.push(ok); log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const DENSE = 64.5;

// Fresh page on the hero piece.
try { iw('xr', 'exit'); } catch { /* not in a session */ }
try { evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.setItem('stemlight.tutorialStep', '99'); location.href = '/?piece=dvorak9'; return true; }); } catch { /* navigation cuts the call */ }
await sleep(6000);
const ready = async () => {
  for (let i = 0; i < 40; i++) {
    try { if (evalInPage(() => !!window.__stemlight && window.__stemlight.engine.stems().length > 0 && location.search.includes('dvorak9'))) return; } catch { /* loading */ }
    await sleep(500);
  }
};
await ready();
// As a returning player (tutorial done), so the songs bubble shows while the song plays (18 Nov): the heaviest case.
evalInPage(() => { window.__stemlight.ctx.save.patch({ tutorialDone: true }); return true; });
await sleep(1500);
try { evalInPage(() => { setTimeout(() => location.reload(), 50); return true; }); } catch { /* the reload cuts the call */ }
await sleep(6000);
await ready();
await enterXR();
iw('xr', 'set-input-mode', { mode: 'hand' });
await sleep(1000);

// Summon the brass (the hero entry), cut the timpani so the pads show, then jump to the densest window.
const brass = evalInPage(() => window.__stemlight.ctx.registry.all().find((t) => t.kind === 'creature' && t.stem === 'brass'));
iw('xr', 'look-at', { device: 'headset', target: { x: brass.center[0], y: brass.center[1], z: brass.center[2] } });
await sleep(1500);
evalInPage((dense) => {
  const s = window.__stemlight;
  s.ctx.bus.emit('gaze:summon', { stem: 'perc' }); // the lane shows the cut stem
  s.ctx.bus.emit('cut:add', { cut: { id: 'perf', stem: 'perc', t0: dense + 1, t1: dense + 3 } });
  s.ctx.transport.seek(dense - 3); // a little lead-in so the field fills up with live notes
  if (!s.ctx.transport.playing()) s.ctx.transport.play();
  s.statsReset();
  return true;
}, DENSE);
const samples = [];
for (let i = 0; i < 14; i++) {
  await sleep(500);
  samples.push(evalInPage(() => ({ ...window.__stemlight.stats(), t: +window.__stemlight.ctx.transport.time().toFixed(2), pads: window.__stemlight.ctx.registry.all().filter((x) => x.kind === 'pad').length, songs: !!window.__stemlight.songs.state().songsAt })));
}
const max = samples.at(-1);
for (const s of samples) log(`t=${s.t}  calls ${s.calls}  tris ${s.triangles}  notes ${s.notes}  pads ${s.pads}  (fps ${s.fps}, emulator)`);
const shot = iw('browser', 'screenshot', { format: 'png' });
writeFileSync(new URL(`${DATE}-perf-heaviest.png`, OUT), Buffer.from(String(shot.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
log(`screenshot: results/${DATE}-perf-heaviest.png`);
check('pads + lane shown during the run', samples.some((s) => s.pads > 0));
check('the songs bubble shown during the run', samples.some((s) => s.songs));
check('peak draw calls < 100', max.maxCalls < 100, `max ${max.maxCalls}`);
check('peak triangles < 150k', max.maxTriangles < 150000, `max ${max.maxTriangles}`);
check('peak live notes <= 1,500', max.maxNotes <= 1500, `max ${max.maxNotes}`);
log('Frame rate on a Quest 3/3S: unverified (no headset). The fps above is the headless emulator page and means nothing for the device.');
const failed = results.filter((r) => !r).length;
log(`${results.length - failed}/${results.length} passed`);
writeFileSync(new URL(`${DATE}-perf-heaviest.txt`, OUT), lines.join('\n') + '\n');
process.exitCode = failed ? 1 : 0;

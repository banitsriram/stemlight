// F23 (A side, task 29) in IWER: clean pause and resume, without repeating the tutorial, and a returning user
// sees their saved state. Starts a fresh first visit on Dvořák (storage cleared, tutorial NOT skipped), lets
// the real gaze summon pass the first step, then sets a mix (violins locked, flutes EQ'd, a cut on the cellos) over
// the bus, since the gestures themselves are proven elsewhere. Then:
//  - 5 headset-hidden cycles through IWER's own XRDevice.updateVisibilityState (the real session
//    'visibilitychange' a system menu or headset removal sends) and 1 'visible-blurred' cycle: app:pause,
//    music stopped with the clock frozen; back to visible: app:resume, music running on from where it stopped,
//    audio context running, mix intact, tutorial not restarted;
//  - 1 page-hidden cycle (a simulated document 'visibilitychange', which headless Chromium can't produce);
//  - 3 session ends (iwsdk xr exit): paused, the page offers Resume, a real click re-enters and the music
//    carries on from where it stopped with the mix intact;
//  - reload: the mix comes back from IndexedDB, the tutorial continues at its step rather than starting over;
//    then the tutorial is finished and a second reload starts in free play.
// Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/pause-resume.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterXR, evalInPage, iw, sleep } from './harness.mjs';

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const tally = {};
const check = (name, ok, detail = '') => {
  tally[name] ??= { pass: 0, fail: 0 };
  tally[name][ok ? 'pass' : 'fail']++;
  log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const STEPS = ['summon', 'silence', 'return', 'lock', 'solo', 'cut', 'pads', 'free'];

/** Hooks the bus so pause/resume events can be counted (the hook is lost on reload; call again after). */
const hook = () => evalInPage(() => {
  window.__lc = [];
  for (const k of ['app:pause', 'app:resume']) window.__stemlight.ctx.bus.on(k, () => window.__lc.push(k));
  return true;
});
/** One read of everything the checks look at. */
const S = () => evalInPage(() => {
  const s = window.__stemlight, tr = s.ctx.transport, m = s.engine.mix();
  return {
    paused: s.lifecycle.paused(), playing: tr.playing(), t: tr.time(), ac: s.engine.audio.context().state,
    step: s.story.tutorial.step(), mem: localStorage.getItem('stemlight.tutorialStep'),
    mute: m.mute.vln, eq: m.eq.fl ?? null, cuts: s.parts.cuts().map((c) => c.id), ev: (window.__lc ?? []).slice(),
  };
});
const mixOk = (s) => s.mute === 'locked' && s.eq?.low === 6 && s.eq?.high === -6 && JSON.stringify(s.cuts) === '["pr-cut"]';
const mixStr = (s) => `vln ${s.mute}, fl ${s.eq ? `${s.eq.low}/${s.eq.high}` : 'flat'}, cuts ${JSON.stringify(s.cuts)}`;
const idx = (step) => STEPS.indexOf(step);
const ready = async (needle) => {
  await sleep(6000);
  for (let i = 0; i < 60; i++) {
    try { if (evalInPage((n) => !!window.__stemlight && window.__stemlight.engine.stems().length > 0 && location.search.includes(n), needle)) return; } catch { /* loading */ }
    await sleep(500);
  }
  throw new Error('page did not load');
};
const clickButton = async (name) => {
  for (let i = 0; i < 20; i++) {
    const b = iw('browser', 'snapshot').elements.find((e) => e.role === 'button' && e.name === name);
    if (b) { const r = iw('browser', 'interact', { steps: [{ action: 'click', ref: b.ref }] }); if (r.failure) throw new Error(r.failure.message); return true; }
    await sleep(250);
  }
  return false;
};
const waitSession = async (want) => { for (let i = 0; i < 40 && iw('xr', 'status').sessionActive !== want; i++) await sleep(250); return iw('xr', 'status').sessionActive === want; };

// ---- a fresh first visit ----
try { iw('xr', 'exit'); } catch { /* not in a session */ }
try { evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.removeItem('stemlight.tutorialStep'); location.href = '/?piece=dvorak9&pr=1'; return true; }); } catch { /* navigation */ }
await ready('pr=1');
await enterXR();
hook();
await sleep(3000); // IWER's default head pose looks at a creature: the real summon passes the first step
evalInPage(() => {
  const b = window.__stemlight.ctx.bus;
  b.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
  b.emit('stem:eq', { stem: 'fl', low: 6, mid: 0, high: -6 });
  b.emit('cut:add', { cut: { id: 'pr-cut', stem: 'vla_vc', t0: 100, t1: 102 } }); // not a replaceable stem, so no take starts
  window.__stemlight.ctx.transport.seek(20); // room for the whole run before the piece ends
  return true;
});
await sleep(1500);
let s0 = S();
log(`start: playing ${s0.playing} at ${s0.t.toFixed(2)} s, tutorial at '${s0.step}', ${mixStr(s0)}`);
check('setup: music playing, tutorial past the first step, mix set', s0.playing && idx(s0.step) >= 1 && mixOk(s0), `'${s0.step}'`);

// ---- headset hidden / blurred, through IWER's real session visibility ----
const cycle = async (label, hide, show) => {
  const before = S();
  const ev0 = before.ev.length;
  hide();
  await sleep(700);
  const a = S();
  await sleep(1200);
  const b = S();
  check(`${label}: paused, music stopped, clock frozen`, a.paused && !a.playing && !b.playing && Math.abs(b.t - a.t) < 0.005 && a.ev.slice(ev0).includes('app:pause'),
    `paused ${a.paused}, playing ${a.playing}, clock ${a.t.toFixed(3)} -> ${b.t.toFixed(3)}, events ${JSON.stringify(a.ev.slice(ev0))}`);
  show();
  await sleep(700);
  const c = S();
  await sleep(1200);
  const e = S();
  const jump = c.t - b.t;
  check(`${label}: resumed from where it stopped`, !c.paused && c.playing && e.t > c.t + 0.3 && jump > 0 && jump < 4 && c.ac === 'running' && c.ev.slice(ev0).includes('app:resume'),
    `playing ${c.playing}, clock ${b.t.toFixed(2)} -> ${c.t.toFixed(2)} -> ${e.t.toFixed(2)}, audio ${c.ac}`);
  check(`${label}: mix intact, tutorial not restarted`, mixOk(e) && idx(e.step) >= idx(before.step) && e.step !== 'summon', `${mixStr(e)}; tutorial '${before.step}' -> '${e.step}'`);
};
const vis = (state) => () => evalInPage((st) => { window.IWER_DEVICE.updateVisibilityState(st); return true; }, state);
for (let k = 1; k <= 5; k++) await cycle(`headset hidden ${k}`, vis('hidden'), vis('visible'));
await cycle('system menu (visible-blurred)', vis('visible-blurred'), vis('visible'));

// ---- page hidden (simulated: headless Chromium never hides the page) ----
const pageVis = (hidden) => () => evalInPage((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
  if (!h) delete document.hidden; // back to the real getter
  return true;
}, hidden);
await cycle('page hidden (simulated event)', pageVis(true), pageVis(false));

// ---- session end, then Resume ----
for (let k = 1; k <= 3; k++) {
  const before = S();
  const ev0 = before.ev.length;
  iw('xr', 'exit');
  const ended = await waitSession(false);
  await sleep(500);
  const a = S();
  await sleep(1000);
  const b = S();
  const offered = await clickButton('Resume');
  check(`session end ${k}: paused, clock frozen, Resume offered`, ended && a.paused && !a.playing && Math.abs(b.t - a.t) < 0.005 && a.ev.slice(ev0).includes('app:pause') && offered,
    `ended ${ended}, paused ${a.paused}, clock ${a.t.toFixed(3)} -> ${b.t.toFixed(3)}, Resume button ${offered}`);
  const back = await waitSession(true);
  await sleep(800);
  const c = S();
  await sleep(1200);
  const e = S();
  const jump = c.t - b.t;
  check(`session end ${k}: Resume re-enters and the music carries on`, back && c.playing && e.t > c.t + 0.3 && jump > 0 && jump < 5 && c.ac === 'running',
    `session ${back}, clock ${b.t.toFixed(2)} -> ${c.t.toFixed(2)} -> ${e.t.toFixed(2)}, audio ${c.ac}`);
  check(`session end ${k}: mix intact, tutorial not restarted`, mixOk(e) && idx(e.step) >= idx(before.step) && e.step !== 'summon', `${mixStr(e)}; tutorial '${before.step}' -> '${e.step}'`);
}

// ---- reload: the returning user ----
const beforeReload = S();
iw('xr', 'exit');
await waitSession(false);
await sleep(800); // persist writes 300 ms after the last change; app:pause flushed it already
try { evalInPage(() => { location.reload(); return true; }); } catch { /* navigation */ }
await ready('pr=1');
const r0 = S(); // before Enter: loaded from IndexedDB
check('reload: saved mix restored before entering', mixOk(r0), mixStr(r0));
await enterXR();
await sleep(1500);
const r1 = S();
check('reload: tutorial continues at its step, not from the start', idx(r1.step) >= idx(beforeReload.step) && r1.step !== 'summon',
  `before reload '${beforeReload.step}' (saved index ${beforeReload.mem}), after '${r1.step}'`);
check('reload: music plays after Enter', r1.playing && r1.ac === 'running', `playing ${r1.playing}, audio ${r1.ac}`);

// Finish the tutorial with the events each remaining step waits for, then reload once more.
evalInPage(() => {
  const b = window.__stemlight.ctx.bus;
  b.emit('stem:mute', { stem: 'hn', state: 'held', lockProgress: 0.2 });
  b.emit('stem:mute', { stem: 'hn', state: 'on', lockProgress: 0 });
  b.emit('stem:mute', { stem: 'hn', state: 'locked', lockProgress: 1 });
  b.emit('stem:solo', { stem: 'brass' });
  b.emit('cut:add', { cut: { id: 'pr-cut2', stem: 'reeds', t0: 120, t1: 121 } });
  b.emit('part:hit', { cutId: 'pr-cut2', instrument: 'pads', pitch: 52, vel: 90, t: 0.5, from: [0, 1, -0.4] });
  return true;
});
await sleep(1200);
const f0 = S();
check('tutorial finished', f0.step === 'free', `'${f0.step}'`);
iw('xr', 'exit');
await waitSession(false);
await sleep(800);
try { evalInPage(() => { localStorage.removeItem('stemlight.tutorialStep'); location.reload(); return true; }); } catch { /* navigation */ }
await ready('pr=1');
await enterXR();
await sleep(1500);
const f1 = S();
check('reload after finishing: free play, no tutorial (from IndexedDB alone)', f1.step === 'free', `'${f1.step}', saved index cleared before reload`);

// Leave the page clean for the next run.
try { iw('xr', 'exit'); } catch { /* already out */ }
evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.removeItem('stemlight.tutorialStep'); return true; });

log('');
let failed = 0;
const groups = {};
for (const [name, { pass, fail }] of Object.entries(tally)) {
  const g = name.replace(/ \d+:/, ':').replace(/^(headset hidden|system menu \(visible-blurred\)|page hidden \(simulated event\)):/, 'visibility:');
  groups[g] ??= { pass: 0, fail: 0 };
  groups[g].pass += pass; groups[g].fail += fail; failed += fail;
}
for (const [g, { pass, fail }] of Object.entries(groups)) log(`${fail ? 'FAIL' : 'PASS'}  ${g}: ${pass}/${pass + fail}`);
writeFileSync(new URL(`${DATE}-pause-resume.txt`, OUT), lines.join('\n') + '\n');
process.exitCode = failed ? 1 : 0;

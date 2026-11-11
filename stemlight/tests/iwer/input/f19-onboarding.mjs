// F19 (banit's request biyon-55): a fresh first visit in IWER. Enter by a real click (audio unlocks), head
// turned away, then a scripted head turn to the first creature: the summon (first payoff) must land within
// 15 s of the music starting. Then do nothing: after 10 s the tutorial's nudge fires.
// Needs a dev session with --allow-browser-automation. Run: node tests/iwer/input/f19-onboarding.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterXR, evalInPage, inputLog, iw, sleep } from './harness.mjs';

const lines = [];
const results = [];
const log = (s) => { lines.push(s); console.log(s); };
const check = (name, ok, detail = '') => { results.push(ok); log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const shot = (name) => {
  try {
    const r = iw('browser', 'screenshot', { format: 'png' });
    writeFileSync(new URL(`${DATE}-f19-${name}.png`, OUT), Buffer.from(String(r.imageData).replace(/^data:[^,]+,/, ''), 'base64'));
    return `results/${DATE}-f19-${name}.png`;
  } catch (e) { return `screenshot failed: ${String(e.message).slice(0, 80)}`; }
};
const tut = () => evalInPage(() => {
  const s = window.__stemlight, t = s.story.tutorial;
  return { step: t.step(), words: t.words(), nudges: t.tick(performance.now() / 1000), playing: s.ctx.transport.playing(), t: s.ctx.transport.time() };
});

// Fresh first visit: no saved mix, no tutorial progress.
try { iw('xr', 'exit'); } catch { /* not in a session */ }
try {
  evalInPage(() => { indexedDB.deleteDatabase('stemlight'); localStorage.removeItem('stemlight.tutorialStep'); setTimeout(() => location.reload(), 50); return true; });
} catch { /* the reload cuts the call */ }
await sleep(6000);
for (let i = 0; i < 40; i++) {
  try { if (evalInPage(() => !!document.querySelector('#landing button') && !!window.__stemlight)) break; } catch { /* loading */ }
  await sleep(500);
}

const since = Date.now() - 1;
await enterXR(); // a real click on Enter: unlocks audio, starts the music
iw('xr', 'set-input-mode', { mode: 'hand' });
// When the music started, in page-clock ms (the tutorial step clock starts then too).
const startPage = evalInPage(() => Date.now() - window.__stemlight.ctx.transport.time() * 1000);
let s = tut();
check('music playing after one Enter click (audio unlocked)', s.playing === true, JSON.stringify({ t: +s.t.toFixed(2) }));
// IWER starts seated and facing forward, as a person sits down: the creature ahead is in the gaze cone.
const summon = inputLog(since).find((e) => e.event === 'gaze:summon');
const payoff = summon ? (new Date(summon.at).getTime() - startPage) / 1000 : null;
check('first payoff: a creature is summoned within 15 s of the music starting', payoff !== null && payoff <= 15,
  payoff !== null ? `${summon.data.stem} at ${payoff.toFixed(1)} s (negative = while Enter was landing; the tutorial counts it)` : 'no summon');
log(`screenshot after entry: ${shot('1-summoned')}`);
check('tutorial moved past the summon step to the next cue', s.step === 'silence' && s.words.length > 0, JSON.stringify({ step: s.step, words: s.words }));

// Now do nothing at all. The next step's 10 s idle clock starts at the summon (or at the music start if
// the summon landed before it), both in the page's own wall clock.
const stepStart = Math.max(new Date(summon?.at ?? 0).getTime(), startPage);
let nudged = null;
for (let i = 0; i < 60 && nudged === null; i++) {
  s = tut();
  if (s.nudges >= 1) nudged = (evalInPage(() => Date.now()) - stepStart) / 1000;
  else await sleep(400);
}
check('doing nothing for 10 s -> a nudge on the waiting step', nudged !== null && nudged >= 9.5 && nudged <= 13,
  nudged !== null ? `nudge ${nudged.toFixed(1)} s after the step began, step ${s.step}` : 'no nudge in 25 s');
log(`screenshot nudge: ${shot('2-nudge')}`);

const failed = results.filter((r) => !r).length;
log(`${results.length - failed}/${results.length} passed  (emulator; no claim about hand feel or device timing)`);
writeFileSync(new URL(`${DATE}-f19-onboarding.txt`, OUT), lines.join('\n') + '\n');
process.exitCode = failed ? 1 : 0;

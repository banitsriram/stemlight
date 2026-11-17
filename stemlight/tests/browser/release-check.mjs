// F28 / task 69: the judge's first visit, on the real deployed build, in a brand-new browser profile.
// Plain Chromium has no headset, so IWER (the same emulator the dev build uses) is injected before the page's
// own scripts as an emulated Quest 3 in hand-tracking mode; the app's production bundle is otherwise untouched.
// It checks:
//  - the page and every request load with no console errors, page errors or failed requests;
//  - which bundle is live (and, with --expect <file>, that it is the pinned one), and no dev code shipped;
//  - Enter (a real click) starts XR and the music on the audio clock, with no controllers;
//  - leaving VR shows Resume, and Resume carries the music on;
//  - a reload in the same profile comes back clean, with the save in IndexedDB;
//  - with --full: the tutorial song plays to its end and the song picker waits (no song starts by itself); a
//    fingertip touch on a bubble plays Dvorak, the songs bubble held mid-song brings the picker back, and a touch
//    plays Beethoven 7 (about 2.5 minutes). The emulated right index tip is placed with the standard WebXR
//    joint pose, the way a real hand reaches it.
// Usage (from stemlight/):
//   node tests/browser/release-check.mjs [url] [--expect assets/index-XXXX.js] [--full]
// Default url: https://stemlight.vercel.app/
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, name === '--full' ? 1 : 2)[1] ?? true; };
const FULL = !!flag('--full');
const EXPECT = flag('--expect');
const URL_ = args[0] ?? 'https://stemlight.vercel.app/';
const IWER = readFileSync(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');

const lines = [];
let failed = false;
const log = (s) => { lines.push(s); console.log(s); };
const check = (ok, msg) => { log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'stemlight-judge-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', ignoreHTTPSErrors: new URL(URL_).hostname === 'localhost', // local preview uses a self-signed cert viewport: { width: 1280, height: 800 },
  args: ['--autoplay-policy=user-gesture-required'], // like a real browser: audio only after the Enter click
});
const consoleErrors = [], pageErrors = [], badRequests = [], requests = [];
try {
  await context.addInitScript(IWER);
  await context.addInitScript(() => {
    // Emulated Quest 3, hands only. Records the XR session and every AudioContext so the checks can read them.
    const device = new window.IWER.XRDevice(window.IWER.metaQuest3);
    device.primaryInputMode = 'hand';
    device.installRuntime({ forceInstall: true }); // Chromium's own navigator.xr has no headset behind it
    window.__judge = { sessions: [], contexts: [], sources: 0, device };
    const req = navigator.xr.requestSession.bind(navigator.xr);
    navigator.xr.requestSession = async (...a) => { const s = await req(...a); window.__judge.sessions.push(s); return s; };
    const AC = window.AudioContext;
    window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__judge.contexts.push(this); } };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { window.__judge.sources++; return start.apply(this, a); };
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => badRequests.push(`${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => { requests.push({ url: r.url(), status: r.status(), at: Date.now() }); if (r.status() >= 400) badRequests.push(`${r.url()} (HTTP ${r.status()})`); });
  const audio = () => page.evaluate(() => {
    const c = window.__judge.contexts.at(-1), s = window.__judge.sessions.at(-1);
    return { state: c?.state ?? 'none', time: c?.currentTime ?? 0, sources: window.__judge.sources, session: !!s && !s.__ended, sessions: window.__judge.sessions.length };
  });
  const enterButton = (name) => page.getByRole('button', { name, exact: true });
  const watchEnd = () => page.evaluate(() => { const s = window.__judge.sessions.at(-1); s?.addEventListener('end', () => { s.__ended = true; }); });

  // ---- first visit ----
  log(`url: ${URL_}`);
  log('profile: brand-new, empty, deleted afterwards');
  const t0 = Date.now();
  const resp = await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  check(resp?.ok(), `page loads (HTTP ${resp?.status()})`);
  await enterButton('Enter').waitFor({ state: 'visible', timeout: 30000 });
  log(`Enter visible after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const bundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => new URL(s.src).pathname.replace(/^\//, '')).find((p) => /assets\/index-.*\.js$/.test(p)) ?? null);
  log(`live bundle: ${bundle}`);
  if (EXPECT) check(bundle === EXPECT, `pinned build is live (expected ${EXPECT})`);
  const devCode = await page.evaluate(async (b) => {
    const text = b ? await (await fetch(b)).text() : '';
    return { stemlight: typeof window.__stemlight !== 'undefined', devHand: text.includes('DevHandPose'), size: text.length };
  }, bundle);
  check(!devCode.stemlight && !devCode.devHand, `no dev code shipped (window.__stemlight ${devCode.stemlight ? 'present' : 'absent'}, DevHandPose ${devCode.devHand ? 'in bundle' : 'not in bundle'}, bundle ${(devCode.size / 1e6).toFixed(2)} MB)`);

  // ---- Enter: XR + music, hands only ----
  await enterButton('Enter').click();
  const t0Music = Date.now();
  // The unlock plays one silent source; the music starts one per stem.
  for (let i = 0; i < 120 && (await audio()).sources < 2; i++) await sleep(250);
  await watchEnd();
  const a1 = await audio();
  await sleep(3000);
  const a2 = await audio();
  log(`after Enter: XR session ${a1.session}, audio ${a2.state}, clock ${a1.time.toFixed(2)} -> ${a2.time.toFixed(2)} s, ${a2.sources} sources started`);
  check(a1.session && a2.state === 'running' && a2.time > a1.time + 2 && a2.sources > 0, 'Enter starts XR and the music (emulated Quest 3, hands only)');
  const firstPiece = requests.find((r) => /\/pieces\/[^/]+\/manifest\.json/.test(r.url));
  log(`first piece: ${firstPiece ? firstPiece.url.match(/pieces\/([^/]+)\//)[1] : 'none'}`);

  // ---- full sequence: the song picker (18 Nov) ----
  if (FULL) {
    // A piece starts when its beats.json loads: the picker reads every song's manifest up front, so manifests no
    // longer mark a start. Bubble positions come from the app's own layout (picker.ts, layout.ts), at the seat the
    // app fixes on the first play: the headset's pose then (it doesn't move in this run).
    const loaded = () => [...new Set(requests.filter((r) => /\/pieces\/[^/]+\/beats\.json/.test(r.url)).map((r) => r.url.match(/pieces\/([^/]+)\//)[1]))];
    const { bubbleLocal, songsBubbleLocal } = await import('../../src/ui/remake/picker.ts');
    const { toWorld } = await import('../../src/ui/remake/layout.ts');
    const { SONGS } = await import('../../src/audio/sequence.ts');
    const ids = SONGS.map((s) => s.id);
    const eye = await page.evaluate(() => { const p = window.__judge.device.position; return [p.x, p.y, p.z]; });
    const seat = { eye, yaw: 0 };
    const bubble = (id) => toWorld(seat, bubbleLocal(ids.indexOf(id), ids.length));
    // Moves the emulated right hand so its index fingertip (read back from the XR frame) lands on `at`, for `holdMs`.
    const tipTo = (at, holdMs) => page.evaluate(async ({ at, holdMs }) => {
      const dev = window.__judge.device, s = window.__judge.sessions.at(-1), hand = dev.hands.right;
      const src = [...s.inputSources].find((i) => i.hand && i.handedness === 'right');
      if (!src) return { ok: false, why: 'no tracked right hand' };
      const space = await s.requestReferenceSpace('local-floor');
      const tip = () => new Promise((res) => s.requestAnimationFrame((_, f) => {
        const p = f.getJointPose(src.hand.get('index-finger-tip'), space);
        res(p ? [p.transform.position.x, p.transform.position.y, p.transform.position.z] : null);
      }));
      let t = null;
      for (let i = 0; i < 4; i++) {
        t = await tip();
        if (!t) return { ok: false, why: 'no index tip pose' };
        const g = hand.position;
        hand.position.set(g.x + at[0] - t[0], g.y + at[1] - t[1], g.z + at[2] - t[2]);
      }
      t = await tip();
      await new Promise((r) => setTimeout(r, holdMs));
      return { ok: true, tip: t, err: Math.hypot(t[0] - at[0], t[1] - at[1], t[2] - at[2]) };
    }, { at, holdMs });
    const towardEye = (p, m) => { const d = [eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]], l = Math.hypot(...d); return p.map((x, i) => x + (d[i] / l) * m); };
    // Touch a bubble: come in from 12 cm nearer the eye once the picker has armed, then back out.
    const touchSong = async (id) => {
      await tipTo(towardEye(bubble(id), 0.12), 1500);
      const r = await tipTo(bubble(id), 600);
      await tipTo(towardEye(bubble(id), 0.12), 300);
      return r;
    };
    const waitFor = async (pred, ms) => { const t1 = Date.now(); while (Date.now() - t1 < ms) { if (await pred()) return true; await sleep(500); } return false; };
    const start = Date.now();
    const first = loaded()[0];
    const dur = await page.evaluate(async (id) => (await (await fetch(`/pieces/${id}/manifest.json`)).json()).durationSec, first);
    await sleep(Math.max(0, (dur + 8) * 1000 - (Date.now() - t0Music)));
    const quietSources = (await audio()).sources;
    await sleep(4000);
    check(loaded().length === 1 && (await audio()).sources === quietSources,
      `full run: ${first} played to its end (${dur.toFixed(0)} s), then the picker waited: no song started by itself`);
    // Touch Dvorak.
    const s0 = (await audio()).sources;
    const r1 = await touchSong('dvorak9');
    const dv = await waitFor(async () => loaded().includes('dvorak9') && (await audio()).sources > s0, 20000);
    check(dv, `touching the Dvorak bubble plays it (tip ${r1.ok ? `${(r1.err * 100).toFixed(1)} cm from the centre` : r1.why}; loaded ${loaded().join(' -> ')})`);
    await sleep(5000);
    // Hold the songs bubble (beside the reset shell), then touch Beethoven 7.
    const songsAt = toWorld(seat, songsBubbleLocal());
    const s1 = (await audio()).sources;
    await tipTo(towardEye(songsAt, 0.1), 500);
    const r2 = await tipTo(songsAt, 1600);
    await tipTo(towardEye(songsAt, 0.12), 1200);
    const r3 = await touchSong('beethoven7');
    const b7 = await waitFor(async () => loaded().includes('beethoven7') && (await audio()).sources > s1, 20000);
    check(b7, `holding the songs bubble brings the picker back; touching Beethoven 7 plays it (hold tip ${r2.ok ? `${(r2.err * 100).toFixed(1)} cm` : r2.why}, touch ${r3.ok ? `${(r3.err * 100).toFixed(1)} cm` : r3.why}; loaded ${loaded().join(' -> ')}; ${((Date.now() - start) / 1000).toFixed(0)} s)`);
    await sleep(4000);
  }

  // ---- leave VR, Resume ----
  const before = await audio();
  await page.evaluate(() => window.__judge.sessions.at(-1).end());
  await enterButton('Resume').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const resumeShown = await enterButton('Resume').isVisible();
  check(resumeShown, 'leaving VR shows Resume');
  if (resumeShown) {
    await enterButton('Resume').click();
    for (let i = 0; i < 40 && (await audio()).sessions === before.sessions; i++) await sleep(250);
    await watchEnd();
    const r1 = await audio();
    await sleep(2500);
    const r2 = await audio();
    check(r1.session && r2.state === 'running' && r2.time > r1.time + 1.5, `Resume re-enters and the music carries on (session ${r1.session}, clock ${r1.time.toFixed(2)} -> ${r2.time.toFixed(2)} s)`);
  }

  // ---- reload in the same profile ----
  await sleep(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const anyButton = await Promise.race([
    enterButton('Enter').waitFor({ state: 'visible', timeout: 30000 }).then(() => 'Enter'),
    enterButton('Resume').waitFor({ state: 'visible', timeout: 30000 }).then(() => 'Resume'),
  ]).catch(() => null);
  const saved = await page.evaluate(async () => (await indexedDB.databases?.())?.map((d) => d.name) ?? []);
  check(!!anyButton && saved.includes('stemlight'), `reload comes back clean (button "${anyButton}", IndexedDB ${JSON.stringify(saved)})`);

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? ': ' + pageErrors.slice(0, 5).join(' | ') : ''}`);
  check(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ': ' + consoleErrors.slice(0, 5).join(' | ') : ''}`);
  check(badRequests.length === 0, `no failed requests${badRequests.length ? ': ' + badRequests.slice(0, 5).join(' | ') : ''} (${requests.length} responses)`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
const d = new Date();
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const host = new URL(URL_).host.replace(/[^a-z0-9.-]/gi, '_');
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${DATE}-release-check-${host}${FULL ? '-full' : ''}.txt`, import.meta.url), lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);

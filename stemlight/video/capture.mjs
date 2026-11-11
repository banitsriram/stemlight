// Video 1 (biyon-59): scripted captures from the real dev build in the IWER emulator, one clip per shot.
// Head turns and hands go through IWER's remote control (look_at, set_hand_pose, set_select_value), so every
// mute, lock and solo on screen comes from the app's own gesture engine. Records the WebGL canvas (no emulator
// panels) plus everything the app sends to the speakers, then writes an H.264 mp4 with an "Emulator footage" label.
// Each run appends to video/shots.json with the commit it was taken on.
// Run from stemlight/: node video/capture.mjs [shot-id ...]   (no ids = all shots). Clips: video/captures/ (gitignored).
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8094, OUT = 'video/captures', LEDGER = 'video/shots.json', W = 1920, H = 1080;
mkdirSync(OUT, { recursive: true });
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const dirty = execSync('git status --porcelain -- src web public index.html').toString().trim() !== '';

// ---------- page helpers ----------
async function open(browser, { piece = 'beethoven5', tutorial = false, context } = {}) {
  context ??= await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: W, height: H } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.addInitScript(() => {
    // Tee everything that reaches the speakers into a recordable stream.
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode) { const c = dest.context; c.__tap ??= c.createMediaStreamDestination(); connect.call(this, c.__tap); }
      return connect.call(this, dest, ...rest);
    };
  });
  await page.goto(`https://localhost:${PORT}/?piece=${piece}`);
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 120000 });
  if (!tutorial && !(await page.evaluate(() => window.__stemlight.ctx.save.load().tutorialDone))) {
    // The tutorial reads tutorialDone at load, so save it and load again.
    await page.evaluate(() => window.__stemlight.ctx.save.patch({ tutorialDone: true }));
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 120000 });
  }
  const sky = [0, 3.2, -1.2];
  // Remote commands need a session, so tilt the emulated head up on the device itself (60° about x).
  if (!tutorial) await page.evaluate(() => window.IWER_DEVICE.quaternion.set(0.5, 0, 0, 0.866));
  await page.click('#landing button');
  await page.waitForFunction(() => window.__stemlight.world.session && window.__stemlight.ctx.transport.playing(), null, { timeout: 30000 });
  const rc = (action, params) => page.evaluate(([a, p]) => window.IWER_DEVICE.remote.dispatch(a, p), [action, params]);
  await rc('set_input_mode', { mode: 'hand' });
  if (!tutorial) await rc('look_at', { device: 'headset', target: { x: sky[0], y: sky[1], z: sky[2] } });
  let gaze = tutorial ? [0, 1.6, -1] : sky;
  const api = {
    page, context, rc,
    wait: (s) => page.waitForTimeout(s * 1000),
    seek: (t) => page.evaluate((t) => window.__stemlight.ctx.transport.seek(t), t),
    center: (stem) => page.evaluate((s) => window.__stemlight.ctx.registry.all().find((t) => t.id === `creature:${s}`)?.center, stem),
    /** Turns the head smoothly (eased) to look at `to` over `sec` of wall time. */
    async look(to, sec = 1.2) {
      const from = gaze, t0 = Date.now();
      for (let u = 0; u < 1;) {
        u = Math.min(1, (Date.now() - t0) / 1000 / sec);
        const e = u * u * (3 - 2 * u);
        await rc('look_at', { device: 'headset', target: { x: from[0] + (to[0] - from[0]) * e, y: from[1] + (to[1] - from[1]) * e, z: from[2] + (to[2] - from[2]) * e } });
        await page.waitForTimeout(15);
      }
      gaze = to;
    },
    hand: (side, position, duration = 0.5) => rc('animate_to', { device: `hand-${side}`, position: { x: position[0], y: position[1], z: position[2] }, orientation: 'auto', anchor: 'grasp', duration }),
    pose: (side, poseId, duration = 0.15) => rc('set_hand_pose', { device: `hand-${side}`, poseId, duration }),
    async pinch(side, times = 1) {
      for (let i = 0; i < times; i++) {
        await rc('set_select_value', { device: `hand-${side}`, value: 1, duration: 0.05 });
        await page.waitForTimeout(110);
        await rc('set_select_value', { device: `hand-${side}`, value: 0, duration: 0.05 });
        await page.waitForTimeout(110);
      }
    },
    /** Hands resting low and ahead, palms in, both in view. */
    async rest() { await api.hand('left', [-0.2, 1.08, -0.35], 0.01); await api.hand('right', [0.2, 1.08, -0.35], 0.01); await api.pose('left', 'default', 0); await api.pose('right', 'default', 0); },
    /** Look at a creature until the gaze summons it, then wait for the glide. */
    async summon(stem, sec = 1.2) { await api.look(await api.center(stem), sec); await api.wait(1.4); },
  };
  return api;
}

async function record(api, fn) {
  await api.page.evaluate(() => {
    const s = window.__stemlight, canvas = s.world.renderer.domElement;
    const stream = new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...s.ctx.audio.context().__tap.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 20e6, audioBitsPerSecond: 256e3 });
    window.__chunks = []; rec.ondataavailable = (e) => window.__chunks.push(e.data);
    rec.start(); window.__rec = rec;
  });
  const events = [];
  const t0 = Date.now();
  await api.page.exposeFunction('__note', (e) => events.push([+((Date.now() - t0) / 1000).toFixed(2), e])).catch(() => {});
  await api.page.evaluate(() => { for (const k of ['gaze:summon', 'stem:mute', 'stem:solo', 'piece:end', 'piece:ready']) window.__stemlight.ctx.bus.on(k, (e) => window.__note(`${k} ${e.stem ?? e.id ?? ''} ${e.state ?? ''}`.trim())); });
  await fn(api);
  const b64 = await api.page.evaluate(async () => {
    const rec = window.__rec; rec.stop(); await new Promise((r) => (rec.onstop = r));
    const buf = new Uint8Array(await new Blob(window.__chunks).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768));
    return btoa(s);
  });
  // Keep only state changes, not the 30 Hz held/lock-progress stream.
  return { webm: Buffer.from(b64, 'base64'), events: events.filter((e, i) => i === 0 || e[1] !== events[i - 1][1]) };
}

// ---------- shots ----------
// Positions are XR-origin metres; the seats come from the manifests.
const SHOTS = {
  '01-opening': {
    what: 'First visit as a judge sees it: Enter, the first creature comes to you, Look / Make a fist with ghost hands',
    opts: { tutorial: true },
    run: async (a) => { await a.rest(); await a.wait(12); },
  },
  '02-fist-glass': {
    what: 'Hook: look at the violins, they glide in; a fist freezes them to glass (chime), open brings them back (bloom), a long fist locks (clink)',
    run: async (a) => {
      await a.rest(); await a.seek(6); await a.wait(1.5);
      await a.summon('vln');
      const c = await a.center('vln');
      await a.hand('right', [c[0], c[1], c[2] + 0.04], 0.6); await a.wait(0.8);
      await a.pose('right', 'fist'); await a.wait(1.0);
      await a.pose('right', 'default'); await a.wait(2.0);
      await a.pose('right', 'fist'); await a.wait(2.2);
      await a.pose('right', 'default'); await a.wait(0.6);
      await a.hand('right', [0.2, 1.08, -0.35], 0.8); await a.wait(3);
    },
  },
  '03-solo': {
    what: 'Look at the cellos, pinch twice: everything else dims and only they play; pinch twice again to bring the orchestra back',
    run: async (a) => {
      await a.rest(); await a.seek(40); await a.wait(1.5);
      await a.summon('vla_vc');
      const c = await a.center('vla_vc');
      await a.hand('right', [c[0], c[1], c[2] + 0.04], 0.6); await a.wait(0.8);
      await a.pinch('right', 2); await a.wait(5);
      await a.pinch('right', 2); await a.wait(3);
    },
  },
  '04-field-pan': {
    what: 'Beethoven tutti: a slow head pan across the whole field of creatures and notes',
    run: async (a) => {
      // Gaze stays above the creatures (summon needs 12° for 0.5 s), so nothing flies in mid-pan.
      await a.rest(); await a.seek(66); await a.look([-2.2, 2.35, -1.6], 1); await a.wait(0.5);
      await a.look([0, 2.4, -2.4], 4); await a.look([2.2, 2.35, -1.6], 4); await a.wait(1);
    },
  },
  '05-dvorak-brass': {
    what: 'Dvořák, the densest passage: look up to the brass with a full field of notes',
    opts: { piece: 'dvorak9' },
    run: async (a) => { await a.rest(); await a.seek(61); await a.look([0, 2.2, -1.2], 1); await a.wait(0.5); await a.look([0, 2.35, -2.4], 4); await a.wait(6); },
  },
  '06-end-card': {
    what: 'Dvořák ends naturally; the end card with every credit (CC BY-SA 3.0)',
    opts: { piece: 'dvorak9' },
    run: async (a) => {
      const d = await a.page.evaluate(() => window.__stemlight.ctx.transport.duration());
      // Just under the card's centre, 14° from the brass, so the gaze doesn't summon it.
      await a.rest(); await a.look([0, 1.15, -2.2], 1); await a.seek(d - 3); await a.wait(13);
    },
  },
  '07-second-visit': {
    what: 'Second visit: the violins locked last time come back dimmed, with "Your mix is back"',
    two: true,
    run: async (a) => { await a.rest(); await a.look([-0.88, 1.44, -1.21], 0.8); await a.wait(7); },
    before: async (a) => {
      // First visit (not recorded): lock the violins with a long fist.
      await a.rest(); await a.summon('vln');
      const c = await a.center('vln');
      await a.hand('right', [c[0], c[1], c[2] + 0.04], 0.4); await a.wait(0.6);
      await a.pose('right', 'fist'); await a.wait(2.2); await a.pose('right', 'default'); await a.wait(1.5);
    },
  },
};

// ---------- run ----------
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = want.length ? want : Object.keys(SHOTS);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r, j) => { vite.stdout.on('data', (d) => String(d).includes('ready in') && r()); vite.on('exit', () => j(new Error('vite exited'))); });
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

// The label goes on every clip (rules: emulator footage is labelled).
const label = `${OUT}/.label.png`;
{
  const p = await browser.newPage({ viewport: { width: 520, height: 64 } });
  await p.setContent(`<body style="margin:0;background:transparent"><div style="display:inline-block;margin:12px;padding:8px 14px;border-radius:8px;background:rgba(10,8,24,.55);color:#EEF2FF;font:500 22px system-ui,sans-serif;letter-spacing:.02em">Emulator footage · not a headset</div></body>`);
  await p.locator('div').screenshot({ path: label, omitBackground: true });
  await p.close();
}

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [];
let failed = false;
try {
  for (const id of ids) {
    const shot = SHOTS[id];
    if (!shot) { console.log(`unknown shot ${id}`); failed = true; continue; }
    console.log(`shot ${id}`);
    let api = await open(browser, shot.opts);
    if (shot.two) {
      await shot.before(api);
      await api.page.close();
      api = await open(browser, { ...shot.opts, context: api.context });
    }
    const { webm, events } = await record(api, shot.run);
    await api.context.close();
    const raw = `${OUT}/${id}.webm`, mp4 = `${OUT}/${id}.mp4`;
    writeFileSync(raw, webm);
    execSync(`ffmpeg -v error -y -i ${raw} -i ${label} -filter_complex "[0:v]fps=60[v];[v][1:v]overlay=24:H-h-24" -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -ar 48000 ${mp4}`);
    rmSync(raw);
    const seconds = +Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${mp4}`).toString()).toFixed(2);
    const entry = { id, file: mp4, what: shot.what, commit, dirty, emulator: true, seconds, at: new Date().toISOString(), events };
    const i = ledger.findIndex((e) => e.id === id);
    if (i >= 0) ledger[i] = entry; else ledger.push(entry);
    console.log(`  ${seconds}s`, events.map((e) => `${e[0]} ${e[1]}`).join(' | ') || '(no events)');
  }
} finally {
  ledger.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
  await browser.close();
  vite.kill();
}
process.exit(failed ? 1 : 0);

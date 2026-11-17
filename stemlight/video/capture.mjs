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
  await page.goto(`https://localhost:${PORT}/?piece=${piece}`, { timeout: 180000, waitUntil: "domcontentloaded" });
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
    /** Quick pinches, timed inside the page: a round trip per press is too slow for the 0.45 s double-pinch window. */
    pinch: (side, times = 1) => page.evaluate(async ({ side, times }) => {
      const set = (value) => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: `hand-${side}`, value, duration: 0.04 });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < times; i++) { await set(1); await wait(100); await set(0); await wait(100); }
    }, { side, times }),
    /** Hands resting low and ahead, palms in, both in view. */
    async rest() { await api.hand('left', [-0.2, 1.08, -0.35], 0.01); await api.hand('right', [0.2, 1.08, -0.35], 0.01); await api.pose('left', 'default', 0); await api.pose('right', 'default', 0); },
    targets: (kind) => page.evaluate((k) => window.__stemlight.ctx.registry.all().filter((t) => t.kind === k), kind),
    /** Both hands pinch the summoned instrument's lane and pull apart: a cut. Returns the cut, or null. */
    async cut(stem, half = 0.13) {
      const lane = (await api.targets('lane'))[0];
      if (!lane || lane.stem !== stem) return null;
      const d = [lane.extra.dx, lane.extra.dy, lane.extra.dz];
      const at = (k) => lane.center.map((x, i) => x + d[i] * k);
      await Promise.all([api.hand('left', at(-0.04), 0.5), api.hand('right', at(0.04), 0.5)]);
      await api.wait(0.7);
      await Promise.all(['left', 'right'].map((h) => rc('set_select_value', { device: `hand-${h}`, value: 1, duration: 0.05 })));
      await api.wait(0.3);
      await Promise.all([api.hand('left', at(-half), 0.9), api.hand('right', at(half), 0.9)]);
      await api.wait(1.2);
      await Promise.all(['left', 'right'].map((h) => rc('set_select_value', { device: `hand-${h}`, value: 0, duration: 0.05 })));
      await api.wait(0.3);
      await api.hand('left', [-0.3, 0.95, -0.2], 0.5);
      return page.evaluate((s) => window.__stemlight.parts.cuts().filter((c) => c.stem === s).at(-1) ?? null, stem);
    },
    /**
     * In the page, in real time (the music does not wait for a round trip per move): waits until the take's
     * loop is inside the cut with `need` seconds to spare, re-arming the cut if the take ran out first, then
     * moves the right index tip along `path`: [{ p }, { p, ms, hold? }, ...], a jump then straight lines.
     */
    play: (cut, path, need, pose = 'point') => page.evaluate(async ({ cut, path, need, pose }) => {
      const s = window.__stemlight, dev = window.IWER_DEVICE, tr = s.ctx.transport;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let cur = cut, rearmed = 0;
      const began = performance.now();
      for (;;) {
        const take = s.parts.taking(), t = tr.time();
        if (take && t >= cur.t0 + 0.05 && t < cur.t1 - need) break;
        if (!take && rearmed < 2) {
          rearmed++;
          s.ctx.bus.emit('cut:remove', { id: cur.id });
          cur = { ...cut, id: `${cut.id}-r${rearmed}` };
          s.ctx.bus.emit('cut:add', { cut: cur });
        }
        if (performance.now() - began > 40000) return { error: `never inside the region (t = ${t.toFixed(2)})` };
        await wait(20);
      }
      dev.hands.right.poseId = pose;
      const put = (p) => dev.remote.dispatch('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, anchor: 'index-tip', orientation: 'auto' });
      await put(path[0].p);
      await wait(150);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1].p, b = path[i].p, at = performance.now();
        for (;;) {
          const k = Math.min(1, (performance.now() - at) / path[i].ms);
          await put(a.map((x, j) => x + (b[j] - x) * k));
          if (k >= 1) break;
          await wait(8);
        }
        if (path[i].hold) await wait(path[i].hold);
      }
      return { rearmed };
    }, { cut, path, need, pose }),
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
  await api.page.evaluate(() => { for (const k of ['gaze:summon', 'stem:mute', 'stem:solo', 'piece:end', 'piece:ready', 'cut:add', 'part:hit']) window.__stemlight.ctx.bus.on(k, (e) => window.__note(`${k} ${e.stem ?? e.id ?? e.cut?.stem ?? e.instrument ?? e.targetId ?? ''} ${e.state ?? e.pitch ?? e.down ?? ''}`.trim())); });
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
    what: 'First visit as a judge sees it: Enter, the first instrument comes to you, Look / Make a fist with ghost hands',
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
    what: 'Beethoven tutti: a slow head pan across the whole field of instruments and notes',
    run: async (a) => {
      // Gaze stays above the instruments (summon needs 12° for 0.5 s), so nothing flies in mid-pan.
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
  '08-cut': {
    what: 'Look at the horns, pinch their line with both hands and pull apart: that stretch of the horn part is cut out and stays hollow',
    run: async (a) => {
      await a.rest(); await a.seek(20); await a.wait(1);
      await a.summon('hn');
      const cut = await a.cut('hn');
      console.log('  cut', JSON.stringify(cut));
      await a.hand('right', [0.3, 0.95, -0.2], 0.6); await a.wait(6);
    },
  },
  '09-drums': {
    what: 'Cut the timpani and two kettle drums appear: after the count-in, play the part yourself with a fingertip',
    run: async (a) => {
      await a.rest(); await a.seek(30); await a.wait(1);
      await a.summon('perc');
      const cut = await a.cut('perc');
      console.log('  cut', JSON.stringify(cut));
      const pads = await a.targets('pad');
      if (!cut || !pads.length) { console.log('  no drums'); await a.wait(2); return; }
      const up = (p) => [p.center[0], p.center[1] + 0.05, p.center[2]], down = (p) => [p.center[0], p.center[1] - 0.03, p.center[2]];
      const path = [{ p: up(pads[0]) }];
      for (const i of [0, 1, 0, 0, 1, 0, 1, 1]) {
        const p = pads[i % pads.length];
        path.push({ p: up(p), ms: 140 }, { p: down(p), ms: 90 }, { p: up(p), ms: 90, hold: 120 });
      }
      console.log('  play', JSON.stringify(await a.play(cut, path, 3.5, 'relaxed')));
      await a.wait(4);
    },
  },
  '10-harp': {
    what: 'Dvořák: cut the flutes and a harp stands in their place; sweep a fingertip across its strings, up and back',
    opts: { piece: 'dvorak9' },
    run: async (a) => {
      await a.rest(); await a.seek(30); await a.wait(1);
      await a.summon('fl');
      const cut = await a.cut('fl');
      console.log('  cut', JSON.stringify(cut));
      const strings = (await a.targets('string')).sort((x, y) => x.extra.pitch - y.extra.pitch);
      if (!cut || strings.length < 2) { console.log('  no harp'); await a.wait(2); return; }
      await a.look(strings[Math.floor(strings.length / 2)].center, 0.8);
      const r = [strings[0].extra.nx, strings[0].extra.ny, strings[0].extra.nz];
      const at = (k) => strings[0].center.map((x, i) => x + r[i] * (-0.025 + 0.05 * k)); // between strings k-1 and k
      const n = strings.length;
      console.log('  play', JSON.stringify(await a.play(cut, [{ p: at(0) }, { p: at(n), ms: 900, hold: 250 }, { p: at(0), ms: 900, hold: 250 }, { p: at(n), ms: 700 }], 3.5)));
      await a.wait(4);
    },
  },
  '11-keys': {
    what: 'Dvořák: cut the reeds and a keyboard appears; press its keys one after another',
    opts: { piece: 'dvorak9' },
    run: async (a) => {
      await a.rest(); await a.seek(60); await a.wait(1);
      await a.summon('reeds');
      const cut = await a.cut('reeds');
      console.log('  cut', JSON.stringify(cut));
      const keys = (await a.targets('key')).sort((x, y) => x.extra.pitch - y.extra.pitch);
      if (!cut || !keys.length) { console.log('  no keyboard'); await a.wait(2); return; }
      await a.look(keys[Math.floor(keys.length / 2)].center, 0.8);
      const up = (k) => [k.center[0], k.center[1] + 0.03, k.center[2]], down = (k) => [k.center[0], k.center[1] - 0.02, k.center[2]];
      const path = [{ p: up(keys[0]) }];
      for (const k of keys) path.push({ p: up(k), ms: 110 }, { p: down(k), ms: 100 }, { p: up(k), ms: 100, hold: 60 });
      console.log('  play', JSON.stringify(await a.play(cut, path, 4)));
      await a.wait(4);
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

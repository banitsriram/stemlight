// F18 + F27 (biyon-35, 63). Fresh browser profile, IWER dev server; seated eye 1.2 m (see measure()).
// F18: the landing has one Enter, the pitch line, "No account" and the hand-tracking hint; one click starts XR and audio.
// F27: at each opening step, everything shown (captions, ghost hands, cards) and every interaction target near you
// (the summoned creature, remake surfaces) sits inside 70×66° of the head's forward view; targets are within 2 ft (0.61 m).
// Screenshots with the dev FoV mask go to docs/tests/fov/. Run from stemlight/: node tests/iwer/visual/fov.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8096, OUT = 'docs/tests/fov', HALF_H = 35, HALF_V = 33, REACH = 0.61, EYE = 1.2;
mkdirSync(OUT, { recursive: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r, j) => { vite.stdout.on('data', (d) => String(d).includes('ready in') && r()); vite.on('exit', () => j(new Error('vite exited'))); });
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let ok = true;
const check = (name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`); ok &&= pass; };

try {
  await page.goto(`https://localhost:${PORT}/?fov`);
  await page.waitForSelector('#landing button');
  const landing = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('#landing button')].map((b) => b.textContent.trim()),
    text: document.getElementById('landing').innerText,
  }));
  check('F18 one Enter button', landing.buttons.length === 1 && landing.buttons[0] === 'Enter', JSON.stringify(landing.buttons));
  check('F18 pitch line', landing.text.includes('The music you can reach into'));
  check('F18 no account + hand-tracking hint', /No account/.test(landing.text) && /hand tracking/.test(landing.text));
  await page.waitForFunction(() => window.__stemlight?.engine.stems().length > 0, null, { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/0-landing.jpg`, type: 'jpeg', quality: 70 });
  // In the headset a pinch on the 2D page is a click; the emulator gets the same click.
  await page.click('#landing button');
  await page.waitForFunction(() => window.__stemlight.world.session && window.__stemlight.ctx.audio.context().state === 'running', null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#landing button'), null, { timeout: 5000 });
  check('F18 one click: XR session + audio running + landing gone', true);

  await page.waitForFunction(() => window.__stemlight.ctx.transport.playing(), null, { timeout: 30000 });

  // IWER keeps the camera at its 1.6 m default from a plain page script, so seating is done in the maths:
  // head-placed things (captions, ghost hands, reach spot) follow the eye and keep their angles at any height;
  // world-fixed ones (end card, remake surfaces, anything past 1.3 m) are measured from a 1.2 m eye.
  const measure = () => page.evaluate((EYE) => {
    const { world, ctx } = window.__stemlight;
    const cam = world.camera, V = cam.position.constructor, M = cam.matrixWorld.constructor;
    const head = new V(), q = cam.quaternion.clone();
    cam.getWorldPosition(head); cam.getWorldQuaternion(q); q.invert();
    const seated = head.clone().setY(EYE);
    const ang = (p, fixed = p.distanceTo(head) > 1.3) => { const l = p.clone().sub(fixed ? seated : head).applyQuaternion(q); return { yaw: Math.atan2(l.x, -l.z) * 57.2958, pitch: Math.atan2(l.y, Math.hypot(l.x, l.z)) * 57.2958, d: l.length() }; };
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const items = [];
    world.scene.traverse((o) => {
      if (!shown(o) || o.name === 'dev-fov-mask') return;
      if (o.isSprite && o.material.opacity > 0.01) {
        const c = new V(); o.getWorldPosition(c); const s = new V(); o.getWorldScale(s); const a = ang(c);
        const w = Math.atan2(s.x / 2, a.d) * 57.2958, h = Math.atan2(s.y / 2, a.d) * 57.2958;
        items.push({ what: 'sprite', yaw: [a.yaw - w, a.yaw + w], pitch: [a.pitch - h, a.pitch + h], d: a.d });
      } else if (o.isInstancedMesh && o.material.opacity < 0.7 && o.count <= 64) { // the ghost hands rig
        const m = new M(), p = new V(), ys = [], ps = [];
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); p.setFromMatrixPosition(m); const a = ang(p); ys.push(a.yaw); ps.push(a.pitch); }
        if (ys.length) items.push({ what: 'ghost-hands', yaw: [Math.min(...ys), Math.max(...ys)], pitch: [Math.min(...ps), Math.max(...ps)] });
      }
    });
    // Interaction targets you act on from the seat: the summoned creature (nearest) and every non-creature surface.
    const ts = ctx.registry.all().map((t) => ({ t, a: ang(new V(...t.center)) }));
    const creatures = ts.filter((x) => x.t.kind === 'creature').sort((a, b) => a.a.d - b.a.d);
    const near = [...(creatures[0] && creatures[0].a.d < 1 ? [creatures[0]] : []), ...ts.filter((x) => x.t.kind !== 'creature')];
    for (const { t, a } of near) items.push({ what: t.id, yaw: [a.yaw, a.yaw], pitch: [a.pitch, a.pitch], d: a.d, target: true });
    return { head: head.toArray().map((v) => +v.toFixed(2)), items };
  }, EYE);

  const emit = (k, e) => page.evaluate(([k, e]) => window.__stemlight.ctx.bus.emit(k, e), [k, e]);
  const results = [];
  const state = async (name, wait = 1500) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 70 });
    const m = await measure();
    const bad = m.items.filter((i) => Math.max(...i.yaw.map(Math.abs)) > HALF_H || Math.max(...i.pitch.map(Math.abs)) > HALF_V || (i.target && i.d > REACH));
    const r = (x) => +x.toFixed(1);
    results.push({ state: name, head: m.head, items: m.items.map((i) => ({ ...i, yaw: i.yaw.map(r), pitch: i.pitch.map(r), d: i.d && +i.d.toFixed(2) })), outside: bad.map((b) => b.what) });
    check(`F27 ${name}`, bad.length === 0 && m.items.length > 0, `${m.items.length} items${bad.length ? ', outside: ' + bad.map((b) => b.what).join(', ') : ''}`);
  };

  await state('1-look');
  await emit('gaze:summon', { stem: 'vln' }); await state('2-summoned-fist');
  await emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0.6 }); await state('3-held-open');
  await emit('stem:mute', { stem: 'vln', state: 'on', lockProgress: 0 }); await state('4-return-hold');
  await emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 }); await state('5-locked-pinch-twice');
  await emit('stem:mute', { stem: 'vln', state: 'on', lockProgress: 0 });
  await emit('stem:solo', { stem: 'vln' }); await state('6-solo-cut');
  await emit('stem:solo', { stem: null });
  await emit('cut:add', { cut: { id: 'fov', stem: 'perc', t0: 30, t1: 32 } }); await state('7-pads-tap');
  await emit('piece:end', { id: 'dvorak9' }); await state('8-end-card', 800);
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ fov: [HALF_H * 2, HALF_V * 2], reach: REACH, eye: EYE, results }, null, 1) + '\n');
  check('no console errors', errors.length === 0, JSON.stringify(errors));
} finally {
  await browser.close();
  vite.kill();
}
process.exit(ok ? 0 : 1);

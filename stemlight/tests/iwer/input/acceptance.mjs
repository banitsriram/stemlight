// Full-size acceptance runs in IWER for the A-side features (biyon-14): F32, F04+F33, F05, F06, F07, F08.
// Each suite runs inside the page through `iwsdk browser run` calls, in chunks (a call may last at most 110 s).
// It pauses the ECS and steps it frame by frame
// (1/72 s of gesture time per step) through the IWSDK MCP runtime, drives the emulated hands through DevHandPose
// and the headset through IWER's remote control, and reads the bus and the real audio engine's nodes.
// Needs a dev session started with --allow-browser-automation (see harness.mjs for STEMLIGHT_IWER_APP).
// Run: node tests/iwer/input/acceptance.mjs [f32 f04 f05 f06 f07 f08]   Logs go to tests/iwer/input/results/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterXR, evalInPage, iw, sleep } from './harness.mjs';

const d = new Date(); const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // local date
const RESULTS = new URL('./results/', import.meta.url);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['f32', 'f04', 'f05', 'f06', 'f07', 'f08'];
const LONG = { timeout: 105000 };

/** Loads the app with ?piece=<id>, waits for it, enters XR with hands. */
async function openPiece(piece, creatures) {
  try { evalInPage((p) => { location.search = `?piece=${p}`; }, piece); } catch { /* the navigation ends the call */ }
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const n = evalInPage(() => (window.__stemlightInput && window.FRAMEWORK_MCP_RUNTIME && window.__stemlight
        ? window.__stemlight.ctx.registry.all().filter((t) => t.kind === 'creature').length : -1));
      if (n === creatures) break;
    } catch { /* still loading */ }
  }
  await enterXR();
  iw('xr', 'set-input-mode', { mode: 'hand' });
  await sleep(500);
  return evalInPage(install);
}

/** Page side: puts the stepping, hand and audio helpers on window.__acc. */
async function install() {
  const R = window.FRAMEWORK_MCP_RUNTIME, dev = window.IWER_DEVICE, S = window.__stemlight;
  const { entities } = await R.dispatch('ecs_find_entities', { withComponents: ['DevHandPose'] });
  const idx = {};
  for (const e of entities) idx[e.name.replace('dev-hand-', '')] = e.entityIndex;
  if (!window.__accEv) {
    window.__accEv = [];
    for (const k of ['gaze:summon', 'stem:mute', 'stem:solo', 'stem:eq', 'app:reset']) S.ctx.bus.on(k, (e) => window.__accEv.push({ k, e }));
  }
  const stem = (id) => S.engine.stems().find((s) => s.id === id);
  window.__acc = {
    idx,
    get n() { return window.__accEv.length; },
    since: (i, k) => window.__accEv.slice(i).filter((x) => !k || x.k === k).map((x) => x.e),
    async set(side, fields) {
      for (const [field, value] of Object.entries(fields)) {
        await R.dispatch('ecs_set_component', { entityIndex: idx[side], componentId: 'DevHandPose', field, value });
      }
    },
    async step(n) { for (let left = n; left > 0; left -= 120) await R.dispatch('ecs_step', { count: Math.min(120, left) }); },
    pause: () => R.dispatch('ecs_pause'),
    resume: () => R.dispatch('ecs_resume'),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    gain: (id) => stem(id).gain.gain.value,
    gains: () => Object.fromEntries(S.engine.stems().map((s) => [s.id, s.gain.gain.value])),
    eqGains: (id) => ({ low: stem(id).low.gain.value, mid: stem(id).mid.gain.value, high: stem(id).high.gain.value }),
    creatures: () => S.ctx.registry.all().filter((t) => t.kind === 'creature'),
    debug: () => window.__stemlightInput.debug(),
    lookAt: (p) => dev.remote.dispatch('look_at', { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } }),
    async reachSpot() {
      const { position: p, orientation: q } = await dev.remote.dispatch('get_transform', { device: 'headset' });
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
      const len = Math.hypot(fx, fz) || 1;
      return [p.x + (fx / len) * 0.45, p.y - 0.15, p.z + (fz / len) * 0.45];
    },
    /** Summons a creature by head direction, then looks up along the same yaw so no other creature is in view. */
    async summon(id) {
      const c = window.__acc.creatures().find((t) => t.stem === id);
      if (window.__acc.debug().summoned !== id) { await window.__acc.lookAt(c.center); await window.__acc.step(42); }
      const spot = await window.__acc.reachSpot();
      await window.__acc.lookAt([spot[0] * 4, 6, spot[2] * 4]);
      await window.__acc.step(2);
      return spot;
    },
    /** Back to the start of the piece and playing, so it never reaches its end mid-suite. */
    rewind() { S.engine.transport.seek(0); if (!S.engine.transport.playing()) S.engine.transport.play(); },
    async unlock() { await S.engine.audio.unlock(); S.engine.transport.play(); return S.engine.audio.context().state; },
  };
  for (const side of ['left', 'right']) {
    await window.__acc.set(side, { enabled: true, connected: true, curl: -1, poseId: 'open', place: true, anchor: 'wrist', position: side === 'left' ? [-0.3, 0.9, -0.15] : [0.3, 0.9, -0.15] });
  }
  return { idx, creatures: window.__acc.creatures().map((c) => c.stem), audio: await window.__acc.unlock() };
}

// ---- suites (page side) ----

/** F32: head to each creature in a shuffled order, rounds [from, to). */
async function f32({ from, to }) {
  const A = window.__acc, lines = [];
  let pass = 0, total = 0;
  const cs = A.creatures();
  let prev = A.debug().summoned;
  await A.pause();
  try {
    for (let r = from; r < to; r++) {
      let seed = 11 + r * 7919;
      const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
      const order = cs.map((c) => c.stem);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      if (order[0] === prev) [order[0], order[1]] = [order[1], order[0]];
      for (const id of order) {
        const c = cs.find((x) => x.stem === id);
        const i = A.n;
        await A.lookAt(c.center);
        await A.step(42);
        const got = A.since(i, 'gaze:summon').map((e) => e.stem);
        const ok = got.length === 1 && got[0] === id;
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  round ${r + 1}  look at ${id} -> gaze:summon ${JSON.stringify(got)}`);
        prev = id;
      }
    }
  } finally { await A.resume(); }
  return { pass, total, lines };
}

/** F04 + F33: items [0, cycles) are fist/open cycles, [cycles, 2 cycles) lock cycles; the stem's real gain node is read each time. */
async function f04({ cycles, stem, from, to }) {
  const A = window.__acc, lines = [];
  let pass = 0, total = 0;
  const changes = (i) => A.since(i, 'stem:mute').map((e) => e.state).filter((s, j, a) => j === 0 || s !== a[j - 1]).join();
  await A.pause();
  try {
    A.rewind();
    const spot = await A.summon(stem);
    await A.set('right', { anchor: 'wrist', position: spot, poseId: 'open', connected: true });
    await A.step(4);
    for (let k = from; k < to; k++) {
      A.rewind();
      const i = A.n;
      if (k < cycles) {
        await A.set('right', { poseId: 'fist' }); await A.step(40); await A.wait(100);
        const held = { state: A.debug().mute[stem], gain: A.gain(stem) };
        await A.set('right', { poseId: 'open' }); await A.step(6); await A.wait(100);
        const back = { state: A.debug().mute[stem], gain: A.gain(stem) };
        const seq = changes(i);
        const ok = held.state === 'held' && held.gain < 0.01 && back.state === 'on' && back.gain > 0.99 && seq === 'held,on';
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  fist/open ${k + 1}: held gain ${held.gain.toFixed(3)}, open gain ${back.gain.toFixed(3)}, events ${seq}`);
      } else {
        await A.set('right', { poseId: 'fist' }); await A.step(3 + 115); await A.wait(100);
        const locked = { state: A.debug().mute[stem], gain: A.gain(stem) };
        await A.set('right', { poseId: 'open' }); await A.step(30); await A.wait(100);
        const opened = { state: A.debug().mute[stem], gain: A.gain(stem) };
        await A.set('right', { poseId: 'fist' }); await A.step(20);
        await A.set('right', { poseId: 'open' }); await A.step(6); await A.wait(100);
        const back = { state: A.debug().mute[stem], gain: A.gain(stem) };
        const seq = changes(i);
        const ok = locked.state === 'locked' && locked.gain < 0.01 && opened.state === 'locked' && opened.gain < 0.01
          && back.state === 'on' && back.gain > 0.99 && seq === 'held,locked,on';
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  lock ${k - cycles + 1}: locked gain ${locked.gain.toFixed(3)}, opened (still locked) gain ${opened.gain.toFixed(3)}, returned gain ${back.gain.toFixed(3)}, events ${seq}`);
      }
    }
  } finally { await A.resume(); }
  return { pass, total, lines };
}

/** F05: items [0, 2 cycles) are double-pinches that set and clear the solo (all stem gains read), then `cycles` with an injected gap. */
async function f05({ cycles, stem, from, to }) {
  const A = window.__acc, lines = [];
  let pass = 0, total = 0;
  const doublePinch = async (gap) => {
    await A.set('right', { poseId: 'pinch' }); await A.step(6);
    await A.set('right', { poseId: 'open' });
    if (gap) {
      await A.step(2);
      await A.set('right', { connected: false }); await A.step(gap);
      await A.set('right', { connected: true }); await A.step(3);
    } else {
      await A.step(12);
    }
    await A.set('right', { poseId: 'pinch' }); await A.step(6);
    await A.set('right', { poseId: 'open' }); await A.step(40);
  };
  await A.pause();
  try {
    A.rewind();
    const spot = await A.summon(stem);
    await A.set('right', { anchor: 'grasp', position: spot, poseId: 'open', connected: true });
    await A.step(4);
    for (let k = from; k < to; k++) {
      if (k % 4 === 0) A.rewind();
      const i = A.n;
      if (k < 2 * cycles) {
        await doublePinch(0);
        await A.wait(100);
        const solos = A.since(i, 'stem:solo').map((e) => e.stem);
        const want = k % 2 === 0 ? stem : null;
        const g = A.gains();
        const gainsOk = Object.entries(g).every(([id, v]) => (want === null || id === stem ? v > 0.99 : v < 0.01));
        const ok = solos.length === 1 && solos[0] === want && gainsOk && A.since(i, 'stem:mute').length === 0;
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  double-pinch ${k + 1} (${want ? 'set' : 'clear'}): stem:solo ${JSON.stringify(solos)}, gains ${JSON.stringify(Object.fromEntries(Object.entries(g).map(([id, v]) => [id, +v.toFixed(2)])))}`);
      } else {
        const gap = 15 + (k % 7); // 15-21 untracked frames: 0.21-0.29 s
        await doublePinch(gap);
        const solos = A.since(i, 'stem:solo');
        const ok = solos.length === 0;
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  gap run ${k - 2 * cycles + 1}: ${(gap / 72).toFixed(3)} s tracking gap between the pinches -> ${solos.length} solos`);
      }
    }
  } finally { await A.resume(); }
  return { pass, total, lines };
}

/** F06: fist, pinch and double-pinch near the summoned creature and 40 cm away; item = combo x cycles + k. */
async function f06({ cycles, stem, from, to }) {
  const A = window.__acc, items = [];
  const combos = [['fist', 'near'], ['fist', 'far'], ['pinch', 'near'], ['pinch', 'far'], ['double', 'near'], ['double', 'far']];
  // What each gesture may legitimately emit near the creature; far away it may emit nothing.
  const allowed = { fist: ['stem:mute'], pinch: [], double: ['stem:solo'] };
  await A.pause();
  try {
    A.rewind();
    const spot = await A.summon(stem);
    const far = [spot[0], spot[1] + 0.4, spot[2]];
    const gestures = {
      async fist() { await A.set('right', { poseId: 'fist' }); await A.step(40); await A.set('right', { poseId: 'open' }); await A.step(8); },
      async pinch() { await A.set('right', { poseId: 'pinch' }); await A.step(20); await A.set('right', { poseId: 'open' }); await A.step(40); },
      async double() {
        await A.set('right', { poseId: 'pinch' }); await A.step(6);
        await A.set('right', { poseId: 'open' }); await A.step(12);
        await A.set('right', { poseId: 'pinch' }); await A.step(6);
        await A.set('right', { poseId: 'open' }); await A.step(40);
      },
    };
    for (let item = from; item < to; item++) {
      const [name, where] = combos[Math.floor(item / cycles)], k = item % cycles;
      if (k % 5 === 0) A.rewind();
      await A.set('right', { anchor: name === 'fist' ? 'wrist' : 'grasp', position: where === 'near' ? spot : far, poseId: 'open', connected: true });
      await A.step(3);
      const i = A.n;
      await gestures[name]();
      const got = window.__accEv.slice(i);
      const unexpected = where === 'far' ? got : got.filter((x) => !allowed[name].includes(x.k)
        || (x.k === 'stem:mute' && x.e.stem !== stem) || (x.k === 'stem:solo' && x.e.stem !== stem && x.e.stem !== null));
      const intended = got.some((x) => allowed[name].includes(x.k));
      items.push({ name, where, k, bad: unexpected.length, intended, unexpected });
    }
  } finally { await A.resume(); }
  return { items };
}

/** F07: items [0, cycles) put a 0.29 s tracking gap in a fist hold; [cycles, 2 cycles) a 0.5 s gap, which quietly releases without locking. */
async function f07({ cycles, stem, from, to }) {
  const A = window.__acc, lines = [];
  let pass = 0, total = 0;
  await A.pause();
  try {
    A.rewind();
    const spot = await A.summon(stem);
    await A.set('right', { anchor: 'wrist', position: spot, poseId: 'open', connected: true });
    await A.step(4);
    for (let k = from; k < to; k++) {
      A.rewind();
      const i = A.n;
      if (k < cycles) {
        await A.set('right', { poseId: 'fist' }); await A.step(30);
        await A.set('right', { connected: false }); await A.step(21); // 21 untracked frames: 0.29 s
        await A.set('right', { connected: true }); await A.step(3); await A.wait(100);
        const states = A.since(i, 'stem:mute').map((e) => e.state);
        const ok = A.debug().mute[stem] === 'held' && !states.includes('on') && A.gain(stem) < 0.01;
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  0.29 s gap mid-fist ${k + 1}: state ${A.debug().mute[stem]}, gain ${A.gain(stem).toFixed(3)}`);
        await A.set('right', { poseId: 'open' }); await A.step(6);
      } else {
        await A.set('right', { poseId: 'fist' }); await A.step(80); // held 1.0 s: a lock would land inside the gap
        await A.set('right', { connected: false }); await A.step(36); // 0.5 s
        await A.set('right', { poseId: 'open' }); // reappears open
        await A.set('right', { connected: true }); await A.step(6); await A.wait(100);
        const seq = A.since(i, 'stem:mute').map((e) => e.state).filter((s, j, a) => j === 0 || s !== a[j - 1]).join();
        const ok = seq === 'held,on' && A.debug().mute[stem] === 'on' && A.gain(stem) > 0.99;
        total++; if (ok) pass++;
        lines.push(`${ok ? 'PASS' : 'FAIL'}  0.5 s gap mid-fist ${k - cycles + 1}: events ${seq}, gain ${A.gain(stem).toFixed(3)}`);
      }
    }
  } finally { await A.resume(); }
  return { pass, total, lines };
}

/** F08 (A side): EQ stretches with the real filter gains, each followed by a reset. */
async function f08({ stem, from, to }) {
  const A = window.__acc, lines = [];
  let pass = 0, total = 0;
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const both = async (l, r, pinched, frames) => {
    await A.set('left', { position: l, poseId: pinched ? 'pinch' : 'open' }); await A.step(1);
    await A.set('right', { position: r, poseId: pinched ? 'pinch' : 'open' }); await A.step(frames);
  };
  await A.pause();
  try {
    A.rewind();
    const spot = await A.summon(stem);
    await A.set('left', { anchor: 'grasp', position: add(spot, [-0.3, -0.3, 0.2]), poseId: 'open' });
    await A.set('right', { anchor: 'grasp', position: add(spot, [0.3, -0.3, 0.2]), poseId: 'open' });
    await A.step(4);
    for (let k = from; k < to; k++) {
      A.rewind();
      const vertical = k % 2 === 1;
      // Horizontal: 10 cm → 30 cm wide (+8 dB low). Vertical: 2 cm → 20 cm tall (+7.2 dB high).
      const at = (s) => (vertical ? [[-0.05, -s, 0], [0.05, s, 0]] : [[-s, 0, 0], [s, 0, 0]]);
      const from = vertical ? 0.01 : 0.05, to = vertical ? 0.1 : 0.15;
      let i = A.n;
      for (let j = 0; j <= 5; j++) {
        const s = from + ((to - from) * j) / 5;
        const [l, r] = at(s);
        await both(add(spot, l), add(spot, r), true, j === 0 ? 6 : 3);
      }
      await A.set('right', { poseId: 'open' }); await A.step(3); // commits
      await A.set('left', { poseId: 'open' }); await A.step(3);
      await A.wait(150);
      const eq = A.since(i, 'stem:eq');
      const committed = eq.at(-1);
      const filters = A.eqGains(stem);
      const want = vertical ? { low: 0, high: 7.2 } : { low: 8, high: 0 };
      const ok = !!committed && Math.abs(committed.low - want.low) < 1 && Math.abs(committed.high - want.high) < 1
        && Math.abs(filters.low - committed.low) < 0.5 && Math.abs(filters.high - committed.high) < 0.5
        && eq.every((e) => Math.abs(e.low) <= 12 && Math.abs(e.high) <= 12 && Math.abs(e.mid) <= 12);
      total++; if (ok) pass++;
      lines.push(`${ok ? 'PASS' : 'FAIL'}  stretch ${k + 1} (${vertical ? 'vertical' : 'horizontal'}): ${eq.length} stem:eq, committed ${JSON.stringify(committed && { low: +committed.low.toFixed(2), mid: committed.mid, high: +committed.high.toFixed(2) })}, filter gains ${JSON.stringify({ low: +filters.low.toFixed(2), mid: +filters.mid.toFixed(2), high: +filters.high.toFixed(2) })} dB`);
      // Reset: pinch 30 cm apart, bring together to 4 cm.
      i = A.n;
      for (const s of [0.15, 0.1, 0.05, 0.02]) await both(add(spot, [-s, 0, 0]), add(spot, [s, 0, 0]), true, s === 0.15 ? 6 : 3);
      await both(add(spot, [-0.3, -0.3, 0.2]), add(spot, [0.3, -0.3, 0.2]), false, 4);
      await A.wait(150);
      const reset = A.since(i, 'stem:eq').at(-1);
      const flat = A.eqGains(stem);
      const okReset = !!reset && reset.low === 0 && reset.mid === 0 && reset.high === 0
        && Math.abs(flat.low) < 0.5 && Math.abs(flat.high) < 0.5 && Math.abs(flat.mid) < 0.5;
      total++; if (okReset) pass++;
      lines.push(`${okReset ? 'PASS' : 'FAIL'}  reset ${k + 1}: last stem:eq ${JSON.stringify(reset)}, filter gains ${JSON.stringify({ low: +flat.low.toFixed(2), mid: +flat.mid.toFixed(2), high: +flat.high.toFixed(2) })} dB`);
    }
  } finally { await A.resume(); }
  return { pass, total, lines };
}

// ---- runner ----

/** Runs a page suite over items [0, count) in chunks small enough for one browser-run lease. */
function chunked(fn, args, count, chunk) {
  const out = { pass: 0, total: 0, lines: [], items: [] };
  for (let from = 0; from < count; from += chunk) {
    const res = evalInPage(fn, { ...args, from, to: Math.min(count, from + chunk) }, LONG);
    out.pass += res.pass ?? 0; out.total += res.total ?? 0;
    out.lines.push(...(res.lines ?? [])); out.items.push(...(res.items ?? []));
    console.log(`  ${fn.name} ${Math.min(count, from + chunk)}/${count}`);
  }
  return out;
}

mkdirSync(RESULTS, { recursive: true });
const summary = [];
function save(name, title, setup, res) {
  const text = [title, `run ${new Date().toISOString()} in IWER (Meta Quest 3 emulation, headless), ${setup}`, '', ...res.lines, '', `${res.pass}/${res.total} passed`, ''].join('\n');
  writeFileSync(new URL(`${DATE}-${name}.txt`, RESULTS), text);
  summary.push(`${name}: ${res.pass}/${res.total}${res.extra ? `, ${res.extra}` : ''}`);
  console.log(`${name}: ${res.pass}/${res.total}`);
}

if (wanted.includes('f32')) {
  const info = await openPiece('fixture', 9);
  console.log('fixture', JSON.stringify(info));
  const res = chunked(f32, {}, 20, 4);
  const per = {};
  for (const line of res.lines) {
    const m = /^(PASS|FAIL).*look at (\S+)/.exec(line);
    if (m) { per[m[2]] = per[m[2]] ?? [0, 0]; per[m[2]][1]++; if (m[1] === 'PASS') per[m[2]][0]++; }
  }
  res.lines.push('', ...Object.entries(per).map(([id, [p, t]]) => `${id}: ${p}/${t}`));
  save('f32-summon', 'F32 look to summon: head yaw to each of the 9 fixture creatures, 20 shuffled rounds', `piece fixture, ${info.creatures.length} creatures`, res);
}
const audioSuites = wanted.filter((x) => x !== 'f32');
if (audioSuites.length) {
  const info = await openPiece('beethoven5', 8);
  console.log('beethoven5', JSON.stringify(info));
  const setup = `piece beethoven5 (real stems), AudioContext ${info.audio}`;
  if (wanted.includes('f04')) save('f04-f33-fist-lock', 'F04 + F33 fist hold / lock / return, with the vln gain node read each time', setup, chunked(f04, { cycles: 20, stem: 'vln' }, 40, 10));
  if (wanted.includes('f05')) save('f05-solo', 'F05 double-pinch solo (20 set + 20 cleared) with all stem gains, then 20 double-pinches with an injected 0.21-0.29 s tracking gap', setup, chunked(f05, { cycles: 20, stem: 'fl' }, 60, 15));
  if (wanted.includes('f06')) {
    const res = chunked(f06, { cycles: 20, stem: 'hn' }, 120, 20);
    const groups = {};
    for (const it of res.items) {
      const g = (groups[`${it.name} ${it.where}`] ??= { bad: 0, intended: 0, n: 0, name: it.name, where: it.where });
      g.bad += it.bad; g.n++; if (it.intended) g.intended++;
      if (it.bad) res.lines.push(`  ${it.name} ${it.where} ${it.k + 1}: unexpected ${JSON.stringify(it.unexpected)}`);
    }
    let cross = 0;
    for (const [key, g] of Object.entries(groups)) {
      const needsIntended = g.where === 'near' && g.name !== 'pinch';
      const ok = g.bad === 0 && (!needsIntended || g.intended === g.n);
      cross += g.bad; res.total++; if (ok) res.pass++;
      res.lines.push(`${ok ? 'PASS' : 'FAIL'}  ${key} x${g.n}: ${g.bad} cross-triggers${needsIntended ? `, intended event ${g.intended}/${g.n}` : ''}`);
    }
    res.lines.push(`total cross-triggers: ${cross} over ${res.items.length} gestures`);
    res.extra = `${cross} cross-triggers over ${res.items.length} gestures`;
    save('f06-cross-trigger', 'F06 fist, pinch and double-pinch, 20 each near and 40 cm from the summoned creature', setup, res);
  }
  if (wanted.includes('f07')) save('f07-gaps', 'F07 tracking gaps mid-fist: 20 x 0.29 s holds, 20 x 0.5 s quietly releases without locking', setup, chunked(f07, { cycles: 20, stem: 'brass' }, 40, 10));
  if (wanted.includes('f08')) save('f08-eq', 'F08 (A side) 10 EQ stretches with the real filter gains, each followed by a reset', setup, chunked(f08, { stem: 'reeds' }, 10, 5));
}
console.log(`\n${summary.join('\n')}`);

// IWER input harness: drives the IWSDK managed browser through the iwsdk CLI, so it runs headless.
// Needs a running dev session (`npm run dev`, or `npx iwsdk dev up --ai-mode agent --headless`).
// Hands are driven through the dev-only DevHandPose component (src/dev/devInput.ts), one entity per hand.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// STEMLIGHT_IWER_APP points at another copy of the app (its own dev session), so edits elsewhere can't reload it mid-run.
const APP = process.env.STEMLIGHT_IWER_APP ?? fileURLToPath(new URL('../../../', import.meta.url));
const CLI = fileURLToPath(new URL('../../../node_modules/@iwsdk/cli/bin/iwsdk.js', import.meta.url));

/** One CLI call, e.g. iw('xr', 'look-at', {...}). Returns the parsed result. */
export function iw(group, action, params = {}) {
  // Under load the CLI's probe of the dev runtime can time out ("Runtime ownership is unknown"); that call did
  // nothing, so it is safe to retry after a short wait.
  for (let attempt = 1; ; attempt++) {
    try {
      const out = execFileSync(process.execPath, [CLI, group, action, '--input-json', JSON.stringify(params), '--raw'], {
        cwd: APP, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024, // detailed screenshots run past 1 MB
      });
      return JSON.parse(out);
    } catch (e) {
      const text = `${e.stdout ?? ''}${e.message ?? ''}`;
      if (attempt >= 4 || !text.includes('Runtime ownership is unknown')) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500 * attempt);
    }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Entity indices of the two DevHandPose entities, which change on every reload: { left, right }. */
export function devHands() {
  const { entities } = iw('ecs', 'find', { withComponents: ['DevHandPose'] });
  const hands = Object.fromEntries(entities.map((e) => [e.name.replace('dev-hand-', ''), e.entityIndex]));
  if (hands.left === undefined || hands.right === undefined) throw new Error('DevHandPose entities not found: is this a dev build?');
  return hands;
}

/** Sets DevHandPose fields on one hand, e.g. setHand(h, 'right', { enabled: true, poseId: 'fist' }). */
export function setHand(hands, side, fields) {
  for (const [field, value] of Object.entries(fields)) {
    iw('ecs', 'set-component', { entityIndex: hands[side], componentId: 'DevHandPose', field, value });
  }
}

/**
 * Two-hand moves, stepped alternately: simultaneous two-hand changes are unverified in IWER, so each
 * frame changes the left hand, advances one ECS frame, changes the right hand, advances another.
 * `left(i)` and `right(i)` return the DevHandPose fields for step i (or null to leave that hand).
 * Fields equal to the last ones set are skipped, and runs of frames with no change are stepped in one call.
 */
export function stepAlternate(hands, frames, left, right) {
  const last = { left: {}, right: {} };
  let pending = 0;
  const flush = () => { for (; pending > 0; pending -= 120) iw('ecs', 'step', { count: Math.min(120, pending) }); pending = 0; };
  const apply = (side, fields) => {
    const changed = Object.fromEntries(Object.entries(fields ?? {}).filter(([k, v]) => JSON.stringify(last[side][k]) !== JSON.stringify(v)));
    if (Object.keys(changed).length) { flush(); setHand(hands, side, changed); Object.assign(last[side], changed); }
    pending++;
  };
  iw('ecs', 'pause');
  try {
    for (let i = 0; i < frames; i++) { apply('left', left(i)); apply('right', right(i)); }
    flush();
  } finally {
    iw('ecs', 'resume');
  }
}

/** The dev gesture log lines ("[input] <event> <json>") since a timestamp (ms since epoch). */
export function inputLog(since = 0) {
  const result = iw('browser', 'logs', { pattern: '^\\[input\\]', since, count: 200 });
  const logs = Array.isArray(result) ? result : result.logs ?? [];
  return logs.map((l) => {
    const m = /^\[input\] (\S+) (.*)$/.exec(l.message ?? l.text ?? '');
    return m ? { event: m[1], data: JSON.parse(m[2]), at: l.timestamp } : null;
  }).filter(Boolean);
}

/** Clicks the landing page's Enter button (a real click, so audio unlocks) and waits for the session. */
export async function enterXR() {
  if (iw('xr', 'status').sessionActive) return;
  // The landing page's own "Enter" (the emulator also shows an "Enter XR" button).
  const enter = iw('browser', 'snapshot').elements.find((e) => e.role === 'button' && e.name === 'Enter');
  if (!enter) throw new Error('no Enter button on the page');
  const r = iw('browser', 'interact', { steps: [{ action: 'click', ref: enter.ref }] });
  if (r.failure) throw new Error(r.failure.message);
  for (let i = 0; i < 40 && !iw('xr', 'status').sessionActive; i++) await sleep(250);
  if (!iw('xr', 'status').sessionActive) throw new Error('XR session did not start');
}

/** The reach spot for the current headset pose, in XR-origin metres: 0.45 m ahead (level), 0.15 m below the eye. */
export function reachSpot() {
  const { position: p, orientation: q } = iw('xr', 'get-transform', { device: 'headset' });
  // Forward (-Z) rotated by the head quaternion, flattened to the floor plane.
  const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  const len = Math.hypot(fx, fz) || 1;
  return [p.x + (fx / len) * 0.45, p.y - 0.15, p.z + (fz / len) * 0.45];
}

/**
 * Runs `fn` (a function, or its source) in the page with `arg` and returns its JSON result. Uses
 * `iwsdk browser run`, so the dev session must be started with --allow-browser-automation. The script
 * file it needs is written next to this harness in the app copy being driven, and deleted afterwards.
 */
export function evalInPage(fn, arg = null, { timeout = 60000 } = {}) {
  const rel = 'tests/iwer/input/.eval-tmp.mjs';
  const file = join(APP, rel);
  writeFileSync(file, `export default async ({ page, frame }) => (frame ?? page).evaluate(${fn.toString()}, ${JSON.stringify(arg)});\n`);
  try {
    const out = execFileSync(process.execPath, [CLI, 'browser', 'run', rel, '--timeout', String(timeout)], {
      cwd: APP, encoding: 'utf8', timeout: timeout + 30000, maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(out);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    return parsed.data.result;
  } finally {
    rmSync(file, { force: true });
  }
}

/** Registers synthetic targets in the app's TargetRegistry (window.__stemlight, dev builds only). */
export const addTargets = (targets) => evalInPage((ts) => { for (const t of ts) window.__stemlight.ctx.registry.set(t); return ts.length; }, targets);
export const removeTargets = (ids) => evalInPage((list) => { for (const id of list) window.__stemlight.ctx.registry.remove(id); return list.length; }, ids);

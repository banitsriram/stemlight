import { Color, createSystem, World } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import projectOptions from 'virtual:iwsdk-project';
import { mountLanding } from '../web/landing';
import { createBus } from './bus';
import { createEngine } from './audio/engine';
import { loadPiece } from './audio/loader';
import { createParts } from './audio/parts';
import { initSequence, PIECE_ORDER } from './audio/sequence';
import { initLifecycle } from './audio/lifecycle';
import { createSave } from './audio/save/store';
import { initPersist } from './audio/save/persist';
import type { AppContext, PieceId } from './contracts';
import { createMockRegistry, installKeyMap } from './mock';
import { loadNoteGlyphs } from './world/notes/NoteGlyphs';
import { createNotesLayer } from './world/notes/lifecycle';
import { initShell } from './world/shell';
import { initSfx } from './ui/sfx';
import { initInput } from './input/system';

const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
world.scene.background = new Color('#07060F');

const bus = createBus();
const registry = createMockRegistry(); // the registry is a plain map; the mock is the real thing
const engine = createEngine(bus, { registry });
const parts = createParts(engine, bus); // cuts, count-in, guide track, recorded user parts
const save = await createSave(); // IndexedDB, read once before anything starts
const ctx: AppContext = {
  bus,
  transport: engine.transport,
  registry,
  audio: engine.audio,
  save,
};
initPersist(bus, save, engine, parts); // after createParts, so restores land on a cleared piece
const lifecycle = initLifecycle(bus, engine.transport, engine.audio);

const eye = new Vector3(), fwd = new Vector3(), up = new Vector3(), headQ = new Quaternion();
world.registerSystem(class AudioSystem extends createSystem() {
  update() {
    engine.update();
    parts.update();
    // HRTF listener follows the head; three copies the XR head pose into the world camera.
    const cam = world.camera;
    cam.getWorldPosition(eye);
    cam.getWorldDirection(fwd);
    up.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(headQ));
    engine.setListener([eye.x, eye.y, eye.z], [fwd.x, fwd.y, fwd.z], [up.x, up.y, up.z]);
  }
});

const camEye = new Vector3(), camFwd = new Vector3();
const shell = initShell(ctx, world.scene, () => {
  world.camera.getWorldPosition(camEye);
  world.camera.getWorldDirection(camFwd);
  return { eye: [camEye.x, camEye.y, camEye.z], yaw: Math.atan2(-camFwd.x, -camFwd.z) };
});
initSfx(ctx, shell.creatures.position);
world.registerSystem(class WorldSystem extends createSystem() {
  update(delta: number) { shell.update(delta); }
});
const gestures = initInput(ctx, world, { parts, beats: () => engine.beats().beats });
// DevHandPose and the gesture log are dev-only and never reach dist/ (F38).
if (import.meta.env.DEV) (await import('./dev/devInput')).initDevInput(world, ctx, gestures);
// The landing page shows at once; the first piece downloads and decodes behind it (cold start).
let markReady: () => void = () => {};
const pieceReady = new Promise<void>((resolve) => { markReady = resolve; });
// launchXR reports failure only to the console, so the outcome is read back from the world.
const enterXR = () => new Promise<void>((resolve, reject) => {
  world.launchXR();
  const poll = setInterval(() => {
    if (world.sessionRequestPending) return;
    clearInterval(poll);
    if (world.session) resolve();
    else reject(new Error('XR session did not start'));
  }, 50);
});
mountLanding(document.getElementById('landing') as HTMLElement, {
  unlock: () => ctx.audio.unlock(),
  // XR must be requested inside the Enter gesture, so it starts first and the music waits for the piece.
  enter: () => enterXR().then(async () => {
    if (world.session) lifecycle.watchSession(world.session);
    await pieceReady;
    ctx.transport.play();
  }),
});

const glyphs = await loadNoteGlyphs();
world.scene.add(glyphs.object);
const notes = createNotesLayer(ctx, glyphs, shell.creatures.position);
world.registerSystem(class NotesSystem extends createSystem() {
  update() {
    notes.update();
  }
});

// ?piece=<id> picks a piece; otherwise the first piece (dev only: the fixture if it's missing).
const piece = (new URLSearchParams(location.search).get('piece') ?? PIECE_ORDER[0]) as PieceId;
const manifest = await loadPiece(engine, bus, piece).catch((e) => {
  if (!import.meta.env.DEV) throw e; // never ship the synthetic fixture to a judge
  console.warn(`[audio] ${piece} unavailable, using the fixture`, e);
  return loadPiece(engine, bus, 'fixture' as PieceId);
});
markReady();
initSequence(engine, bus); // ponytail: until B's sequencer (biyon-57) owns the piece order
if (import.meta.env.DEV) {
  installKeyMap(ctx, manifest);
  // ?stats shows the overlay, ?fov (or key m) the 70×66° mask; __stemlight.stats() for scripted logs.
  const stats = (await import('./dev/stats')).initDevStats(world.renderer, world.camera, glyphs.object);
  world.registerSystem(class DevStatsSystem extends createSystem() {
    update() { stats.update(); }
  });
  Object.assign(window, { __stemlight: { ctx, engine, parts, lifecycle, stats: stats.sample, statsReset: stats.resetMax } });
}

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

initShell(ctx, world.scene);
const gestures = initInput(ctx, world);
// DevHandPose and the gesture log are dev-only and never reach dist/ (F38).
if (import.meta.env.DEV) (await import('./dev/devInput')).initDevInput(world, ctx, gestures);
const glyphs = await loadNoteGlyphs();
world.scene.add(glyphs.object);
const notes = createNotesLayer(ctx, glyphs);
world.registerSystem(class NotesSystem extends createSystem() {
  update() {
    notes.update();
  }
});

// ?piece=<id> picks a piece (dev); otherwise the first piece, falling back to the fixture if it's missing.
const piece = (new URLSearchParams(location.search).get('piece') ?? PIECE_ORDER[0]) as PieceId;
const manifest = await loadPiece(engine, bus, piece).catch((e) => {
  console.warn(`[audio] ${piece} unavailable, using the fixture`, e);
  return loadPiece(engine, bus, 'fixture' as PieceId);
});
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
  enter: () => enterXR().then(() => {
    if (world.session) lifecycle.watchSession(world.session);
    ctx.transport.play();
  }),
});

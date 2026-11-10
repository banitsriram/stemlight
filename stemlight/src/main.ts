import { Color, createSystem, World } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import projectOptions from 'virtual:iwsdk-project';
import { mountLanding } from '../web/landing';
import { createBus } from './bus';
import { createEngine } from './audio/engine';
import { loadPiece } from './audio/loader';
import type { AppContext, PieceId } from './contracts';
import { createMockRegistry, createMockSave, installKeyMap } from './mock';
import { loadNoteGlyphs } from './world/notes/NoteGlyphs';
import { createNotesLayer } from './world/notes/lifecycle';
import { initShell } from './world/shell';

const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
world.scene.background = new Color('#07060F');

const bus = createBus();
const registry = createMockRegistry(); // the registry is a plain map; the mock is the real thing
const engine = createEngine(bus, { registry });
// ponytail: saving stays mocked until biyon-28 lands.
const ctx: AppContext = {
  bus,
  transport: engine.transport,
  registry,
  audio: engine.audio,
  save: createMockSave(),
};

const eye = new Vector3(), fwd = new Vector3(), up = new Vector3(), headQ = new Quaternion();
world.registerSystem(class AudioSystem extends createSystem() {
  update() {
    engine.update();
    // HRTF listener follows the head; three copies the XR head pose into the world camera.
    const cam = world.camera;
    cam.getWorldPosition(eye);
    cam.getWorldDirection(fwd);
    up.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(headQ));
    engine.setListener([eye.x, eye.y, eye.z], [fwd.x, fwd.y, fwd.z], [up.x, up.y, up.z]);
  }
});

initShell(ctx, world.scene);
const glyphs = await loadNoteGlyphs();
world.scene.add(glyphs.object);
const notes = createNotesLayer(ctx, glyphs);
world.registerSystem(class NotesSystem extends createSystem() {
  update() {
    notes.update();
  }
});

// ?piece=<id> picks a piece; the fixture stays the default until the rendered pieces land.
const piece = (new URLSearchParams(location.search).get('piece') ?? 'fixture') as PieceId;
const manifest = await loadPiece(engine, bus, piece);
if (import.meta.env.DEV) {
  installKeyMap(ctx, manifest);
  Object.assign(window, { __stemlight: { ctx, engine } });
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
  enter: () => enterXR().then(() => ctx.transport.play()),
});

import { Color, createSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { mountLanding } from '../web/landing';
import { createBus } from './bus';
import type { AppContext } from './contracts';
import { createMockAudio, createMockRegistry, createMockSave, createMockTransport, installKeyMap, loadFixture } from './mock';
import { loadNoteGlyphs } from './world/notes/NoteGlyphs';
import { createNotesLayer } from './world/notes/lifecycle';
import { initShell } from './world/shell';

const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
world.scene.background = new Color('#07060F');

const bus = createBus();
// ponytail: mocks ship until the real engine, gestures and saving land (biyon-8, 10, 28).
const ctx: AppContext = {
  bus,
  transport: createMockTransport(bus),
  registry: createMockRegistry(),
  audio: createMockAudio(),
  save: createMockSave(),
};

initShell(ctx, world.scene);
const glyphs = await loadNoteGlyphs();
world.scene.add(glyphs.object);
const notes = createNotesLayer(ctx, glyphs);
world.registerSystem(class NotesSystem extends createSystem() {
  update() {
    notes.update();
  }
});

const manifest = await loadFixture(bus);
if (import.meta.env.DEV) installKeyMap(ctx, manifest);

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

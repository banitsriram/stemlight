import { Color, createSystem, SessionMode, World } from '@iwsdk/core';
import { AddEquation, AdditiveBlending, CustomBlending, type Material, type Mesh, OneFactor, Quaternion, SrcAlphaFactor, Vector3, ZeroFactor } from 'three';
import projectOptions from 'virtual:iwsdk-project';
import { COPY, mountLanding } from '../web/landing';
import { createBus } from './bus';
import { createEngine } from './audio/engine';
import { loadPiece } from './audio/loader';
import { createParts } from './audio/parts';
import { SONGS, TUTORIAL_PIECE } from './audio/sequence';
import { initLifecycle } from './audio/lifecycle';
import { createSave } from './audio/save/store';
import { initPersist } from './audio/save/persist';
import type { AppContext, PieceId } from './contracts';
import { createMockRegistry, installKeyMap } from './mock';
import { loadNoteGlyphs } from './world/notes/NoteGlyphs';
import { createNotesLayer } from './world/notes/lifecycle';
import { initShell, reachSpot } from './world/shell';
import { SEA } from './world/deepsea';
import { initSfx } from './ui/sfx';
import { initStory } from './story';
import { endCardLines, endCardSprite } from './story/sequencer';
import { initInput } from './input/system';
import { initRemake } from './ui/remake';
import { initSongs } from './ui/remake/songs';

/** The Starry Night world's credit, shown with the others under the song picker. */
const WORLD_CREDIT = 'Starry Night world: after Vincent van Gogh, The Starry Night (1889), public domain; painted in code.';

const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
world.scene.background = new Color(SEA.abyss);

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
const head = () => {
  world.camera.getWorldPosition(camEye);
  world.camera.getWorldDirection(camFwd);
  return { eye: [camEye.x, camEye.y, camEye.z] as [number, number, number], yaw: Math.atan2(-camFwd.x, -camFwd.z) };
};
const shell = initShell(ctx, world.scene, head, world.renderer);
const story = initStory(ctx, world.scene, head, reachSpot, shell.creatures.position, () => pickerUp()); // the picker ends the tutorial
const endCard = endCardSprite();
world.scene.add(endCard.sprite);
initSfx(ctx, shell.creatures.position);
world.registerSystem(class WorldSystem extends createSystem() {
  update(delta: number) { shell.update(delta); story.update(); }
});
const gestures = initInput(ctx, world, { parts, beats: () => engine.beats().beats });
let pickerUp = () => false; // the song picker hides the play surfaces while it's up (bound below)
const remake = initRemake(ctx, world.scene, { world, parts, head, beats: () => engine.beats(), hidden: () => pickerUp() }); // ribbon, lane, pads, reset shell
// DevHandPose and the gesture log are dev-only and never reach dist/ (F38).
if (import.meta.env.DEV) (await import('./dev/devInput')).initDevInput(world, ctx, gestures);
// The landing page shows at once; the first piece downloads and decodes behind it (cold start).
let markReady: () => void = () => {};
const pieceReady = new Promise<void>((resolve) => { markReady = resolve; });
// launchXR reports failure only to the console, so the outcome is read back from the world.
// 'ar' is a passthrough session (immersive-ar): the room shows wherever no world is drawn.
const enterXR = (mode: 'vr' | 'ar') => new Promise<void>((resolve, reject) => {
  world.launchXR({ sessionMode: mode === 'ar' ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR });
  const poll = setInterval(() => {
    if (world.sessionRequestPending) return;
    clearInterval(poll);
    if (world.session) resolve();
    else reject(new Error('XR session did not start'));
  }, 50);
});
const landingRoot = document.getElementById('landing') as HTMLElement;
let lastMode: 'vr' | 'ar' = 'vr'; // Resume re-enters the mode the player chose
const landing = {
  unlock: () => ctx.audio.unlock(),
  /** Whether this browser can start a passthrough session (the landing page's second button). */
  canPassthrough: async () => { try { return (await navigator.xr?.isSessionSupported('immersive-ar')) ?? false; } catch { return false; } },
  // XR must be requested inside the Enter gesture, so it starts first and the music waits for the piece.
  enter: (mode: 'vr' | 'ar' = lastMode) => enterXR(mode).then(async () => {
    lastMode = mode;
    const session = world.session;
    if (session) {
      shell.worlds.setMode(mode === 'ar'); // a passthrough session opens on the room
      lifecycle.watchSession(session);
      shell.worlds.warm(); // VR renders with multiview: compile the hidden worlds' shaders for it now, not at the first change
      // Leaving VR pauses (lifecycle); the page offers Resume, which re-enters where the music stopped.
      session.addEventListener('end', () => mountLanding(landingRoot, landing, COPY.resume));
    }
    await pieceReady;
    if (songs.isOpen()) return; // back from a pause with the song picker up: it's still there
    if (startAtPicker) { startAtPicker = false; songs.open('start'); return; }
    ctx.transport.play();
  }),
};
mountLanding(landingRoot, landing);

const glyphs = await loadNoteGlyphs();
world.scene.add(glyphs.object);
const notes = createNotesLayer(ctx, glyphs, shell.creatures.position);
/**
 * Glows add light but must not add alpha: in a passthrough session the frame starts see-through, and additive
 * blending's alpha would turn every glow quad solid (dark patches over the room). Same colour, alpha left alone;
 * harmless in VR, where alpha is ignored. Re-checked every 30 frames for materials made later (a new piece).
 */
let blendCheck = 0;
const keepAlpha = (m: Material) => {
  if (m.blending !== AdditiveBlending) return;
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = m.premultipliedAlpha ? OneFactor : SrcAlphaFactor;
  m.blendDst = OneFactor;
  m.blendSrcAlpha = ZeroFactor;
  m.blendDstAlpha = OneFactor;
};
world.registerSystem(class NotesSystem extends createSystem() {
  update() {
    if (blendCheck-- <= 0) {
      blendCheck = 30;
      world.scene.traverse((o) => { const m = (o as Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) keepAlpha(x); });
    }
    shell.pulse(notes.update() - 1); // the plankton brighten on the beat
    // The song picker is a blank lobby (sir, 18 Nov): no world, instruments or notes behind the choices.
    shell.hide(pickerUp());
    glyphs.object.visible = !pickerUp();
  }
});

// The songs (18 Nov): when a song ends (the tutorial song first) the picker opens and plays the song touched.
// It listens before the first piece loads, so it knows the current song. banit's end card carries the credits.
const songs = initSongs(ctx, world.scene, {
  world, songs: SONGS, head,
  frames: () => { const v = remake.view(); return { seat: v.seat, play: v.play }; },
  load: (id) => loadPiece(engine, bus, id),
  fadeOut: (sec) => engine.fadeOut(sec),
  card: endCard,
  creditLines: (c) => ['Credits', ...endCardLines(c).slice(3), WORLD_CREDIT],
  worlds: shell.worlds,
});
pickerUp = songs.isOpen;
// ?piece=<id> plays that piece first (dev only: the fixture if it's missing); otherwise the tutorial song, or the
// picker for a returning player (tutorial done).
const asked = new URLSearchParams(location.search).get('piece') as PieceId | null;
let startAtPicker = !asked && ctx.save.load().tutorialDone;
const piece = asked ?? TUTORIAL_PIECE;
const manifest = await loadPiece(engine, bus, piece).catch((e) => {
  if (!import.meta.env.DEV) throw e; // never ship the synthetic fixture to a judge
  console.warn(`[audio] ${piece} unavailable, using the fixture`, e);
  return loadPiece(engine, bus, 'fixture' as PieceId);
});
markReady();
if (import.meta.env.DEV) {
  installKeyMap(ctx, manifest);
  // ?stats shows the overlay, ?fov (or key m) the 70×66° mask; __stemlight.stats() for scripted logs.
  const stats = (await import('./dev/stats')).initDevStats(world.renderer, world.camera, glyphs.object);
  world.registerSystem(class DevStatsSystem extends createSystem() {
    update() { stats.update(); }
  });
  Object.assign(window, { __stemlight: { world, ctx, engine, parts, lifecycle, story, songs, landing, worlds: shell.worlds, stats: stats.sample, statsReset: stats.resetMax } });
}

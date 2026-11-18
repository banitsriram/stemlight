// The song picker (18 Nov, sir's design): bubbles in reach and in view, a touch picks only when it's meant, the songs
// bubble opens the picker only when held, looking at a bubble never summons, the play surfaces hide while the picker
// is up, and the music can fade out before it opens.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createEngine } from '../../src/audio/engine.ts';
import { PIECE_ORDER, SONGS, TUTORIAL_PIECE } from '../../src/audio/sequence.ts';
import { SPEC, createGestureEngine } from '../../src/input/engine.ts';
import { createMockRegistry, createMockTransport } from '../../src/mock/index.ts';
import { toWorld } from '../../src/ui/remake/layout.ts';
import { PICKER, SONGS_BUBBLE, createPicker, mmss, songLabel, songsBubbleLocal } from '../../src/ui/remake/picker.ts';
import { createRemakeState } from '../../src/ui/remake/state.ts';
import { fakeContext } from './audio-fake.mjs';

const FRAME = { eye: [0, 1.2, 0], yaw: 0 };
const songs = SONGS.map((s) => ({ ...s }));
const tip = (at, hand = 'right', ok = true) => ({ hand, at, ok });
const away = [0.5, 0.2, 0.3]; // a fingertip resting well away from every bubble

test('songs: the tutorial song first, then Dvorak and Beethoven 7, each with its piece on disk', () => {
  assert.deepEqual(SONGS.map((s) => s.id), ['beethoven5', 'dvorak9', 'beethoven7']);
  assert.equal(TUTORIAL_PIECE, 'beethoven5');
  assert.deepEqual(PIECE_ORDER, ['beethoven5', 'dvorak9', 'beethoven7']);
  for (const s of SONGS) {
    const url = new URL(`../../public/pieces/${s.id}/manifest.json`, import.meta.url);
    assert.ok(existsSync(url), `${s.id}: manifest on disk`);
    assert.equal(JSON.parse(readFileSync(url, 'utf8')).id, s.id);
  }
});

test('labels: title, then composer and length', () => {
  assert.equal(mmss(83.625), '1:24');
  assert.equal(mmss(152.9997), '2:33');
  assert.equal(mmss(59.6), '1:00');
  assert.deepEqual(songLabel({ id: 'dvorak9', title: 'New World Symphony', composer: 'Dvořák', durationSec: 153 }), ['New World Symphony', 'Dvořák, 2:33']);
  assert.deepEqual(songLabel({ id: 'dvorak9', title: 'New World Symphony', composer: 'Dvořák' }), ['New World Symphony', 'Dvořák']);
});

test('layout: three bubbles inside the 70×66° view and 0.61 m reach, apart, left to right in song order; the songs bubble too', () => {
  const p = createPicker(songs);
  assert.deepEqual(p.bubbles(), [], 'closed: no bubbles');
  p.open(0, FRAME);
  const bs = p.bubbles(), eye = FRAME.eye;
  assert.equal(bs.length, 3);
  const check = (c, what) => {
    const d = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
    const yaw = Math.abs(Math.atan2(d[0], -d[2]) * 57.2958), pitch = Math.abs(Math.atan2(d[1], Math.hypot(d[0], d[2])) * 57.2958);
    assert.ok(yaw <= 35 && pitch <= 33 && Math.hypot(...d) <= 0.61, `${what}: yaw ${yaw.toFixed(1)}°, pitch ${pitch.toFixed(1)}°, ${Math.hypot(...d).toFixed(2)} m`);
  };
  bs.forEach((c, i) => check(c, songs[i].id));
  assert.ok(bs[0][0] < bs[1][0] && bs[1][0] < bs[2][0], 'left to right');
  for (let i = 1; i < 3; i++) {
    const gap = Math.hypot(bs[i][0] - bs[i - 1][0], bs[i][1] - bs[i - 1][1], bs[i][2] - bs[i - 1][2]) - 2 * PICKER.touch;
    assert.ok(gap > 0.03, `touch spheres ${i - 1} and ${i} leave ${(gap * 100).toFixed(1)} cm between them`);
  }
  check(toWorld(FRAME, songsBubbleLocal()), 'songs bubble');
  // The songs bubble mirrors the reset shell (layout RESET: 27 cm right, 2 cm down, 42 cm ahead).
  assert.deepEqual(toWorld(FRAME, songsBubbleLocal()).map((x) => +x.toFixed(3)), [-0.27, 1.18, -0.42]);
});

test('touch: a fingertip entering a bubble once armed picks that song; early, resting or untracked tips never do', () => {
  const p = createPicker(songs);
  p.open(10, FRAME);
  const [b5, dv, b7] = p.bubbles();
  assert.equal(p.touch(10, [tip(away)]), null, 'first sight, away');
  assert.equal(p.touch(10.3, [tip(dv)]), null, 'entering before the 0.8 s arm time picks nothing');
  assert.equal(p.touch(10.9, [tip(dv)]), null, 'still inside after arming: it came in early, so nothing');
  assert.equal(p.touch(11.0, [tip(away)]), null, 'leaves');
  assert.equal(p.touch(11.1, [tip(dv)]), 'dvorak9', 'comes back in: Dvorak');
  // A hand already resting inside a bubble when the picker opens must leave first.
  const q = createPicker(songs);
  q.open(0, FRAME);
  assert.equal(q.touch(0, [tip(b7, 'left')]), null);
  assert.equal(q.touch(2, [tip(b7, 'left')]), null, 'resting inside since it opened: nothing');
  assert.equal(q.touch(2.1, [tip(away, 'left')]), null);
  assert.equal(q.touch(2.2, [tip(b7, 'left')]), 'beethoven7');
  // Untracked or low-confidence tips never pick, and a closed picker picks nothing.
  const r = createPicker(songs);
  r.open(0, FRAME);
  r.touch(0, [tip(away)]);
  assert.equal(r.touch(1, [tip(b5, 'right', false)]), null, 'untracked');
  r.close();
  assert.equal(r.touch(2, [tip(b5)]), null, 'closed');
});

test('hold: the songs bubble fires once after 0.8 s of touch; letting go early cancels; never while the picker is up', () => {
  const p = createPicker(songs);
  const at = toWorld(FRAME, songsBubbleLocal()), on = [tip(at)], off = [tip(away)];
  let r = { progress: 0, fire: false };
  for (let i = 0; i < 12; i++) r = p.hold(0.05, at, on); // 0.6 s
  assert.equal(r.fire, false);
  assert.ok(Math.abs(r.progress - 0.75) < 1e-9, `progress ${r.progress}`);
  assert.deepEqual(p.hold(0.05, at, off), { progress: 0, fire: false }, 'let go: back to 0');
  let fired = 0;
  for (let i = 0; i < 40; i++) fired += p.hold(0.05, at, on).fire ? 1 : 0; // 2 s held
  assert.equal(fired, 1, 'one hold opens the picker once');
  p.hold(0.05, at, off);
  for (let i = 0; i < 17; i++) fired += p.hold(0.05, at, on).fire ? 1 : 0;
  assert.equal(fired, 2, 'let go and hold again: it fires again');
  p.open(0, FRAME);
  for (let i = 0; i < 40; i++) assert.equal(p.hold(0.05, at, on).fire, false, 'picker up: the songs bubble does nothing');
  assert.equal(SONGS_BUBBLE.holdSec, 0.8);
});

test('targets: the open picker registers a song target per bubble, else the songs bubble, else nothing', () => {
  const p = createPicker(songs), at = [0, 1, -0.4];
  assert.deepEqual(p.targets(null), []);
  assert.deepEqual(p.targets(at).map((t) => `${t.id}:${t.kind}`), ['songs:song']);
  p.open(0, FRAME);
  assert.deepEqual(p.targets(at).map((t) => `${t.id}:${t.kind}`), ['song:beethoven5:song', 'song:dvorak9:song', 'song:beethoven7:song']);
});

test('looking at a song bubble never summons the creature seated behind it', () => {
  const eye = [0, 1.6, 0];
  const bubble = { id: 'songs', kind: 'song', center: [-0.27, 1.58, -0.42], radius: SONGS_BUBBLE.radius };
  const dirTo = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], l = Math.hypot(...d); return d.map((x) => x / l); };
  const head = { pos: eye, dir: dirTo(bubble.center) };
  const run = (targets) => {
    const bus = createBus(), summons = [];
    bus.on('gaze:summon', (e) => summons.push(e.stem));
    const engine = createGestureEngine(bus, {});
    for (let i = 0; i < 120; i++) engine.step({ t: i / 60, hands: { left: null, right: null }, head }, targets);
    return summons;
  };
  // A creature 5° off the line of sight, 2 m out (inside the 12° summon cone), is summoned without the bubble and
  // never with it: the bubble is nearer the gaze.
  const a = (5 * Math.PI) / 180, [dx, dy, dz] = head.dir;
  const off = [dx * Math.cos(a) - dz * Math.sin(a), dy, dx * Math.sin(a) + dz * Math.cos(a)];
  const behind = { id: 'creature:vln', kind: 'creature', stem: 'vln', radius: 0.25, center: [eye[0] + off[0] * 2, eye[1] + off[1] * 2, eye[2] + off[2] * 2] };
  assert.deepEqual(run([behind]), ['vln'], 'no bubble: the look summons it');
  assert.deepEqual(run([behind, bubble]), [], 'with the bubble nearer the gaze: nothing');
  assert.ok(SPEC.summonAngleDeg > 0);
});

test('while the picker is up the play surfaces hide and register nothing', () => {
  const bus = createBus(), registry = createMockRegistry(), transport = createMockTransport(bus);
  const ctx = { bus, registry, transport, save: { load: () => ({ palette: 'default' }) } };
  const parts = { cuts: () => [], taking: () => null, regionHits: () => [], countIn: () => null };
  let hidden = false;
  const state = createRemakeState(ctx, { parts, head: () => FRAME, hidden: () => hidden, loadNotes: async () => [] });
  const m = JSON.parse(readFileSync(new URL('../../public/pieces/beethoven5/manifest.json', import.meta.url)));
  bus.emit('piece:ready', { id: 'beethoven5', manifest: m });
  assert.equal(state.update(0.016).visible, true);
  assert.ok(registry.all().some((t) => t.kind === 'reset'), 'the reset shell registers while a song plays');
  hidden = true;
  assert.equal(state.update(0.016).visible, false);
  assert.deepEqual(registry.all().filter((t) => t.kind !== 'creature'), [], 'picker up: no reset shell, playhead or instrument targets');
});

test('fadeOut: the music fades, then the transport pauses; play() starts again; idle resolves at once', async () => {
  const bus = createBus(), ctx = fakeContext();
  const engine = createEngine(bus, { createContext: () => ctx, fetchBytes: async () => new ArrayBuffer(48000 * 10) });
  const stems = ['vln', 'vla_vc', 'cb', 'fl', 'reeds', 'hn', 'brass', 'perc'];
  await engine.load('fixture', {
    id: 'fixture', title: 't', composer: 'c', durationSec: 10, stems: stems.map((id, i) => ({ id, file: `stems/${id}.opus`, homeSeat: [i, 1, -2], pitchRange: [40, 80] })),
    scale: { tonic: 60, steps: [0, 2, 4, 5, 7, 9, 11] }, replace: [], credits: [],
  }, { tempo: [{ t: 0, bpm: 120 }], beats: [0, 0.5], downbeats: [0] }, '/pieces/fixture');
  await engine.fadeOut(0.01); // not playing: nothing to fade
  engine.transport.play();
  assert.equal(engine.transport.playing(), true);
  const starts = ctx.starts.length;
  await engine.fadeOut(0.02);
  assert.equal(engine.transport.playing(), false, 'paused after the fade');
  engine.transport.play();
  assert.equal(engine.transport.playing(), true);
  assert.ok(ctx.starts.length > starts, 'play() starts the stems again');
});

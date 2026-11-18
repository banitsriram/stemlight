// Tutorial steps, nudges, returning-user skip, and the piece sequence with its end card (biyon-55, 56, 57).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createTutorial, NUDGE_SEC, SKIP_AFTER_NUDGES, STEPS } from '../../src/story/tutorial.ts';
import { hasSavedChanges } from '../../src/story/index.ts';
import { initSequencer, END_CARD_SEC, endCardLines } from '../../src/story/sequencer.ts';
import { readFileSync } from 'node:fs';

const fakeSave = (s = {}) => {
  let state = { version: 1, tutorialDone: false, perPiece: {}, palette: 'default', ...s };
  return { load: () => state, patch: (p) => { state = { ...state, ...p }; } };
};

const mem = (v = 0) => ({ v, get() { return this.v; }, set(i) { this.v = i; } });

test('a reload mid-tutorial picks up at the same step', () => {
  const m = mem(), bus = createBus();
  createTutorial(bus, fakeSave(), m).start(0);
  bus.emit('gaze:summon', { stem: 'vln' });
  bus.emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0 });
  const afterReload = createTutorial(createBus(), fakeSave(), m); // same device memory, fresh page
  afterReload.start(0);
  assert.equal(afterReload.step(), 'return');
});

test('saved changes are recognised for the welcome-back caption', () => {
  const flat = { low: 0, mid: 0, high: 0 };
  const mix = (o = {}) => ({ mute: { vln: 'on' }, solo: null, eq: { vln: flat }, cuts: [], parts: [], ...o });
  assert.equal(hasSavedChanges(undefined), false);
  assert.equal(hasSavedChanges(mix()), false);
  assert.equal(hasSavedChanges(mix({ mute: { vln: 'locked' } })), true);
  assert.equal(hasSavedChanges(mix({ eq: { vln: { ...flat, low: 3 } } })), true);
});

test('the tutorial has fewer than 15 words', () => {
  const words = STEPS.map((s) => s.words.split(/\s+/).length).reduce((a, b) => a + b);
  assert.ok(words < 15, `${words} words`);
});

test('each step completes only on its own event, in order, then saves tutorialDone', () => {
  const bus = createBus(), save = fakeSave(), steps = [];
  bus.on('tutorial:step', ({ step }) => steps.push(step));
  const t = createTutorial(bus, save, mem());
  t.start(0);
  bus.emit('stem:solo', { stem: 'vln' }); // out of order: ignored
  assert.equal(t.step(), 'summon');
  bus.emit('gaze:summon', { stem: 'vln' });
  bus.emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0 });
  bus.emit('stem:mute', { stem: 'vln', state: 'held', lockProgress: 0.4 }); // still held: no skip past 'return'
  assert.equal(t.step(), 'return');
  bus.emit('stem:mute', { stem: 'vln', state: 'on', lockProgress: 0 });
  bus.emit('stem:mute', { stem: 'vln', state: 'locked', lockProgress: 1 });
  bus.emit('stem:solo', { stem: 'vln' });
  bus.emit('cut:add', { cut: { id: 'c', stem: 'perc', t0: 1, t1: 2 } });
  assert.equal(save.load().tutorialDone, false);
  bus.emit('part:hit', { cutId: 'c', instrument: 'pads', pitch: 50, vel: 90, t: 1, from: [0, 0, 0] });
  assert.deepEqual(steps, ['summon', 'silence', 'return', 'lock', 'solo', 'cut', 'pads', 'free']);
  assert.equal(save.load().tutorialDone, true);
});

test('idle: a nudge every 10 s, then the step moves on so nobody gets stuck', () => {
  const bus = createBus(), t = createTutorial(bus, fakeSave(), mem());
  t.start(0);
  assert.equal(t.tick(NUDGE_SEC - 0.1), 0);
  assert.equal(t.tick(NUDGE_SEC), 1);
  for (let n = 2; n <= SKIP_AFTER_NUDGES; n++) t.tick(NUDGE_SEC * n);
  assert.equal(t.step(), 'summon');
  t.tick(NUDGE_SEC * (SKIP_AFTER_NUDGES + 1));
  assert.equal(t.step(), 'silence');
  assert.equal(t.tick(NUDGE_SEC * (SKIP_AFTER_NUDGES + 1) + 1), 0); // the new step starts fresh
});

test('a returning user skips the tutorial', () => {
  const t = createTutorial(createBus(), fakeSave({ tutorialDone: true }), mem());
  t.start(0);
  assert.equal(t.step(), 'free');
  assert.equal(t.words(), '');
});

test('sequence: next piece, then the end card with every credit, then free play from the top', async (tt) => {
  tt.mock.timers.enable({ apis: ['setTimeout'] });
  const bus = createBus(), loads = [], cards = [];
  let plays = 0;
  const ctx = { bus, transport: { play: () => plays++ } };
  const credits = (id) => [{ text: `${id} credit`, licence: 'x', url: `u/${id}` }];
  initSequencer(ctx, ['a', 'b'], async (id) => { loads.push(id); bus.emit('piece:ready', { id, manifest: { credits: credits(id) } }); }, (c) => cards.push(c));
  bus.emit('piece:ready', { id: 'a', manifest: { credits: credits('a') } });
  bus.emit('piece:end', { id: 'a' });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(loads, ['b']);
  assert.equal(plays, 1);
  bus.emit('piece:end', { id: 'b' });
  const card = cards.at(-1);
  assert.ok(card.some((l) => l.includes('a credit')) && card.some((l) => l.includes('b credit')));
  assert.ok(card.some((l) => l.includes('Bravura')));
  tt.mock.timers.tick(END_CARD_SEC * 1000);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(loads, ['b', 'a']);
  assert.equal(cards.at(-1), null); // the card hides when the next piece is ready
  assert.equal(plays, 2);
});

test('the end card credits every shipped ASSETS row: scores, samples, CC BY-SA, font, impulse response', () => {
  const credits = ['beethoven5', 'dvorak9'].flatMap((id) => JSON.parse(readFileSync(`public/pieces/${id}/manifest.json`, 'utf8')).credits);
  const card = endCardLines(credits).join('\n');
  for (const must of ['Beethoven', 'piece 941', 'Dvořák', 'piece 1793', 'CC BY-SA 3.0', 'creativecommons.org/licenses/by-sa/3.0',
    'VSCO 2 Community Edition', 'CC0', 'Bravura', 'SIL Open Font License', 'impulse response']) {
    assert.ok(card.includes(must), `missing: ${must}`);
  }
});

test('a creature summoned before the music starts still completes the Look step', () => {
  const bus = createBus(), t = createTutorial(bus, fakeSave(), mem());
  bus.emit('gaze:summon', { stem: 'brass' });
  t.start(0);
  assert.equal(t.step(), 'silence');
});

test('the song picker ends the tutorial for good: no more steps, no ghost hands', () => {
  const save = fakeSave(), m = mem();
  const t = createTutorial(createBus(), save, m);
  t.start(0);
  assert.equal(t.step(), 'summon');
  t.finish();
  assert.equal(t.step(), 'free');
  assert.equal(t.words(), '', 'no caption, so the ghost hands hide');
  assert.equal(save.load().tutorialDone, true, 'kept: it does not come back next visit');
});

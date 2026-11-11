// Tutorial steps, nudges, returning-user skip, and the piece sequence with its end card (biyon-55, 56, 57).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../../src/bus.ts';
import { createTutorial, NUDGE_SEC, SKIP_AFTER_NUDGES, STEPS } from '../../src/story/tutorial.ts';
import { initSequencer, END_CARD_SEC } from '../../src/story/sequencer.ts';

const fakeSave = (s = {}) => {
  let state = { version: 1, tutorialDone: false, perPiece: {}, palette: 'default', ...s };
  return { load: () => state, patch: (p) => { state = { ...state, ...p }; } };
};

test('the tutorial has fewer than 15 words', () => {
  const words = STEPS.map((s) => s.words.split(/\s+/).length).reduce((a, b) => a + b);
  assert.ok(words < 15, `${words} words`);
});

test('each step completes only on its own event, in order, then saves tutorialDone', () => {
  const bus = createBus(), save = fakeSave(), steps = [];
  bus.on('tutorial:step', ({ step }) => steps.push(step));
  const t = createTutorial(bus, save);
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
  const bus = createBus(), t = createTutorial(bus, fakeSave());
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
  const t = createTutorial(createBus(), fakeSave({ tutorialDone: true }));
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

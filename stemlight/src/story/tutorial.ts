// Tutorial state machine (biyon-56). Each step waits for the event that proves the user did it.
// Ribbon and EQ steps are left out (audit 11 Nov: first-five-minutes MVP); the gestures still work.
import type { Bus, Events, SaveApi, TutorialStep } from '../contracts';

export const NUDGE_SEC = 10;
export const SKIP_AFTER_NUDGES = 3; // never a dead end: a step nobody completes moves on

/** Step order and the event that completes each one. */
export const STEPS: { step: TutorialStep; words: string; done: (k: keyof Events, e: any) => boolean }[] = [
  { step: 'summon', words: 'Look', done: (k) => k === 'gaze:summon' },
  { step: 'silence', words: 'Make a fist', done: (k, e) => k === 'stem:mute' && e.state === 'held' },
  { step: 'return', words: 'Open', done: (k, e) => k === 'stem:mute' && e.state === 'on' },
  { step: 'lock', words: 'Hold', done: (k, e) => k === 'stem:mute' && e.state === 'locked' },
  { step: 'solo', words: 'Pinch twice', done: (k, e) => k === 'stem:solo' && e.stem !== null },
  { step: 'cut', words: 'Pinch both, pull', done: (k) => k === 'cut:add' },
  { step: 'pads', words: 'Tap', done: (k) => k === 'part:hit' },
];

const WATCH: (keyof Events)[] = ['gaze:summon', 'stem:mute', 'stem:solo', 'cut:add', 'part:hit'];

export interface Tutorial {
  step(): TutorialStep;
  words(): string;
  /** Call each frame with seconds; returns how many nudges the current step has had. */
  tick(now: number): number;
  start(now: number): void;
}

/** Where an unfinished tutorial got to, kept on this device so a reload doesn't start it over. */
export interface StepMemory { get(): number; set(i: number): void }
const KEY = 'stemlight.tutorialStep';
export const localStepMemory: StepMemory = {
  get() { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } },
  set(i) { try { localStorage.setItem(KEY, String(i)); } catch { /* private mode: start over next time */ } },
};

export function createTutorial(bus: Pick<Bus, 'on' | 'emit'>, save: SaveApi, memory: StepMemory = localStepMemory): Tutorial {
  let i = save.load().tutorialDone ? STEPS.length : -1; // -1 until the music starts
  let since = 0, nudges = 0, clock = 0;

  const go = (next: number) => {
    i = next;
    memory.set(i);
    since = clock; nudges = 0;
    if (i >= STEPS.length) save.patch({ tutorialDone: true });
    bus.emit('tutorial:step', { step: i >= STEPS.length ? 'free' : STEPS[i].step });
  };
  for (const k of WATCH) bus.on(k, (e) => { if (i >= 0 && i < STEPS.length && STEPS[i].done(k, e)) go(i + 1); });

  return {
    step: () => (i < 0 ? 'summon' : i >= STEPS.length ? 'free' : STEPS[i].step),
    words: () => (i >= 0 && i < STEPS.length ? STEPS[i].words : ''),
    start(now) {
      clock = now;
      if (i < 0) go(Math.min(memory.get(), STEPS.length - 1));
    },
    tick(now) {
      clock = now;
      if (i < 0 || i >= STEPS.length) return 0;
      if (now - since >= NUDGE_SEC * (nudges + 1)) {
        nudges++;
        if (nudges > SKIP_AFTER_NUDGES) go(i + 1);
      }
      return nudges;
    },
  };
}

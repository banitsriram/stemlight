// Stand-ins for the audio engine, gestures and saving, until the real ones land (biyon-8, 10, 28).
import type {
  AppContext, AudioApi, Bus, Events, PieceId, PieceManifest, SaveApi, SaveState, StemId, Target,
  TargetRegistry, Transport,
} from '../contracts';

export function createMockTransport(bus: Bus, length = 20, now = () => performance.now() / 1000): Transport {
  let offset = 0, startedAt = 0, running = false;
  const time = () => (running ? Math.min(length, offset + now() - startedAt) : offset);
  const announce = () => bus.emit('transport:state', { playing: running, t: time() });
  return {
    time,
    duration: () => length,
    playing: () => running && time() < length,
    play() {
      if (running) return;
      startedAt = now();
      running = true;
      announce();
    },
    pause() {
      if (!running) return;
      offset = time();
      running = false;
      announce();
    },
    seek(t) {
      offset = Math.max(0, Math.min(length, t));
      startedAt = now();
      bus.emit('transport:seek', { t: offset });
    },
  };
}

export function createMockRegistry(): TargetRegistry {
  const targets = new Map<string, Target>();
  return {
    set: (t) => void targets.set(t.id, t),
    remove: (id) => void targets.delete(id),
    all: () => [...targets.values()],
  };
}

export function createMockAudio(): AudioApi {
  const context = new AudioContext();
  return {
    unlock: () => context.resume(),
    context: () => context,
    sfxOut: () => context.destination,
  };
}

export function createMockSave(): SaveApi {
  let state: SaveState = { version: 1, tutorialDone: false, perPiece: {}, palette: 'default' };
  return { load: () => state, patch: (p) => void (state = { ...state, ...p }) };
}

const FIXTURE = 'fixture' as PieceId; // deliberately outside the contract's PieceId: it never ships

/** Announces the fixture piece, as the real loader will for a real one. */
export async function loadFixture(bus: Bus): Promise<PieceManifest> {
  bus.emit('piece:load', { id: FIXTURE });
  const manifest: PieceManifest = await (await fetch('/pieces/fixture/manifest.json')).json();
  bus.emit('piece:ready', { id: FIXTURE, manifest });
  return manifest;
}

const STEMS: StemId[] = ['vln', 'vla_vc', 'cb', 'fl', 'reeds', 'hn', 'brass', 'perc', 'harp'];
const MUTES = ['held', 'locked', 'on'] as const;

/** Dev keyboard: one key per bus event. `]` picks the next stem for the stem events. */
export function installKeyMap({ bus, transport, audio }: AppContext, manifest: PieceManifest): void {
  let i = 0, mute = 0;
  const stem = () => STEMS[i];
  const cut = { id: 'mock-cut', stem: 'perc' as StemId, t0: 4, t1: 8 };
  const hit = { cutId: cut.id, instrument: 'pads' as const, pitch: 60, vel: 100, t: 5, from: [0, 1, -0.4] as [number, number, number] };

  const keys: { [K in keyof Events]: [string, () => Events[K]] } = {
    'piece:load': ['1', () => ({ id: FIXTURE })],
    'piece:ready': ['2', () => ({ id: FIXTURE, manifest })],
    'piece:end': ['3', () => ({ id: FIXTURE })],
    'transport:state': ['4', () => ({ playing: transport.playing(), t: transport.time() })],
    'transport:seek': ['5', () => ({ t: transport.time() })],
    beat: ['b', () => ({ index: 0, t: transport.time(), downbeat: true })],
    'hand:pose': ['p', () => ({ hand: 'right', tracked: true, confidence: 1, palm: [0.1, 1, -0.4], tip: [0.1, 1.05, -0.45], curl: 0, pinching: false })],
    'hand:near': ['n', () => ({ hand: 'right', targetId: `creature:${stem()}`, dist: 0.05 })],
    'hand:pinch': ['k', () => ({ hand: 'right', down: true, targetId: `creature:${stem()}` })],
    'gaze:summon': ['g', () => ({ stem: stem() })],
    'stem:mute': ['f', () => ({ stem: stem(), state: MUTES[mute++ % 3], lockProgress: 0 })],
    'stem:solo': ['s', () => ({ stem: stem() })],
    'stem:eq': ['e', () => ({ stem: stem(), low: 6, mid: 0, high: -6 })],
    'cut:preview': ['v', () => cut],
    'cut:add': ['c', () => ({ cut })],
    'cut:remove': ['x', () => ({ id: cut.id })],
    countin: ['i', () => ({ cutId: cut.id, beatsLeft: 4 })],
    'part:hit': ['h', () => hit],
    'reset:progress': ['r', () => ({ progress: 0.5 })],
    'app:reset': ['t', () => ({ piece: FIXTURE })],
    'app:pause': ['z', () => ({})],
    'app:resume': ['y', () => ({})],
    'tutorial:step': ['u', () => ({ step: 'summon' })],
    'songs:open': ['o', () => ({ why: 'shell' })],
    'songs:pick': ['j', () => ({ id: 'dvorak9' })],
  };

  addEventListener('keydown', (e) => {
    if (e.key === ']') i = (i + 1) % STEMS.length;
    // Space unlocks audio on first press (a key press counts as a user gesture), so pieces can be heard without XR.
    if (e.key === ' ') { e.preventDefault(); void audio.unlock().then(() => (transport.playing() ? transport.pause() : transport.play())); return; }
    for (const [name, [key, payload]] of Object.entries(keys)) {
      if (key === e.key) bus.emit(name as keyof Events, payload() as never);
    }
  });
}

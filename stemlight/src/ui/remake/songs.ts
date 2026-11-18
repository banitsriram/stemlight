// The songs (18 Nov, sir's design). The tutorial plays on Beethoven 5; when it ends the song picker opens: touch a
// bubble to play that song. The end of every song brings the picker back, with the credits under it on banit's end
// card (so his creatures go home and the tutorial caption hides, as they do for the end card). While a song plays,
// the small songs bubble on the left fades it out and opens the picker when touched and held. Returning players
// (tutorial done) start at the picker. This replaces the story sequencer's fixed order (src/story/sequencer.ts).
import { createSystem, type World } from '@iwsdk/core';
import type { Object3D, Sprite } from 'three';
import type { AppContext, Hand, PieceId, PieceManifest, Target, Vec3 } from '../../contracts';
import { toWorld, type Frame } from './layout.ts';
import { createPicker, songsBubbleLocal, type SongInfo, type Tip } from './picker.ts';
import { createPickerView, type WorldLook } from './pickerView.ts';

export interface SongsDeps {
  world: World;
  songs: readonly SongInfo[];
  head: () => { eye: Vec3; yaw: number };
  /** The remake's frames: the seat (the picker opens there) and the play frame (the songs bubble, by the reset shell). */
  frames: () => { seat: Frame; play: Frame };
  load: (id: PieceId) => Promise<unknown>;
  fadeOut: (sec: number) => Promise<void>;
  /** banit's end card, moved under the arc to carry the credits while the picker is up. */
  card: { sprite: Sprite; show(lines: string[] | null): void };
  creditLines: (credits: PieceManifest['credits']) => string[];
  /** Each song's manifest (title, length, credits), read before it is played. */
  manifestUrl?: (id: PieceId) => string;
  /** The worlds to choose from with the orbs under the songs (shell.ts worlds), if any. */
  worlds?: { list: readonly WorldLook[]; current(): string; set(id: string): void };
}

/** The credits card under the arc: 1 m ahead and 72 cm below the eye (36° down, clear of the bubbles), half size. */
const CARD_AT: Vec3 = [0, -0.72, 1.0];
const CARD_SCALE = 0.31;
const FADE_SEC = 0.6;

export function initSongs(ctx: AppContext, scene: Object3D, deps: SongsDeps) {
  const songs: SongInfo[] = deps.songs.map((s) => ({ ...s }));
  const worldList = deps.worlds?.list ?? [];
  const picker = createPicker(songs, worldList);
  const view = createPickerView(scene, songs, worldList);
  const credits = new Map<PieceId, PieceManifest['credits']>();
  const tips = new Map<Hand, Tip>();
  const registered = new Set<string>();
  const cardScale = deps.card.sprite.scale.clone();
  const now = () => performance.now() / 1000;
  let current: PieceId | null = null, last: PieceId | null = null, loading: PieceId | null = null;
  let passed = ctx.save.load().tutorialDone; // the songs bubble shows once the tutorial song has ended (or was done before)
  let fading = false, hold = 0, songsAt: Vec3 | null = null;

  const url = deps.manifestUrl ?? ((id: PieceId) => `/pieces/${id}/manifest.json`);
  songs.forEach((s, i) => {
    fetch(url(s.id))
      .then((r) => (r.ok ? (r.json() as Promise<PieceManifest>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m) => { s.durationSec = m.durationSec; credits.set(s.id, m.credits); view.label(i, s); })
      .catch((e) => console.warn(`[songs] ${s.id}: manifest unavailable`, e));
  });

  ctx.bus.on('piece:ready', ({ id, manifest }) => { current = id; credits.set(id, manifest.credits); });
  ctx.bus.on('piece:end', () => open('end'));
  ctx.bus.on('hand:pose', ({ hand, tracked, confidence, tip }) => { tips.set(hand, { hand, at: tip, ok: tracked && confidence >= 0.5 }); });

  function open(why: 'start' | 'end' | 'shell') {
    if (picker.isOpen()) return;
    passed = true;
    const f = deps.frames().seat;
    picker.open(now(), f);
    deps.card.sprite.position.set(...toWorld(f, CARD_AT));
    deps.card.sprite.scale.copy(cardScale).multiplyScalar(CARD_SCALE);
    deps.card.show(deps.creditLines(songs.flatMap((s) => credits.get(s.id) ?? [])));
    ctx.bus.emit('songs:open', { why });
  }

  async function choose(id: PieceId) {
    loading = id;
    ctx.bus.emit('songs:pick', { id });
    try {
      if (id !== current) await deps.load(id);
      ctx.transport.seek(0);
      picker.close();
      deps.card.show(null);
      last = id;
      ctx.transport.play();
    } catch (e) {
      console.error(`[songs] ${id} failed to load`, e); // the picker stays up: choose again
    } finally {
      loading = null;
    }
  }

  function sync(targets: Target[]) {
    const ids = new Set(targets.map((t) => t.id));
    for (const id of registered) if (!ids.has(id)) ctx.registry.remove(id);
    registered.clear();
    for (const t of targets) { ctx.registry.set(t); registered.add(t.id); }
  }

  deps.world.registerSystem(class SongsSystem extends createSystem() {
    update(delta: number) {
      const t = now(), list = [...tips.values()];
      songsAt = null;
      if (picker.isOpen()) {
        const id = picker.touch(t, list);
        if (id && !loading) void choose(id);
        const w = picker.touchWorld(t, list);
        if (w && deps.worlds) deps.worlds.set(w);
      } else if (passed && !fading && ctx.transport.playing()) {
        songsAt = toWorld(deps.frames().play, songsBubbleLocal());
        const h = picker.hold(delta, songsAt, list);
        hold = h.progress;
        if (h.fire) {
          fading = true;
          void deps.fadeOut(FADE_SEC).then(() => { fading = false; open('shell'); });
        }
      } else {
        hold = picker.hold(delta, null, list).progress;
      }
      sync(picker.targets(songsAt));
      const at = (id: PieceId | null) => songs.findIndex((s) => s.id === id);
      const world = deps.worlds ? worldList.findIndex((w) => w.id === deps.worlds!.current()) : -1;
      view.draw({ bubbles: picker.bubbles(), orbs: picker.orbs(), world, current: at(last ?? current), loading: at(loading), songsAt, hold, eye: deps.head().eye, clock: t });
    }
  });

  const api = {
    isOpen: () => picker.isOpen(),
    open,
    /** Dev and IWER checks read this. */
    state: () => ({ open: picker.isOpen(), current, last, loading, passed, hold, songsAt, bubbles: picker.bubbles(), orbs: picker.orbs(), world: deps.worlds?.current() ?? null, songs }),
  };
  return api;
}

// Remake surfaces (biyon-45 ribbon + playhead + lane, 46 hollow regions + ghost notes + cut preview,
// 47 pads + count-in ring + amber notes, 58 reset shell). Registers the playhead, lane, region, pad and
// reset targets the input engine reads, and draws them. main.ts calls initRemake once.
import { createSystem, type World } from '@iwsdk/core';
import type { Object3D } from 'three';
import type { AppContext } from '../../contracts';
import { ACCENT } from '../../world/creatures';
import { loadNoteGlyphs } from '../../world/notes/NoteGlyphs';
import { createRemakeState, type RemakeStateDeps } from './state.ts';
import { createRemakeView } from './view.ts';

export interface RemakeDeps extends RemakeStateDeps {
  /** The frame loop runs as an ECS system, so a paused-and-stepped world (IWER tests) steps it exactly. */
  world: World;
}

export function initRemake(ctx: AppContext, scene: Object3D, deps: RemakeDeps) {
  const state = createRemakeState(ctx, deps);
  const view = createRemakeView(scene, ctx.save.load().palette, ACCENT);
  // Our own glyph instance (banit's class and atlas, unchanged): its begin/end can't clash with the notes layer's.
  loadNoteGlyphs().then((g) => view.attachGlyphs(g)).catch((e) => console.warn('[remake] note glyphs unavailable', e));
  let last = state.update(0);
  deps.world.registerSystem(class RemakeSystem extends createSystem() {
    update(delta: number) {
      last = state.update(delta);
      view.draw(last, deps.head().eye);
    }
  });
  const handle = { state, view: () => last };
  if (import.meta.env.DEV) Object.assign(window, { __remake: handle }); // scripted IWER checks read the view
  return handle;
}

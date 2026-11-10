// Minimal piece order until B's sequencer (biyon-57) takes over: when a piece ends, load the next one
// and keep playing. Returns a stop function so the sequencer can switch this off.
import type { Bus, PieceId } from '../contracts';
import type { Engine } from './engine.ts';
import { loadPiece } from './loader.ts';

export const PIECE_ORDER: PieceId[] = ['beethoven5', 'dvorak9'];

export function initSequence(engine: Engine, bus: Bus, order: PieceId[] = PIECE_ORDER): () => void {
  let busy = false;
  return bus.on('piece:end', async ({ id }) => {
    const i = order.indexOf(id);
    if (busy || i < 0 || i + 1 >= order.length) return;
    busy = true;
    try {
      await loadPiece(engine, bus, order[i + 1]);
      engine.transport.play();
    } catch (e) {
      console.warn('[sequence] next piece failed to load', e);
    } finally {
      busy = false;
    }
  });
}

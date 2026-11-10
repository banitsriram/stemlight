// Keeps each piece's mix, cuts and recorded parts in SaveState, and restores them on piece:ready by
// re-announcing them on the bus, so B's visuals and the engine both pick them up (biyon-28, F22).
import type { Bus, MixState, PieceId, StemId } from '../../contracts';
import type { Engine } from '../engine.ts';
import type { Parts } from '../parts.ts';
import type { Save } from './store.ts';

export function initPersist(bus: Bus, save: Save, engine: Engine, parts: Parts): { snapshot(): MixState | null } {
  let piece: PieceId | null = null;
  let restoring = false;

  const snapshot = (): MixState => {
    const m = engine.mix();
    const mute = {} as MixState['mute'];
    // A held fist is a moment, not a state worth keeping; only locks persist.
    for (const [s, v] of Object.entries(m.mute) as [StemId, MixState['mute'][StemId]][]) mute[s] = v === 'locked' ? 'locked' : 'on';
    return { mute, solo: m.solo, eq: structuredClone(m.eq), cuts: parts.cuts(), parts: parts.parts() };
  };

  const store = () => {
    if (!piece || restoring) return;
    save.patch({ perPiece: { ...save.load().perPiece, [piece]: snapshot() } });
  };

  const restore = (m: MixState) => {
    restoring = true;
    try {
      parts.restore(m.cuts ?? [], m.parts ?? []);
      for (const cut of m.cuts ?? []) bus.emit('cut:add', { cut });
      for (const [stem, state] of Object.entries(m.mute ?? {}) as [StemId, string][]) {
        if (state === 'locked') bus.emit('stem:mute', { stem, state: 'locked', lockProgress: 1 });
      }
      if (m.solo) bus.emit('stem:solo', { stem: m.solo });
      for (const [stem, eq] of Object.entries(m.eq ?? {}) as [StemId, MixState['eq'][StemId]][]) {
        if (eq && (eq.low || eq.mid || eq.high)) bus.emit('stem:eq', { stem, ...eq });
      }
    } finally {
      restoring = false;
    }
  };

  bus.on('piece:ready', ({ id }) => {
    piece = id;
    const saved = save.load().perPiece[id];
    if (saved) restore(saved);
  });
  bus.on('stem:mute', ({ state }) => { if (state !== 'held') store(); });
  bus.on('stem:solo', store);
  bus.on('stem:eq', store);
  bus.on('cut:add', store);
  bus.on('cut:remove', store);
  bus.on('part:hit', store);
  bus.on('transport:state', store); // also catches the end of a take
  bus.on('app:reset', ({ piece: p }) => {
    const rest = { ...save.load().perPiece };
    delete rest[p];
    save.patch({ perPiece: rest });
  });
  bus.on('app:pause', () => { store(); void save.flush(); });

  return { snapshot: () => (piece ? snapshot() : null) };
}

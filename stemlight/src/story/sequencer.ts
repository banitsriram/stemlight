// Story sequencer (biyon-57): Beethoven, then Dvořák, then an end card with the credits, then free play
// loops the pieces. Replaces the audio stand-in (src/audio/sequence.ts).
import type { AppContext, PieceId, PieceManifest } from '../contracts';
import { textSprite } from './card.ts';

export const END_CARD_SEC = 14;
const OWN_CREDIT = 'Note symbols: Bravura font, SIL Open Font License 1.1. Reverb impulse response, sound effects and visuals made in code.';

export function endCardLines(credits: PieceManifest['credits']): string[] {
  return [
    'Thank you for listening',
    'Your mix is saved for next time. Any song, coming soon.',
    '',
    ...credits.map((c) => `${c.text} ${c.url}`),
    OWN_CREDIT,
  ];
}

/** load(id) loads a piece (piece:ready fires); play() starts the transport. */
export function initSequencer(
  ctx: AppContext,
  order: PieceId[],
  load: (id: PieceId) => Promise<unknown>,
  showCard: (lines: string[] | null) => void,
) {
  const credits = new Map<PieceId, PieceManifest['credits']>();
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  ctx.bus.on('piece:ready', ({ id, manifest }) => { credits.set(id, manifest.credits); showCard(null); });

  const next = async (id: PieceId) => {
    busy = true;
    try {
      await load(id);
      ctx.transport.play();
    } catch (e) {
      console.error('[sequencer] next piece failed to load', e);
    } finally {
      busy = false;
    }
  };

  ctx.bus.on('piece:end', ({ id }) => {
    const i = order.indexOf(id);
    if (busy || i < 0) return;
    if (i + 1 < order.length) { void next(order[i + 1]); return; }
    // Last piece: the end card, then free play starts again from the first piece.
    showCard(endCardLines(order.flatMap((p) => credits.get(p) ?? [])));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void next(order[0]), END_CARD_SEC * 1000);
  });
}

let cardUp = false;
/** True while the end card shows: the tutorial caption hides and the summoned creature goes home, so nothing covers it. */
export const endCardUp = () => cardUp;

/** The end card as a world sprite, 2.2 m ahead at eye height. */
export function endCardSprite() {
  const card = textSprite(1.6, 2048, 1.6);
  card.sprite.position.set(0, 1.35, -2.2);
  card.sprite.visible = false;
  return {
    sprite: card.sprite,
    show(lines: string[] | null) {
      card.sprite.visible = cardUp = !!lines;
      if (lines) card.set(lines, 0.034);
    },
  };
}

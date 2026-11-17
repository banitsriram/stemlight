// The songs (18 Nov, sir): the tutorial plays on Beethoven 5; when it ends a picker offers every song, and the end
// of each song brings the picker back (src/ui/remake/songs.ts). Short names for the picker's labels.
import type { PieceId } from '../contracts';

export interface Song { id: PieceId; title: string; composer: string }

export const TUTORIAL_PIECE: PieceId = 'beethoven5';
export const SONGS: readonly Song[] = [
  { id: 'beethoven5', title: 'Symphony No. 5', composer: 'Beethoven' },
  { id: 'dvorak9', title: 'New World Symphony', composer: 'Dvořák' },
  { id: 'beethoven7', title: 'Symphony No. 7', composer: 'Beethoven' },
];
/** Every shipped piece, in picker order (for tools and checks that walk them all). */
export const PIECE_ORDER: PieceId[] = SONGS.map((s) => s.id);

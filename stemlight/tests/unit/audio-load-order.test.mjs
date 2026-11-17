// main.ts can't be imported in node (it starts the world), so this guards one ordering bug in its source:
// on 12 Nov the first piece loaded before the story sequencer subscribed to piece:ready, so the first
// piece's credits (Beethoven) never reached the end card. Since 18 Nov the song picker (initSongs) listens
// instead: it must know the first song is current, and carry its credits under the picker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('the song picker subscribes before the first piece loads', () => {
  const src = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const seq = src.indexOf('initSongs(ctx');
  const first = src.indexOf('await loadPiece(');
  assert.ok(seq > 0 && first > 0, 'both calls found');
  assert.ok(seq < first, 'initSongs comes before the first loadPiece');
});

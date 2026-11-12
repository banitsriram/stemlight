// main.ts can't be imported in node (it starts the world), so this guards one ordering bug in its source:
// on 12 Nov the first piece loaded before the story sequencer subscribed to piece:ready, so the first
// piece's credits (Beethoven) never reached the end card.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('the sequencer subscribes before the first piece loads', () => {
  const src = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const seq = src.indexOf('initSequencer(');
  const first = src.indexOf('await loadPiece(');
  assert.ok(seq > 0 && first > 0, 'both calls found');
  assert.ok(seq < first, 'initSequencer comes before the first loadPiece');
});

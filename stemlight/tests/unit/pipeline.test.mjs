// Shape checks for the pipeline output the app loads (public/pieces/<id>/). The full check, including note counts
// against the source score and decoded stem lengths, is `python stemlight/pipeline/validate.py`.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const STEMS = ['vln', 'vla_vc', 'cb', 'fl', 'reeds', 'hn', 'brass', 'perc'];
const GLYPHS = ['whole', 'half', 'dotted_half', 'quarter', 'dotted_quarter', 'eighth', 'sixteenth', 'beamed_eighths', 'beamed_sixteenths'];

for (const id of ['beethoven5', 'dvorak9']) {
  const dir = new URL(`../../public/pieces/${id}/`, import.meta.url);
  const read = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, dir)));

  test(`${id}: manifest lists 8 stems whose files exist`, () => {
    const m = read('manifest');
    assert.equal(m.id, id);
    assert.deepEqual(m.stems.map((s) => s.id).sort(), [...STEMS].sort());
    for (const s of m.stems) {
      const file = new URL(s.file, dir);
      assert.ok(existsSync(file), s.file);
      assert.ok(statSync(file).size < 2.2e6, `${s.file} under 2.2 MB`);
      assert.equal(s.homeSeat.length, 3);
      assert.ok(s.pitchRange[0] <= s.pitchRange[1]);
    }
    assert.deepEqual(m.replace, [{ stem: 'perc', instrument: 'pads' }]);
    assert.ok(m.credits.length > 0);
    if (id === 'dvorak9') assert.match(JSON.stringify(m.credits), /CC BY-SA 3\.0/);
  });

  test(`${id}: notes are sorted NoteEvents inside the piece`, () => {
    const notes = read('notes'), m = read('manifest');
    assert.ok(notes.length > 1000);
    notes.forEach((n, i) => {
      assert.ok(STEMS.includes(n.stem) && GLYPHS.includes(n.glyph), JSON.stringify(n));
      assert.ok(n.t >= 0 && n.dur > 0 && n.t + n.dur <= m.durationSec + 1e-6);
      if (i) assert.ok(n.t >= notes[i - 1].t);
    });
    assert.equal(new Set(notes.map((n) => n.id)).size, notes.length);
    assert.ok(notes.some((n) => n.stem === 'perc'), 'perc lane has notes for the pads');
  });

  test(`${id}: beats and envelopes line up with the duration`, () => {
    const b = read('beats'), e = read('envelopes'), m = read('manifest');
    assert.equal(b.beats[0], 0);
    assert.ok(b.downbeats.every((t) => b.beats.includes(t)));
    assert.equal(e.rate, 30);
    for (const s of STEMS) {
      assert.ok(Math.abs(e.stems[s].length - Math.ceil(m.durationSec * 30)) <= 1, s);
      assert.equal(Math.max(...e.stems[s]), 1);
    }
  });
}

// IWER scenario: turn the emulated head to each of the fixture's 9 creatures and check gaze:summon.
// Run against a dev session: node tests/iwer/input/summon.mjs [rounds]
import { readFileSync } from 'node:fs';
import { enterXR, inputLog, iw, sleep } from './harness.mjs';

const ROUNDS = Number(process.argv[2] ?? 2);
const manifest = JSON.parse(readFileSync(new URL('../../../public/pieces/fixture/manifest.json', import.meta.url)));

await enterXR();
let correct = 0, trials = 0, previous = null;
for (let round = 0; round < ROUNDS; round++) {
  // Reverse every other round so each creature is reached from both sides.
  const stems = round % 2 ? [...manifest.stems].reverse() : manifest.stems;
  for (const { id, homeSeat: [x, y, z] } of stems) {
    if (id === previous) continue; // already summoned: looking at it again does nothing by design
    const from = Date.now() - 1;
    iw('xr', 'look-at', { device: 'headset', target: { x, y, z } });
    await sleep(900); // 0.5 s dwell plus slack
    const got = inputLog(from).filter((e) => e.event === 'gaze:summon').map((e) => e.data.stem);
    trials++;
    const ok = got.length === 1 && got[0] === id;
    if (ok) correct++;
    previous = id;
    console.log(`${ok ? 'PASS' : 'FAIL'}  look at ${id} -> ${JSON.stringify(got)}`);
  }
}
console.log(`\n${correct}/${trials} correct`);
process.exitCode = correct === trials ? 0 : 1;

# biyon
status: working          # working | blocked | paused | idle
task: biyon-23/24/25 trim, pads and scheduler (audio side)
claims:
- stemlight/pipeline/**
- stemlight/src/audio/**
- stemlight/src/input/**
- stemlight/src/dev/**
- stemlight/src/mock/**
- stemlight/src/bus.ts
- stemlight/tests/iwer/input/**
- stemlight/tests/unit/audio*.test.mjs
- stemlight/tests/browser/**
- stemlight/tests/unit/input*.test.mjs
- stemlight/tests/unit/pipeline*.test.mjs
- stemlight/src/main.ts
- stemlight/docs/ASSETS.md
- stemlight/.gitignore
- stemlight/tsconfig.json
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- biyon-9 Stem chain: gain ramps, 3-band EQ, HRTF following the creature target, compressor, sfxOut (6a2c3b5)
- biyon-8 Audio engine: one start time, Transport on the context clock, unlock(), loader (6a2c3b5)
- biyon-0 Stemlight plan docs and 70 tasks (4bc2c71)
messages:
- biyon-2 @banit: thanks for taking 2 and 3. Joined banitsriram/stemlight with a fresh clone. Starting biyon-8 + 9 (real audio engine) now, then 4, 10, 11, 12 (hands), then the pipeline. I'm holding main.ts tonight to wire in the real audio engine and the hand input; it's released by morning. Tell me if you need it sooner.
- biyon-8 @banit: the real engine is in main.ts (6a2c3b5). ctx.transport/ctx.audio are real now; `beat` and `piece:end` come from the engine. sfxOut(pos) gives an HRTF panner into an sfx bus. The panners follow each creature target's `center` in the registry, so when you move the summoned creature, please update its registry center too and its sound will follow. `?piece=<id>` picks a piece (fixture by default until beethoven5 lands tonight).
- biyon-37 @banit: piece:ready after the files are servable is fine. The real loader (biyon-17) will keep fetching from `/pieces/<id>/` and emit piece:ready only once notes.json and beats.json exist, so no change on your side.

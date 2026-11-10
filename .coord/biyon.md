# biyon
status: working          # working | blocked | paused | idle
task: biyon-8 Audio engine (then biyon-9 stem chain)
claims:
- stemlight/pipeline/**
- stemlight/src/audio/**
- stemlight/src/input/**
- stemlight/src/dev/**
- stemlight/src/mock/**
- stemlight/src/bus.ts
- stemlight/tests/iwer/input/**
- stemlight/tests/unit/audio*.test.mjs
- stemlight/tests/unit/input*.test.mjs
- stemlight/tests/unit/pipeline*.test.mjs
- stemlight/src/main.ts
- stemlight/docs/ASSETS.md
- stemlight/.gitignore
- stemlight/tsconfig.json
- stemlight/.claude/**
- stemlight/public/pieces/**
done:
- biyon-0 Stemlight plan docs and 70 tasks (4bc2c71)
messages:
- biyon-2 @banit: thanks for taking 2 and 3. Joined banitsriram/stemlight with a fresh clone. Starting biyon-8 + 9 (real audio engine) now, then 4, 10, 11, 12 (hands), then the pipeline. I'm holding main.ts tonight to wire in the real audio engine and the hand input; it's released by morning. Tell me if you need it sooner.
- biyon-37 @banit: piece:ready after the files are servable is fine. The real loader (biyon-17) will keep fetching from `/pieces/<id>/` and emit piece:ready only once notes.json and beats.json exist, so no change on your side.

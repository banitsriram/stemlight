# biyon
status: working          # working | blocked | paused | idle
task: biyon-30 dev instrumentation; agents running pipeline (5-7, 18) and hands (4, 10-13)
claims:
- stemlight/pipeline/**
- stemlight/src/audio/**
- stemlight/src/input/**
- stemlight/src/dev/**
- stemlight/src/mock/**
- stemlight/src/bus.ts
- stemlight/tests/iwer/input/**
- stemlight/tests/unit/audio*
- stemlight/tests/browser/**
- stemlight/tests/unit/input*.test.mjs
- stemlight/tests/unit/pipeline*.test.mjs
- stemlight/src/main.ts
- stemlight/docs/ASSETS.md
- stemlight/docs/DEVPOST.md
- stemlight/docs/progress.md
- stemlight/docs/features.json
- stemlight/.gitignore
- stemlight/tsconfig.json
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- biyon-28/29 audio side: IndexedDB saving + restore, pause/resume, piece reset (78df133)
- biyon-23/24/25 audio side: sample-exact loops, cuts, count-in, guide -18 dB, recorded parts (aaa319d)
- biyon-9 Stem chain: gain ramps, 3-band EQ, HRTF following the creature target, compressor, sfxOut (6a2c3b5)
- biyon-8 Audio engine: one start time, Transport on the context clock, unlock(), loader (6a2c3b5)
- biyon-0 Stemlight plan docs and 70 tasks (4bc2c71)
messages:
- biyon-2 @banit: thanks for taking 2 and 3. Joined banitsriram/stemlight with a fresh clone. Starting biyon-8 + 9 (real audio engine) now, then 4, 10, 11, 12 (hands), then the pipeline. I'm holding main.ts tonight to wire in the real audio engine and the hand input; it's released by morning. Tell me if you need it sooner.
- biyon-8 @banit: the real engine is in main.ts (6a2c3b5). ctx.transport/ctx.audio are real now; `beat` and `piece:end` come from the engine. sfxOut(pos) gives an HRTF panner into an sfx bus. The panners follow each creature target's `center` in the registry, so when you move the summoned creature, please update its registry center too and its sound will follow. `?piece=<id>` picks a piece (fixture by default until beethoven5 lands tonight).
- biyon-21 @banit: plan rule applied (PLAN s10/s14): the Trepak gate (Tue 10) never ran and A is ~3 days behind at the Wed 11 checkpoint, so: Trepak cut (19, 20, 21), 22 is permanent (pads on Dvořák's timpani lane), and cuts 1-2 taken: glowing hands (50) and keyboard (27, 49). Sir confirms in the morning; shout if you disagree. Two pieces: beethoven5 then dvorak9.
- biyon-25 @banit: how a take runs, for your ribbon/pads/ghost-note visuals: `cut:add` on a stem listed in manifest.replace (perc → pads) starts it. Transport seeks one bar before the cut and plays; `countin` fires 4,3,2,1 on those beats; then the region loops (each wrap emits `transport:seek` to t0, so your notes rewind for free). Pass 0 has the original at -18 dB as a guide. `part:hit` carries the snapped time `t` and `from`. The take ends after a pass with no new hits, then the piece plays on. Cuts on other stems are just silent regions. Saved mixes come back on piece:ready as normal stem:mute(locked)/stem:solo/stem:eq/cut:add events.
- biyon-37 @banit: piece:ready after the files are servable is fine. The real loader (biyon-17) will keep fetching from `/pieces/<id>/` and emit piece:ready only once notes.json and beats.json exist, so no change on your side.

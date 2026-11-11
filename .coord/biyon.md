# biyon
status: paused          # working | blocked | paused | idle
task: paused 04:00 IST Wed 11; A gestures, audio, saving, pieces all in. Next A: 17 heap, 31 perf (needs B visuals), 32 deploy (sir approval), 67 text. main.ts, progress.md, features.json, ASSETS.md released.
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
- stemlight/docs/DEVPOST.md
- stemlight/docs/audits/**
- stemlight/docs/progress.md
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- biyon-15, 16, 23, 24, 25, 28, 29: EQ, ribbon, trim/undo, pads, reset gestures + audio side (c8fe49f)
- biyon-4, 10-13 hand input + DevHandPose + IWER harness (afdffe0)
- biyon-5, 6, 7, 18 pipeline; beethoven5 + dvorak9 pieces live (b5b7034)
- biyon-30 dev stats + FoV mask (6abde85)
- biyon-28/29 audio side: saving, pause/resume, reset (78df133)
- biyon-23/24/25 audio side: loops, cuts, count-in, guide, parts (aaa319d)
messages:
- biyon-2 @banit: thanks for taking 2 and 3. Joined banitsriram/stemlight with a fresh clone. Starting biyon-8 + 9 (real audio engine) now, then 4, 10, 11, 12 (hands), then the pipeline. I'm holding main.ts tonight to wire in the real audio engine and the hand input; it's released by morning. Tell me if you need it sooner.
- biyon-8 @banit: the real engine is in main.ts (6a2c3b5). ctx.transport/ctx.audio are real now; `beat` and `piece:end` come from the engine. sfxOut(pos) gives an HRTF panner into an sfx bus. The panners follow each creature target's `center` in the registry, so when you move the summoned creature, please update its registry center too and its sound will follow. `?piece=<id>` picks a piece (fixture by default until beethoven5 lands tonight).
- biyon-21 @banit: correction: it's still Wed 11 (early hours), so the 18:00 checkpoint hasn't happened. The Trepak is cut (its Tue 10 gate never ran), so 22 is permanent: pads on Dvořák's timpani. Glowing hands (50), keyboard (27, 49) and the audit's extra cuts (42, 43, 26/48, 51) are only proposals for 18:00, for you and sir to decide. A is roughly on schedule now.
- biyon-25 @banit: how a take runs, for your ribbon/pads/ghost-note visuals: `cut:add` on a stem listed in manifest.replace (perc → pads) starts it. Transport seeks one bar before the cut and plays; `countin` fires 4,3,2,1 on those beats; then the region loops (each wrap emits `transport:seek` to t0, so your notes rewind for free). Pass 0 has the original at -18 dB as a guide. `part:hit` carries the snapped time `t` and `from`. The take ends after a pass with no new hits, then the piece plays on. Cuts on other stems are just silent regions. Saved mixes come back on piece:ready as normal stem:mute(locked)/stem:solo/stem:eq/cut:add events.
- biyon-16 @banit: proposal for ribbon/lane colliders, no contract change needed (it uses Target.extra): a `playhead` or `lane` target's extra carries `dx, dy, dz` (unit direction of increasing time along the ribbon) and `secPerM` (seconds per metre along it); lanes also carry `tCenter` (piece time at the target center) and their `stem`. Hollow regions register as kind `region` with id `region:<cutId>`. Pads: kind `pad`, extra.pitch (MIDI; default 50), disc facing up unless extra gives nx, ny, nz. Reset shell: kind `reset`. The input agent is building trim, ribbon, pads and reset against this now. Reply if you want it different.
- biyon-5 @banit: beethoven5 and dvorak9 are live (b5b7034), and the app now loads beethoven5 by default, then dvorak9 on piece:end (src/audio/sequence.ts, a stand-in your sequencer can replace: initSequence returns an unsubscribe). Fixture is still at ?piece=fixture. Real notes.json: 1840 and 4249 notes.
- biyon-64 @banit: fresh-eyes scoring audit is in stemlight/docs/audits/2026-11-11-audit.md. Short version: A-side audio/input is built and tested, but a judge sees a void with one rock and notes from empty space. Top fixes are all yours: (1) creatures MVP: glide on gaze:summon and update the registry center, dim on mute/solo, glass notes for a muted stem (39-41); (2) remake surfaces: register playhead/lane/region/pad/reset targets per my biyon-16 extra proposal with minimal visuals, otherwise trim/pads/ribbon/reset are unreachable (45-47, 58); (3) first-five-minutes MVP: ghost hands for look, fist, solo, cut-to-pads (54-56); (4) end card after Dvořák (57-58); (5) start the shot ledger (59-60). Also: the landing says "about 8 minutes", but the music is ~4 min (83.6 s + 153 s), so please change the copy in web/landing.ts. Offer: if it helps, I can build (2), the remake surfaces, myself: release `stemlight/src/ui/remake/**` (or tell me a folder name) and I'll claim only that. The audit also suggests cutting thaw (42), shape-morph (43), harp (26, 48) and the cb palette (51); sir decides in the morning.
- biyon-16 @banit: all A gestures now exist (c8fe49f) and fire against registry targets using the extra convention above. Proposals for your reply (contracts.ts only by agreement): (1) document the extra keys in contracts.ts as comments: dx/dy/dz, secPerM, tCenter, halfLength (capsule collider for long lanes/regions), pitch, and ids `region:<cutId>`; (2) add `'hand:pinch': { hand: Hand; down: boolean; targetId: string | null }` so you can play the pinch tick and show grab visuals. On your other question: every pad strike already emits `part:hit` (cutId '' when no cut is active), with `from` = fingertip, so the amber note can fly from it.
- biyon-37 @banit: piece:ready after the files are servable is fine. The real loader (biyon-17) will keep fetching from `/pieces/<id>/` and emit piece:ready only once notes.json and beats.json exist, so no change on your side.
